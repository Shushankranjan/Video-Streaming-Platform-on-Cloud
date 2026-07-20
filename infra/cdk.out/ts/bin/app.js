#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const network_stack_1 = require("../lib/network-stack");
const storage_stack_1 = require("../lib/storage-stack");
const queue_stack_1 = require("../lib/queue-stack");
const database_stack_1 = require("../lib/database-stack");
const cache_stack_1 = require("../lib/cache-stack");
const auth_stack_1 = require("../lib/auth-stack");
const ecr_stack_1 = require("../lib/ecr-stack");
const ecs_stack_1 = require("../lib/ecs-stack");
const cdn_stack_1 = require("../lib/cdn-stack");
const app = new cdk.App();
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};
// ── Foundation ─────────────────────────────────────────────────────────────────
const network = new network_stack_1.NetworkStack(app, 'VspNetworkStack', { env });
const storage = new storage_stack_1.StorageStack(app, 'VspStorageStack', { env });
const queue = new queue_stack_1.QueueStack(app, 'VspQueueStack', { env });
const database = new database_stack_1.DatabaseStack(app, 'VspDatabaseStack', { env, vpc: network.vpc });
const cache = new cache_stack_1.CacheStack(app, 'VspCacheStack', { env, vpc: network.vpc });
// ── Auth ───────────────────────────────────────────────────────────────────────
const auth = new auth_stack_1.AuthStack(app, 'VspAuthStack', { env });
// ── Container Registry ─────────────────────────────────────────────────────────
const ecr = new ecr_stack_1.EcrStack(app, 'VspEcrStack', { env });
// ── Compute ────────────────────────────────────────────────────────────────────
const ecs = new ecs_stack_1.EcsStack(app, 'VspEcsStack', {
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
const cdn = new cdn_stack_1.CdnStack(app, 'VspCdnStack', {
    env,
    outputBucket: storage.outputBucket,
    alb: ecs.alb,
});
app.synth();
//# sourceMappingURL=app.js.map