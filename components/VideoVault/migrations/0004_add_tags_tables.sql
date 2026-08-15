-- Migration: 0004_add_tags_tables
-- Description: Add tags and tag_synonyms tables
-- Created: 2026-02-03

CREATE TABLE IF NOT EXISTS tags (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general',
    url TEXT,
    count BIGINT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for tags
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name);
CREATE INDEX IF NOT EXISTS idx_tags_type ON tags (type);

CREATE TABLE IF NOT EXISTS tag_synonyms (
    source TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Duplicate ignores table
CREATE TABLE IF NOT EXISTS duplicate_ignores (
    video1 TEXT NOT NULL,
    video2 TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (video1, video2)
);

