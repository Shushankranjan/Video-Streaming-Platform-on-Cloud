CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ─────────────────────────────────────────────────────────────────────
-- cognito_sub: Cognito user identifier (prod).  NULL in local dev (email/pw auth).
-- password_hash: bcrypt hash for local dev auth. NULL when using Cognito.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cognito_sub TEXT UNIQUE,               -- Cognito user UUID (prod only)
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,                    -- NULL when using Cognito
    created_at TIMESTAMP DEFAULT NOW()
);

-- ── Videos ────────────────────────────────────────────────────────────────────
-- manifest_s3_key: the raw S3 key (e.g. videos/<id>/master.m3u8).
-- manifest_url: legacy field kept for local-dev static serving.
CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    original_s3_key TEXT NOT NULL,
    manifest_s3_key TEXT,                  -- set by the worker after transcoding
    manifest_url TEXT,                     -- local dev convenience URL
    status TEXT DEFAULT 'pending',         -- pending | processing | ready | failed
    created_at TIMESTAMP DEFAULT NOW()
);

-- ── Watch History ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watch_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    progress_seconds INT DEFAULT 0,
    watched_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_watch_history_user_id ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_video_id ON watch_history(video_id);

-- ── Transcoding Jobs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',         -- pending | queued | processing | ready | failed
    message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_video_id ON jobs(video_id);

