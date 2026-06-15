-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

-- Videos table
CREATE TABLE IF NOT EXISTS videos (
  id VARCHAR PRIMARY KEY,
  filename TEXT NOT NULL,
  display_name TEXT NOT NULL,
  path TEXT NOT NULL,
  size BIGINT NOT NULL,
  last_modified TIMESTAMP NOT NULL,
  metadata JSONB NOT NULL,
  categories JSONB NOT NULL,
  custom_categories JSONB NOT NULL,
  thumbnail JSONB,
  root_key TEXT
);

-- Directory roots table
CREATE TABLE IF NOT EXISTS directory_roots (
  root_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  directories JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- App settings table
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Filter presets table
CREATE TABLE IF NOT EXISTS filter_presets (
  id VARCHAR PRIMARY KEY,
  name TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Client errors table
CREATE TABLE IF NOT EXISTS client_errors (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  error_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  message TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  context JSONB DEFAULT NULL,
  user_agent TEXT,
  url TEXT,
  stack TEXT,
  request_id TEXT,
  ip TEXT
);

-- Tags library
CREATE TABLE IF NOT EXISTS tags (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  url TEXT,
  count BIGINT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tag synonyms table
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


-- Indexes for videos table
CREATE INDEX IF NOT EXISTS idx_videos_path ON videos (path);
CREATE INDEX IF NOT EXISTS idx_videos_last_modified ON videos (last_modified);
CREATE INDEX IF NOT EXISTS idx_videos_size ON videos (size);
CREATE INDEX IF NOT EXISTS idx_videos_path_last_modified ON videos (path, last_modified);
CREATE INDEX IF NOT EXISTS idx_videos_categories_gin ON videos USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_videos_custom_categories_gin ON videos USING GIN (custom_categories);

-- Indexes for tags
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name);
CREATE INDEX IF NOT EXISTS idx_tags_type ON tags (type);

