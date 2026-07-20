import path from 'node:path';

export const config = {
  // ── Server ──────────────────────────────────────────────────────────────
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',

  // ── Database / Cache ─────────────────────────────────────────────────────
  databaseUrl: process.env.DATABASE_URL || 'postgresql://vsp:vsp@localhost:5434/vsp',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6380',

  // ── URLs ──────────────────────────────────────────────────────────────────
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3001',

  // ── Local storage fallback (dev only) ────────────────────────────────────
  useLocalStorage: process.env.USE_LOCAL_STORAGE === 'true',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  outputDir: path.resolve(process.env.OUTPUT_DIR || './output'),

  // ── S3 / MinIO ───────────────────────────────────────────────────────────
  ingressBucket: process.env.S3_INGRESS_BUCKET || 'vsp-ingress',
  outputBucket: process.env.S3_OUTPUT_BUCKET || 'vsp-output',
  s3Endpoint: process.env.S3_ENDPOINT,          // undefined = real AWS S3
  s3Region: process.env.S3_REGION || 'us-east-1',
  s3AccessKey: process.env.S3_ACCESS_KEY,
  s3SecretKey: process.env.S3_SECRET_KEY,

  // ── AWS SQS ──────────────────────────────────────────────────────────────
  useSqs: process.env.USE_SQS === 'true',
  sqsQueueUrl: process.env.SQS_QUEUE_URL || '',
  sqsRegion: process.env.SQS_REGION || process.env.S3_REGION || 'us-east-1',

  // ── AWS Cognito ───────────────────────────────────────────────────────────
  useCognito: process.env.USE_COGNITO === 'true',
  cognitoRegion: process.env.COGNITO_REGION || 'us-east-1',
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || '',
  cognitoClientId: process.env.COGNITO_CLIENT_ID || '',
  // Local-dev JWT fallback (ignored when USE_COGNITO=true)
  jwtSecret: process.env.JWT_SECRET || 'local-dev-secret',

  // ── AWS CloudFront ────────────────────────────────────────────────────────
  cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN || '',           // e.g. https://d123.cloudfront.net
  cloudfrontKeyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID || '',
  // PEM private key; pass as literal string (newlines as \n) or mount as secret
  cloudfrontPrivateKey: (process.env.CLOUDFRONT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  cloudfrontSignedUrlTtlSeconds: Number(process.env.CLOUDFRONT_TTL_SECONDS || 3600),
};
