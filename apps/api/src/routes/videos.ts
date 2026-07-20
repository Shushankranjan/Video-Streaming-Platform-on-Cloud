import { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { config } from '../lib/config.js';
import { getPresignedUploadUrl } from '../lib/s3.js';
import { enqueueTranscodeJob } from '../lib/sqs.js';
import { getSignedStreamUrl } from '../lib/cloudfront.js';

const uploadUrlSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  contentType: z.enum(['video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo']).default('video/mp4'),
});

const processedWebhookSchema = z.object({
  videoId: z.string().uuid(),
  status: z.enum(['ready', 'failed']),
  manifestKey: z.string().optional(),
});

const progressSchema = z.object({
  progressSeconds: z.number().int().min(0),
});

type IdParams = { Params: { id: string } };

function getFieldValue(fields: Record<string, any>, name: string): string | undefined {
  const field = fields[name];
  if (!field) return undefined;
  return Array.isArray(field) ? field[0].value : field.value;
}

export default async function videoRoutes(fastify: FastifyInstance) {
  // List videos
  fastify.get('/', { onRequest: fastify.authenticate }, async (request) => {
    const result = await pool.query(
      `SELECT v.id, v.user_id, v.title, v.description, v.original_s3_key, v.manifest_url, v.status, v.created_at,
              COALESCE(wh.progress_seconds, 0) as progress_seconds
       FROM videos v
       LEFT JOIN watch_history wh ON wh.video_id = v.id AND wh.user_id = $1
       ORDER BY v.created_at DESC`,
      [request.user.userId]
    );
    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      originalS3Key: row.original_s3_key,
      manifestUrl: row.manifest_url,
      status: row.status,
      createdAt: row.created_at,
      progressSeconds: row.progress_seconds,
    }));
  });

  // Get video details
  fastify.get<IdParams>('/:id', { onRequest: fastify.authenticate }, async (request, reply) => {
    const result = await pool.query(
      `SELECT v.*, COALESCE(wh.progress_seconds, 0) as progress_seconds
       FROM videos v
       LEFT JOIN watch_history wh ON wh.video_id = v.id AND wh.user_id = $1
       WHERE v.id = $2`,
      [request.user.userId, request.params.id]
    );
    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Video not found' });
    }
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      originalS3Key: row.original_s3_key,
      manifestUrl: row.manifest_url,
      status: row.status,
      createdAt: row.created_at,
      progressSeconds: row.progress_seconds,
    };
  });

  // Get pre-signed upload URL (S3 path)
  fastify.post('/upload-url', { onRequest: fastify.authenticate }, async (request) => {
    const body = uploadUrlSchema.parse(request.body);
    const videoId = uuid();
    const key = `uploads/${request.user.userId}/${videoId}/${body.title}`;

    await pool.query(
      `INSERT INTO videos (id, user_id, title, description, original_s3_key, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [videoId, request.user.userId, body.title, body.description || null, key]
    );

    // Create a transcoding job record (always, for audit trail)
    await pool.query(
      `INSERT INTO jobs (video_id, status) VALUES ($1, 'pending')`,
      [videoId],
    );

    // Enqueue to SQS (prod) — worker picks it up and transcodes
    if (config.useSqs) {
      await enqueueTranscodeJob({ videoId, originalS3Key: key });
    }

    const { url, fields } = await getPresignedUploadUrl(key, body.contentType);
    return { url, fields, key, videoId };
  });

  // Direct local upload fallback
  fastify.post('/upload', { onRequest: fastify.authenticate }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const videoId = uuid();
    const userId = request.user.userId;
    const title = getFieldValue(data.fields, 'title') || data.filename;
    const description = getFieldValue(data.fields, 'description') || null;
    const ext = path.extname(data.filename) || '.mp4';
    const key = `uploads/${userId}/${videoId}/${title}${ext}`;
    const localPath = path.join(config.uploadDir, key);

    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    await pipeline(data.file, fs.createWriteStream(localPath));

    await pool.query(
      `INSERT INTO videos (id, user_id, title, description, original_s3_key, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [videoId, userId, title, description, localPath]
    );

    await pool.query(
      `INSERT INTO jobs (video_id, status) VALUES ($1, 'pending')`,
      [videoId],
    );

    // SQS not used for local file uploads (local dev path only)
    return { videoId, key: localPath, status: 'pending' };
  });

  // Webhook: mark video processed
  fastify.post<IdParams>('/:id/processed', async (request, reply) => {
    const body = processedWebhookSchema.parse(request.body);
    if (body.videoId !== request.params.id) {
      return reply.status(400).send({ error: 'Video ID mismatch' });
    }

    // Persist the raw S3 key for future CloudFront re-signing
    const manifestS3Key = body.manifestKey ?? null;
    // Local-dev convenience URL (ignored when CloudFront is configured)
    const manifestUrl = manifestS3Key
      ? `${config.apiBaseUrl}/streams/${manifestS3Key}`
      : null;

    await pool.query(
      `UPDATE videos SET status = $1, manifest_s3_key = $2, manifest_url = $3 WHERE id = $4`,
      [body.status, manifestS3Key, manifestUrl, body.videoId],
    );

    await pool.query(
      `UPDATE jobs SET status = $1, updated_at = NOW() WHERE video_id = $2`,
      [body.status, body.videoId],
    );

    return { success: true };
  });

  // Get stream URL (CloudFront signed in prod, local static in dev)
  fastify.get<IdParams>('/:id/stream', { onRequest: fastify.authenticate }, async (request, reply) => {
    const result = await pool.query(
      'SELECT status, manifest_s3_key, manifest_url FROM videos WHERE id = $1 AND user_id = $2',
      [request.params.id, request.user.userId],
    );
    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Video not found' });
    }
    const video = result.rows[0];
    if (video.status !== 'ready') {
      return reply.status(400).send({ error: 'Video not ready', status: video.status });
    }

    // Generate a short-lived signed URL on every request (stateless, no DB writes)
    const streamUrl = video.manifest_s3_key
      ? getSignedStreamUrl(video.manifest_s3_key)
      : video.manifest_url;

    return { streamUrl };
  });

  // Update watch progress
  fastify.post<IdParams>('/:id/progress', { onRequest: fastify.authenticate }, async (request, reply) => {
    const body = progressSchema.parse(request.body);
    const userId = request.user.userId;
    const videoId = request.params.id;

    // Check video exists
    const videoResult = await pool.query('SELECT id FROM videos WHERE id = $1', [videoId]);
    if (videoResult.rowCount === 0) {
      return reply.status(404).send({ error: 'Video not found' });
    }

    // Write to Redis
    await redis.setex(`progress:${userId}:${videoId}`, 3600, String(body.progressSeconds));

    // Also write to DB immediately for simplicity
    await pool.query(
      `INSERT INTO watch_history (user_id, video_id, progress_seconds, watched_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, video_id)
       DO UPDATE SET progress_seconds = EXCLUDED.progress_seconds, watched_at = NOW()`,
      [userId, videoId, body.progressSeconds]
    );

    return { success: true };
  });

}
