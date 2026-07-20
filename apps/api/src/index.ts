import 'dotenv/config';
import path from 'node:path';
import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { config } from './lib/config.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import videoRoutes from './routes/videos.js';
import historyRoutes from './routes/history.js';
import { ensureBucket } from './lib/s3.js';
import fs from 'node:fs';

async function bootstrap() {
  const app = fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 * 1024 } });
  await app.register(authPlugin);

  // Serve static output files for local playback
  fs.mkdirSync(config.outputDir, { recursive: true });
  await app.register(staticPlugin, {
    root: config.outputDir,
    prefix: '/streams/',
  });

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(videoRoutes, { prefix: '/videos' });
  await app.register(historyRoutes, { prefix: '/history' });

  app.get('/health', async () => ({ status: 'ok' }));

  // Ensure buckets exist
  try {
    await ensureBucket(config.ingressBucket);
    await ensureBucket(config.outputBucket);
  } catch (err) {
    app.log.warn(err, 'S3 bucket check failed, continuing with local storage');
  }

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`API server running at http://localhost:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
