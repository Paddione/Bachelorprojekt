-- Migration: Thumbnail Storage & Background Processing Infrastructure
-- Adds support for server-side thumbnail/sprite storage, incremental scanning, and job queue
-- Part of VideoVault thumbnail/sprite storage rework

-- ========================================
-- 1. New Table: thumbnails
-- ========================================
-- Stores metadata for file-based thumbnails and sprites
CREATE TABLE IF NOT EXISTS thumbnails (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  video_id VARCHAR NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,              -- Relative path from THUMBNAILS_DIR (e.g., "by-hash/ab/abc123_thumb.jpg")
  type VARCHAR(20) NOT NULL CHECK (type IN ('thumbnail', 'sprite')),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  format VARCHAR(10) NOT NULL,           -- 'jpeg', 'webp', 'png'
  file_size BIGINT NOT NULL,             -- File size in bytes
  quality FLOAT,                         -- JPEG/WebP quality (0.0-1.0), NULL for PNG
  frame_count INTEGER,                   -- For sprites only: number of frames in sprite sheet
  tile_layout VARCHAR(20),               -- For sprites only: grid layout (e.g., '25x1', '5x2')
  generated_by VARCHAR(20) NOT NULL,     -- 'server-ffmpeg', 'client-webcodecs'
  generation_params JSONB,               -- Generation parameters for reproducibility
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(video_id, type)                 -- One thumbnail + one sprite per video
);

-- Indexes for thumbnails table
CREATE INDEX IF NOT EXISTS idx_thumbnails_video_id ON thumbnails(video_id);
CREATE INDEX IF NOT EXISTS idx_thumbnails_type ON thumbnails(type);
CREATE INDEX IF NOT EXISTS idx_thumbnails_created_at ON thumbnails(created_at);
CREATE INDEX IF NOT EXISTS idx_thumbnails_file_path ON thumbnails(file_path);

-- ========================================
-- 2. New Table: scan_state
-- ========================================
-- Tracks incremental scan state for files in directory roots
-- Enables detection of new/modified/deleted files without full rescans
CREATE TABLE IF NOT EXISTS scan_state (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  root_key TEXT NOT NULL,
  relative_path TEXT NOT NULL,          -- File path relative to root
  file_hash TEXT NOT NULL,              -- Fast hash (first 64KB + last 64KB + size)
  file_size BIGINT NOT NULL,
  last_modified TIMESTAMP NOT NULL,     -- File mtime
  metadata_extracted BOOLEAN NOT NULL DEFAULT FALSE,
  thumbnail_generated BOOLEAN NOT NULL DEFAULT FALSE,
  sprite_generated BOOLEAN NOT NULL DEFAULT FALSE,
  last_scanned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(root_key, relative_path)
);

-- Indexes for scan_state table
CREATE INDEX IF NOT EXISTS idx_scan_state_root_key ON scan_state(root_key);
CREATE INDEX IF NOT EXISTS idx_scan_state_last_modified ON scan_state(last_modified);
CREATE INDEX IF NOT EXISTS idx_scan_state_file_hash ON scan_state(file_hash);
-- Partial indexes for finding pending work
CREATE INDEX IF NOT EXISTS idx_scan_state_pending_thumbnails
  ON scan_state(root_key) WHERE thumbnail_generated = FALSE;
CREATE INDEX IF NOT EXISTS idx_scan_state_pending_sprites
  ON scan_state(root_key) WHERE sprite_generated = FALSE;
CREATE INDEX IF NOT EXISTS idx_scan_state_pending_metadata
  ON scan_state(root_key) WHERE metadata_extracted = FALSE;

-- ========================================
-- 3. New Table: processing_jobs
-- ========================================
-- Persistent job queue for background processing
-- Supports thumbnail generation, sprite generation, metadata extraction
CREATE TABLE IF NOT EXISTS processing_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type VARCHAR(50) NOT NULL,            -- 'thumbnail', 'sprite', 'metadata', 'hash'
  video_id VARCHAR REFERENCES videos(id) ON DELETE CASCADE,
  root_key TEXT,
  relative_path TEXT,
  priority INTEGER NOT NULL DEFAULT 5,  -- 1=highest, 10=lowest
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  payload JSONB,                        -- Job-specific data
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Indexes for processing_jobs table
-- Critical: composite index for queue processing (status, priority, created_at)
CREATE INDEX IF NOT EXISTS idx_jobs_queue_processing
  ON processing_jobs(status, priority, created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_jobs_video_id ON processing_jobs(video_id);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON processing_jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON processing_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON processing_jobs(status);

-- ========================================
-- 4. Extend videos table
-- ========================================
-- Add new metadata columns for improved metadata extraction
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS bitrate BIGINT,
  ADD COLUMN IF NOT EXISTS codec VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fps FLOAT,
  ADD COLUMN IF NOT EXISTS aspect_ratio VARCHAR(20),
  ADD COLUMN IF NOT EXISTS file_hash TEXT,                    -- Fast hash for deduplication
  ADD COLUMN IF NOT EXISTS metadata_extracted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) DEFAULT 'pending';

-- Indexes for new videos columns
CREATE INDEX IF NOT EXISTS idx_videos_file_hash ON videos(file_hash);
CREATE INDEX IF NOT EXISTS idx_videos_processing_status ON videos(processing_status);
CREATE INDEX IF NOT EXISTS idx_videos_bitrate ON videos(bitrate);
CREATE INDEX IF NOT EXISTS idx_videos_fps ON videos(fps);

-- ========================================
-- 5. Migration Notes
-- ========================================
-- IMPORTANT: This migration adds new infrastructure but does NOT drop the old thumbnail JSONB column.
-- The old `videos.thumbnail` column will be kept during dual-write phase for backward compatibility.
-- A future migration (0004_remove_old_thumbnails.sql) will drop it after all videos are migrated.
--
-- Rollback strategy:
-- - Keep old thumbnail JSONB column intact
-- - New tables can be dropped without affecting existing functionality
-- - API endpoints will serve from new tables if available, fall back to old JSONB
