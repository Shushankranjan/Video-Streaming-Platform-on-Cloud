#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { StorageStack } from '../lib/storage-stack';
import { QueueStack } from '../lib/queue-stack';
import { DatabaseStack } from '../lib/database-stack';
import { CacheStack } from '../lib/cache-stack';
import { AuthStack } from '../lib/auth-stack';
import { EcrStack } from '../lib/ecr-stack';
import { EcsStack } from '../lib/ecs-stack';
import { CdnStack } from '../lib/cdn-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// ── Foundation ─────────────────────────────────────────────────────────────────
const network = new NetworkStack(app, 'VspNetworkStack', { env });
const storage = new StorageStack(app, 'VspStorageStack', { env });
const queue   = new QueueStack(app, 'VspQueueStack', { env });
const database = new DatabaseStack(app, 'VspDatabaseStack', { env, vpc: network.vpc });
const cache   = new CacheStack(app, 'VspCacheStack', { env, vpc: network.vpc });

// ── Auth ───────────────────────────────────────────────────────────────────────
const auth = new AuthStack(app, 'VspAuthStack', { env });

// ── Container Registry ─────────────────────────────────────────────────────────
const ecr = new EcrStack(app, 'VspEcrStack', { env });

// ── Compute ────────────────────────────────────────────────────────────────────
const ecs = new EcsStack(app, 'VspEcsStack', {
  env,
  vpc: network.vpc,
  apiRepo: ecr.apiRepo,
  workerRepo: ecr.workerRepo,
  database,
  cache,
  storage,
  queue,
  auth,
});

// ── CDN ────────────────────────────────────────────────────────────────────────
const cdn = new CdnStack(app, 'VspCdnStack', {
  env,
  outputBucket: storage.outputBucket,
  alb: ecs.alb,
});

app.synth();
