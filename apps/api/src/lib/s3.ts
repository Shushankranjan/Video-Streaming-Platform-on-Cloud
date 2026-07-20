import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config.js';

function buildS3Client(): S3Client {
  const base = { region: config.s3Region };

  if (config.s3Endpoint) {
    // MinIO / local dev: explicit endpoint + path-style + static credentials
    return new S3Client({
      ...base,
      endpoint: config.s3Endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.s3AccessKey!,
        secretAccessKey: config.s3SecretKey!,
      },
    });
  }

  // Real AWS: let the SDK use the instance/task IAM role automatically
  return new S3Client(base);
}

export const s3Client = buildS3Client();

export const ingressBucket = config.ingressBucket;
export const outputBucket = config.outputBucket;

export async function ensureBucket(bucket: string) {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export async function getPresignedUploadUrl(key: string, contentType: string, expiresIn = 300) {
  const { url, fields } = await createPresignedPost(s3Client, {
    Bucket: ingressBucket,
    Key: key,
    Conditions: [
      ['content-length-range', 0, 2 * 1024 * 1024 * 1024], // 2 GB max
      ['eq', '$Content-Type', contentType],
    ],
    Fields: { 'Content-Type': contentType },
    Expires: expiresIn,
  });
  return { url, fields, key };
}

export async function getPresignedDownloadUrl(bucket: string, key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function getPresignedPutUrl(bucket: string, key: string, contentType: string, expiresIn = 300) {
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(s3Client, command, { expiresIn });
}

