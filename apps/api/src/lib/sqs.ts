/**
 * sqs.ts — AWS SQS helpers for the transcoding job queue.
 *
 * In production (USE_SQS=true):
 *   - The API sends a message to SQS when a video is uploaded.
 *   - The FFmpeg worker receives messages from SQS, processes the video, then
 *     deletes the message.
 *
 * In local dev (USE_SQS=false):
 *   - The worker falls back to polling the `jobs` table in PostgreSQL.
 */

import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { config } from './config.js';

export interface TranscodeJobMessage {
  videoId: string;
  originalS3Key: string;
}

function buildSqsClient(): SQSClient {
  // On ECS Fargate the task role provides credentials automatically.
  return new SQSClient({ region: config.sqsRegion });
}

export const sqsClient = buildSqsClient();

/**
 * Enqueue a transcode job message.
 */
export async function enqueueTranscodeJob(job: TranscodeJobMessage): Promise<void> {
  const command = new SendMessageCommand({
    QueueUrl: config.sqsQueueUrl,
    MessageBody: JSON.stringify(job),
    MessageGroupId: job.videoId,             // for FIFO queues (if used)
    MessageDeduplicationId: job.videoId,     // prevents duplicate processing
  });
  await sqsClient.send(command);
}

/**
 * Poll SQS for a single message (long-poll, up to 20s).
 * Returns null when the queue is empty.
 */
export async function receiveTranscodeJob(): Promise<{ message: Message; job: TranscodeJobMessage } | null> {
  const command = new ReceiveMessageCommand({
    QueueUrl: config.sqsQueueUrl,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,              // long-polling — reduces empty responses
    VisibilityTimeout: 600,           // 10 min: enough for a full transcode job
  });
  const response = await sqsClient.send(command);
  const message = response.Messages?.[0];
  if (!message?.Body) return null;

  const job: TranscodeJobMessage = JSON.parse(message.Body);
  return { message, job };
}

/**
 * Acknowledge and remove a successfully processed message.
 */
export async function deleteTranscodeJob(receiptHandle: string): Promise<void> {
  const command = new DeleteMessageCommand({
    QueueUrl: config.sqsQueueUrl,
    ReceiptHandle: receiptHandle,
  });
  await sqsClient.send(command);
}
