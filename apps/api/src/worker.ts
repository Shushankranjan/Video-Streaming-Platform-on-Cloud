import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import { pipeline } from 'node:stream/promises';
import { v4 as uuid } from 'uuid';
import { pool } from './db/index.js';
import { config } from './lib/config.js';
import { s3Client, outputBucket, ingressBucket } from './lib/s3.js';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  receiveTranscodeJob,
  deleteTranscodeJob,
  sqsClient,
} from './lib/sqs.js';
import {
  SQSClient,
  ChangeMessageVisibilityCommand,
} from '@aws-sdk/client-sqs';

const POLL_INTERVAL_MS = 5000;
// Extend visibility every N ms while transcoding to prevent re-delivery
const VISIBILITY_HEARTBEAT_MS = 120_000;
const VISIBILITY_EXTENSION_SECONDS = 300;

async function downloadFromS3(bucket: string, key: string, localPath: string) {
  const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!Body) throw new Error('Empty S3 body');
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  await pipeline(Body as NodeJS.ReadableStream, fs.createWriteStream(localPath));
}

async function uploadToS3(localPath: string, key: string) {
  const fileStream = fs.createReadStream(localPath);
  await s3Client.send(new PutObjectCommand({
    Bucket: outputBucket,
    Key: key,
    Body: fileStream,
    ContentType: getContentType(key),
  }));
}

function getContentType(key: string) {
  if (key.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (key.endsWith('.ts')) return 'video/mp2t';
  return 'application/octet-stream';
}

async function transcodeVideo(inputPath: string, outputDir: string) {
  return new Promise<void>((resolve, reject) => {
    const variants = [
      { name: '360p', width: 640, height: 360, videoBitrate: '800k', audioBitrate: '128k' },
      { name: '720p', width: 1280, height: 720, videoBitrate: '2500k', audioBitrate: '192k' },
      { name: '1080p', width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '256k' },
    ];

    const masterManifest = path.join(outputDir, 'master.m3u8');
    let command = ffmpeg(inputPath);

    variants.forEach((variant, index) => {
      const variantPath = path.join(outputDir, variant.name);
      fs.mkdirSync(variantPath, { recursive: true });
      const variantPlaylist = path.join(variantPath, 'playlist.m3u8');
      command = command
        .output(variantPlaylist)
        .videoCodec('libopenh264')
        .audioCodec('aac')
        .size(`${variant.width}x${variant.height}`)
        .videoBitrate(variant.videoBitrate)
        .audioBitrate(variant.audioBitrate)
        .outputOptions([
          '-start_number 0',
          '-hls_time 4',
          '-hls_list_size 0',
          '-f hls',
          '-hls_segment_filename', path.join(variantPath, 'segment_%03d.ts'),
        ]);
    });

    command
      .on('start', (cmd) => {
        console.log('Running FFmpeg:', cmd);
      })
      .on('error', (err) => {
        reject(err);
      })
      .on('end', async () => {
        // Write master manifest
        const lines = [
          '#EXTM3U',
          ...variants.map(v => {
            const bandwidth = parseInt(v.videoBitrate) * 1000 + parseInt(v.audioBitrate) * 1000;
            return `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${v.width}x${v.height}\n${v.name}/playlist.m3u8`;
          }),
        ];
        fs.writeFileSync(masterManifest, lines.join('\n') + '\n');
        resolve();
      })
      .run();
  });
}

async function processJob(videoId: string, originalKey: string) {
  const jobId = uuid();
  const workDir = path.join(config.outputDir, 'work', jobId);
  const inputPath = path.join(workDir, 'input' + path.extname(originalKey));
  const outputDir = path.join(workDir, 'out');
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    await pool.query(`UPDATE jobs SET status = 'processing', updated_at = NOW() WHERE video_id = $1`, [videoId]);
    await pool.query(`UPDATE videos SET status = 'processing' WHERE id = $1`, [videoId]);

    if (config.useLocalStorage && fs.existsSync(originalKey)) {
      fs.copyFileSync(originalKey, inputPath);
    } else {
      await downloadFromS3(ingressBucket, originalKey, inputPath);
    }

    await transcodeVideo(inputPath, outputDir);

    // Upload variants to output bucket or copy to local output dir
    const manifestKey = `videos/${videoId}/master.m3u8`;
    const outputVideoDir = path.join(config.outputDir, manifestKey, '..');
    fs.mkdirSync(outputVideoDir, { recursive: true });
    fs.copyFileSync(path.join(outputDir, 'master.m3u8'), path.join(outputVideoDir, 'master.m3u8'));

    const variants = ['360p', '720p', '1080p'];
    for (const variant of variants) {
      const variantSrc = path.join(outputDir, variant);
      const variantDest = path.join(outputVideoDir, variant);
      fs.mkdirSync(variantDest, { recursive: true });
      for (const file of fs.readdirSync(variantSrc)) {
        fs.copyFileSync(path.join(variantSrc, file), path.join(variantDest, file));
      }
    }

    if (!config.useLocalStorage) {
      await uploadToS3(path.join(outputDir, 'master.m3u8'), manifestKey);
      for (const variant of variants) {
        for (const file of fs.readdirSync(path.join(outputDir, variant))) {
          await uploadToS3(path.join(outputDir, variant, file), `videos/${videoId}/${variant}/${file}`);
        }
      }
    }

    // Notify API webhook
    const webhookUrl = `${config.apiBaseUrl}/videos/${videoId}/processed`;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, status: 'ready', manifestKey: `videos/${videoId}/master.m3u8` }),
    });
    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }

    await pool.query(`UPDATE jobs SET status = 'ready', updated_at = NOW() WHERE video_id = $1`, [videoId]);
    console.log(`Video ${videoId} transcoded successfully`);
  } catch (err: any) {
    console.error(`Failed to process video ${videoId}`, err);
    await pool.query(`UPDATE jobs SET status = 'failed', message = $1, updated_at = NOW() WHERE video_id = $2`, [err.message, videoId]);
    await pool.query(`UPDATE videos SET status = 'failed' WHERE id = $1`, [videoId]);
    try {
      await fetch(`${config.apiBaseUrl}/videos/${videoId}/processed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, status: 'failed' }),
      });
    } catch {}
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// ── DB-polling mode (local dev) ───────────────────────────────────────────────

async function pollDb() {
  const result = await pool.query(
    `SELECT j.video_id, v.original_s3_key
     FROM jobs j
     JOIN videos v ON v.id = j.video_id
     WHERE j.status = 'pending'
     ORDER BY j.created_at ASC
     LIMIT 1`,
  );
  if (result.rowCount === 0) return;
  const row = result.rows[0];
  await pool.query(`UPDATE jobs SET status = 'queued', updated_at = NOW() WHERE video_id = $1`, [row.video_id]);
  await processJob(row.video_id, row.original_s3_key);
}

// ── SQS mode (production) ─────────────────────────────────────────────────────

async function pollSqs() {
  const received = await receiveTranscodeJob();
  if (!received) return;  // queue empty — long-poll already waited up to 20s

  const { message, job } = received;
  const receiptHandle = message.ReceiptHandle!;

  // Heartbeat: extend visibility timeout so the message is not re-delivered
  // while a potentially long transcode is in progress.
  const heartbeat = setInterval(async () => {
    try {
      await sqsClient.send(new ChangeMessageVisibilityCommand({
        QueueUrl: config.sqsQueueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: VISIBILITY_EXTENSION_SECONDS,
      }));
    } catch (err) {
      console.warn('Failed to extend SQS visibility', err);
    }
  }, VISIBILITY_HEARTBEAT_MS);

  try {
    await processJob(job.videoId, job.originalS3Key);
    // Delete only on success — failed jobs become visible again after timeout
    // so the DLQ can catch them after maxReceiveCount retries.
    await deleteTranscodeJob(receiptHandle);
  } catch (err) {
    console.error('SQS job failed, message will be redelivered or sent to DLQ', err);
  } finally {
    clearInterval(heartbeat);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });

  if (config.useSqs) {
    console.log(`Worker started in SQS mode, polling: ${config.sqsQueueUrl}`);
    // SQS long-poll — no artificial delay needed between iterations
    while (true) {
      try {
        await pollSqs();
      } catch (err) {
        console.error('SQS polling error', err);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } else {
    console.log('Worker started in DB-poll mode (local dev)...');
    while (true) {
      try {
        await pollDb();
      } catch (err) {
        console.error('DB polling error', err);
      }
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

main().catch((err) => {
  console.error('Worker crashed', err);
  process.exit(1);
});
