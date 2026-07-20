# Video Streaming Platform

A local-first, AWS-ready video streaming platform described in [PRD.md](./PRD.md).

## Tech Stack

- **Frontend**: Next.js 14 + React + Tailwind CSS + hls.js
- **API**: Node.js + Fastify + TypeScript
- **Database**: PostgreSQL (local) / Amazon RDS (prod)
- **Cache**: Redis (local) / Amazon ElastiCache (prod)
- **Object Storage**: MinIO (local) / Amazon S3 (prod)
- **Transcoding**: FFmpeg / ECS Fargate (prod)
- **Auth**: Email+JWT (local) / AWS Cognito (prod)
- **CDN**: Local static server (local) / Amazon CloudFront (prod)
- **Queue**: DB polling (local) / AWS SQS FIFO (prod)

## Project Structure

```
.
├── apps/
│   ├── api/          # Fastify API server + FFmpeg worker
│   └── web/          # Next.js frontend
├── infra/            # AWS CDK infrastructure stacks
│   ├── bin/app.ts    # CDK entry point
│   └── lib/          # Individual stacks (network, ecs, cdn, …)
├── .github/
│   └── workflows/deploy.yml  # CI/CD pipeline
├── packages/
│   └── shared/       # Shared TypeScript types
├── docker-compose.yml
├── package.json
└── PRD.md
```

## Local Development

### 1. Start backing services

```bash
npm run db:up
```

This starts PostgreSQL, Redis, and MinIO in Docker.

### 2. Install dependencies

```bash
npm install
```

### 3. Run database migrations and seed a demo user

```bash
npm run db:migrate
npm run db:seed
```

Demo user: `demo@example.com` / `password`

### 4. Start the API server and worker

```bash
# Terminal 1
npm run dev --workspace=apps/api

# Terminal 2
npm run worker --workspace=apps/api
```

### 5. Start the web frontend

```bash
npm run dev --workspace=apps/web
```

Open http://localhost:3000 in your browser.

---

## AWS Deployment

### Prerequisites

- AWS CLI configured: `aws configure`
- AWS CDK installed: `npm install -g aws-cdk`
- Docker running (for image builds)

### Feature Flags (env vars)

| Variable | Local | AWS Prod |
|----------|-------|----------|
| `USE_LOCAL_STORAGE` | `true` | `false` |
| `USE_SQS` | `false` | `true` |
| `USE_COGNITO` | `false` | `true` |

### First-time Bootstrap

```bash
# 1. Bootstrap your AWS account for CDK (one-time per account/region)
cd infra && npm install
npx cdk bootstrap

# 2. Deploy all stacks
npx cdk deploy --all
```

CDK outputs will print the values you need (Cognito IDs, CloudFront domain, etc.).
Copy them into `apps/api/.env.aws.example` → rename to `.env` for manual testing.

### Ongoing Deployments (CI/CD)

Push to `main` — GitHub Actions automatically:
1. Builds & pushes Docker images (api, worker, web) to ECR
2. Runs `cdk deploy --all`
3. Force-redeploys the ECS services

**Required GitHub Secrets:**

| Secret | Description |
|--------|-------------|
| `AWS_DEPLOY_ROLE_ARN` | ARN of the IAM role GitHub OIDC can assume |

### Setting up CloudFront Signed URLs

1. Generate a CloudFront key pair in the AWS Console → CloudFront → Key management
2. Add the public key to a Key Group
3. Set the `trustedKeyGroups` field in `infra/lib/cdn-stack.ts`
4. Set `CLOUDFRONT_KEY_PAIR_ID` and `CLOUDFRONT_PRIVATE_KEY` env vars on the ECS service

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/callback` | No | Cognito token exchange (prod) |
| POST | `/auth/register` | No | Register (local dev only) |
| POST | `/auth/login` | No | Login (local dev only) |
| GET | `/auth/me` | Yes | Get current user |
| GET | `/videos` | Yes | List videos |
| GET | `/videos/:id` | Yes | Get video details |
| POST | `/videos/upload-url` | Yes | Get pre-signed S3 upload URL |
| POST | `/videos/upload` | Yes | Direct upload (local fallback) |
| POST | `/videos/:id/processed` | Internal | FFmpeg completion webhook |
| GET | `/videos/:id/stream` | Yes | Get CloudFront signed URL |
| POST | `/videos/:id/progress` | Yes | Update watch progress |
| GET | `/history` | Yes | Get watch history |

## Notes

- The worker uses `libopenh264` by default. If your FFmpeg build supports `libx264`, change the codec in `apps/api/src/worker.ts`.
- The SQS FIFO queue uses `videoId` as the `MessageGroupId` and `MessageDeduplicationId` to prevent duplicate transcoding jobs.
- CloudFront signed URLs expire after 1 hour by default (configurable via `CLOUDFRONT_TTL_SECONDS`).

