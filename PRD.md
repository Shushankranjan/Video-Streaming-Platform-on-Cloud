# Video Streaming Platform - PRD

## 1. Overview

A scalable, cloud-native video streaming platform where users can upload, transcode, and stream video content with personalized watch history.

### Goals
- Secure video upload and storage
- Multi-resolution transcoding
- Low-latency global delivery
- User authentication
- Watch history tracking

### Non-Goals
- Live streaming
- Payment/subscription system
- Recommendation engine
- Social features

---

## 2. Tech Stack

| Layer | Service |
|-------|---------|
| Frontend | React / Next.js |
| API | Node.js + Fastify (TypeScript) |
| Auth | AWS Cognito |
| Video Storage | AWS S3 |
| Transcoding | FFmpeg on ECS Fargate, triggered via AWS SQS |
| CDN | AWS CloudFront |
| Database | PostgreSQL (Amazon RDS) |
| Queue | AWS SQS |
| Cache | Amazon ElastiCache Redis |

---

## 3. Architecture

```
                         +-------------+
                         |  CloudFront |
                         |    (CDN)    |
                         +------+------+
                                |
         +----------------------+----------------------+
         |                                             |
  +------v------+                               +------v------+
  |  Web App    |                               |  S3 Bucket  |
  |  (Next.js)  |                               |  (HLS/DASH) |
  +------+------+                               +-------------+
         |
         | HTTPS
         v
  +--------------+
  |  API Gateway |
  +------+-------+
         |
  +------v--------+     +-----------------+
  |  API Server     |<-->|   PostgreSQL    |
  | (Node/Fastify)  |     |  + ElastiCache  |
  +------+--------+     +-----------------+
         |
  +------v--------+     +-----------------+
  |  AWS Cognito  |     |    AWS SQS      |
  +---------------+     +--------+--------+
                                 |
                                 v
                        +-----------------+
                        |  FFmpeg Worker  |
                        |   (ECS/Fargate) |
                        +--------+--------+
                                 |
                                 v
                        +-----------------+
                        |  S3 (variants)  |
                        +-----------------+
```

---

## 4. Data Flow

### Upload Flow
1. Authenticated user requests a pre-signed S3 upload URL from the API.
2. User uploads raw video directly to the S3 ingress bucket.
3. API records video metadata in PostgreSQL (`status: pending`).
4. S3 event notification sends a message to AWS SQS.
5. FFmpeg worker consumes the message and generates HLS variants.
6. Worker uploads variants to the S3 output bucket.
7. Worker calls the API webhook to mark the video as `ready`.

### Playback Flow
1. User requests video details from the API.
2. API returns a CloudFront playback URL with a signed URL/cookie.
3. Player fetches the HLS manifest and segments via CloudFront.
4. Player periodically posts watch progress to the API.
5. API writes progress to Redis and flushes to PostgreSQL.

---

## 5. Database Schema

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    cognito_sub TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE videos (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    original_s3_key TEXT NOT NULL,
    manifest_url TEXT,
    status TEXT DEFAULT 'pending', -- pending, processing, ready, failed
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE watch_history (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    video_id UUID REFERENCES videos(id),
    progress_seconds INT DEFAULT 0,
    watched_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, video_id)
);
```

---

## 6. Core Features

### Authentication
- AWS Cognito user pool for sign-up/sign-in.
- JWT tokens validated by API Gateway and API server middleware.

### Video Upload
- Pre-signed S3 URLs for secure direct uploads.
- Client validation for MP4/MOV/AVI; max file size enforced server-side.

### Transcoding
- FFmpeg-based pipeline running on ECS Fargate.
- Input: raw MP4 from the ingress bucket.
- Output: HLS adaptive bitrate ladder:
  - 360p @ 800 kbps
  - 720p @ 2.5 Mbps
  - 1080p @ 5 Mbps
- SQS queue handles retries and backpressure.

### CDN Delivery
- CloudFront distribution pointing to the S3 output bucket.
- Signed URLs or signed cookies restrict access to authenticated users.

### Watch History
- Progress sampled every 5–10 seconds during playback.
- Redis absorbs high-frequency writes.
- Background worker flushes to PostgreSQL every 60 seconds.
- Resume playback from the last known position.

---

## 7. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/callback` | No | Cognito token exchange |
| GET | `/videos` | Yes | List videos |
| GET | `/videos/:id` | Yes | Get video details |
| POST | `/videos/upload-url` | Yes | Get pre-signed S3 URL |
| POST | `/videos/:id/processed` | Internal | FFmpeg completion webhook |
| GET | `/videos/:id/stream` | Yes | Get CloudFront playback URL |
| POST | `/videos/:id/progress` | Yes | Update watch progress |
| GET | `/history` | Yes | Get user watch history |

---

## 8. Deployment Notes

- **API Server**: Docker container on ECS Fargate behind an Application Load Balancer.
- **FFmpeg Worker**: ECS Fargate task that polls SQS; auto-scales based on queue depth.
- **PostgreSQL**: Amazon RDS.
- **Redis**: Amazon ElastiCache.
- **S3**: Separate ingress and output buckets; lifecycle policy to archive raw files after 30 days.
- **CloudFront**: Signed URLs with restricted origin access; cache HLS segments.

---

## 9. Cost & Scalability Notes

- Use S3 lifecycle policies to archive raw uploads.
- CloudFront reduces origin load and improves latency.
- Auto-scale FFmpeg workers based on SQS queue depth.
- Cache popular manifests in CloudFront and metadata in Redis.

---

## 10. Milestones

1. **MVP**: Cognito auth + S3 upload + single-resolution playback
2. **V1**: Add FFmpeg transcoding + HLS adaptive bitrate
3. **V2**: CloudFront + signed URLs + watch history
4. **V3**: Thumbnails, search, basic analytics

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Large upload failures | Multipart pre-signed uploads with resumable chunks |
| Transcoding backlog | Auto-scale FFmpeg workers based on SQS queue depth |
| Unauthorized stream access | CloudFront signed URLs + strict S3 bucket policies |
| High storage costs | S3 Intelligent-Tiering and lifecycle rules |
