-- Database hardening and performance indexes for videos table
-- Ensures fast lookups and filtering by common columns and JSONB fields.

-- Unique constraint on videos.id is implied by PRIMARY KEY in schema.
-- If schema was created without PK, the following can be uncommented and applied manually:
-- ALTER TABLE videos ADD CONSTRAINT videos_id_unique UNIQUE (id);

-- B-tree indexes for common filters/sorts
CREATE INDEX IF NOT EXISTS idx_videos_path ON videos (path);
CREATE INDEX IF NOT EXISTS idx_videos_last_modified ON videos (last_modified);
CREATE INDEX IF NOT EXISTS idx_videos_size ON videos (size);
-- Composite index for common combined filters
CREATE INDEX IF NOT EXISTS idx_videos_path_last_modified ON videos (path, last_modified);

-- JSONB GIN indexes for category filtering
CREATE INDEX IF NOT EXISTS idx_videos_categories_gin ON videos USING GIN (categories);
CREATE INDEX IF NOT EXISTS idx_videos_custom_categories_gin ON videos USING GIN (custom_categories);
