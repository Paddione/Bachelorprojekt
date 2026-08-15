-- Migration: 0005_file_hash_unique
-- Description: Convert file_hash index to unique index for ON CONFLICT support
-- Created: 2026-02-04

-- Drop the existing non-unique index
DROP INDEX IF EXISTS idx_videos_file_hash;

-- Create a unique index (NULLs are treated as distinct, so existing rows without file_hash are fine)
CREATE UNIQUE INDEX idx_videos_file_hash ON videos(file_hash);
