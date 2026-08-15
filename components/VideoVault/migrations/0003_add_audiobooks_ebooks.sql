-- Migration: 0003_add_audiobooks_ebooks
-- Description: Add tables for audiobook and ebook support (MediaVault extension)
-- Created: 2026-01-21

-- ========================================
-- Audiobooks table
-- ========================================

CREATE TABLE IF NOT EXISTS audiobooks (
    id VARCHAR(255) PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    path TEXT NOT NULL,
    total_duration BIGINT NOT NULL,
    total_size BIGINT NOT NULL,
    cover_image TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    last_modified TIMESTAMP NOT NULL,
    root_key TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for audiobooks
CREATE INDEX IF NOT EXISTS idx_audiobooks_path ON audiobooks(path);
CREATE INDEX IF NOT EXISTS idx_audiobooks_author ON audiobooks(author);
CREATE INDEX IF NOT EXISTS idx_audiobooks_title ON audiobooks(title);
CREATE INDEX IF NOT EXISTS idx_audiobooks_last_modified ON audiobooks(last_modified);
CREATE INDEX IF NOT EXISTS idx_audiobooks_root_key ON audiobooks(root_key);

-- ========================================
-- Audiobook chapters table
-- ========================================

CREATE TABLE IF NOT EXISTS audiobook_chapters (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    audiobook_id VARCHAR(255) NOT NULL REFERENCES audiobooks(id) ON DELETE CASCADE,
    index BIGINT NOT NULL,
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    duration BIGINT NOT NULL,
    start_time BIGINT NOT NULL,
    file_size BIGINT NOT NULL
);

-- Indexes for chapters
CREATE INDEX IF NOT EXISTS idx_chapters_audiobook_id ON audiobook_chapters(audiobook_id);
CREATE INDEX IF NOT EXISTS idx_chapters_index ON audiobook_chapters(index);

-- ========================================
-- Ebooks table
-- ========================================

CREATE TABLE IF NOT EXISTS ebooks (
    id VARCHAR(255) PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    path TEXT NOT NULL,
    cover_image TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    last_modified TIMESTAMP NOT NULL,
    root_key TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for ebooks
CREATE INDEX IF NOT EXISTS idx_ebooks_path ON ebooks(path);
CREATE INDEX IF NOT EXISTS idx_ebooks_author ON ebooks(author);
CREATE INDEX IF NOT EXISTS idx_ebooks_title ON ebooks(title);
CREATE INDEX IF NOT EXISTS idx_ebooks_last_modified ON ebooks(last_modified);
CREATE INDEX IF NOT EXISTS idx_ebooks_root_key ON ebooks(root_key);

-- ========================================
-- Ebook files table (multiple formats per book)
-- ========================================

CREATE TABLE IF NOT EXISTS ebook_files (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ebook_id VARCHAR(255) NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
    format VARCHAR(10) NOT NULL, -- 'epub' | 'pdf' | 'mobi' | 'azw3' | 'txt'
    path TEXT NOT NULL,
    file_size BIGINT NOT NULL
);

-- Indexes for ebook files
CREATE INDEX IF NOT EXISTS idx_files_ebook_id ON ebook_files(ebook_id);
CREATE INDEX IF NOT EXISTS idx_files_format ON ebook_files(format);

-- ========================================
-- Media progress tracking (unified for all media types)
-- ========================================

CREATE TABLE IF NOT EXISTS media_progress (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    media_type VARCHAR(20) NOT NULL, -- 'video' | 'audiobook' | 'ebook'
    media_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255), -- optional user association
    -- Audiobook progress
    chapter_index BIGINT,
    position BIGINT, -- seconds for audiobook
    -- Ebook progress
    format VARCHAR(10), -- which format was being read
    location TEXT, -- EPUB CFI or page number
    -- Video progress
    watched_seconds BIGINT,
    -- Common fields
    percentage BIGINT DEFAULT 0, -- 0-100
    completed VARCHAR(5) NOT NULL DEFAULT 'false',
    last_accessed TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for media progress
CREATE INDEX IF NOT EXISTS idx_progress_media_type ON media_progress(media_type);
CREATE INDEX IF NOT EXISTS idx_progress_media_id ON media_progress(media_id);
CREATE INDEX IF NOT EXISTS idx_progress_user_id ON media_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_last_accessed ON media_progress(last_accessed);

-- Unique constraint on media_type + media_id + user_id for upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_unique
ON media_progress(media_type, media_id, COALESCE(user_id, ''));

-- ========================================
-- Add media_type column to videos table for unified queries
-- ========================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'videos' AND column_name = 'media_type'
    ) THEN
        ALTER TABLE videos ADD COLUMN media_type VARCHAR(20) DEFAULT 'video';
    END IF;
END $$;

-- Update existing videos to have media_type = 'video'
UPDATE videos SET media_type = 'video' WHERE media_type IS NULL;

-- Create index on media_type for videos
CREATE INDEX IF NOT EXISTS idx_videos_media_type ON videos(media_type);
