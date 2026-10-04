-- Drop indexes whose leading column(s) are fully covered by an existing
-- unique/constraint index (schema audit 2026-10-04):
--   idx_progress_media_type  (media_type)  ⊂ idx_progress_unique (media_type, media_id, COALESCE(user_id,''))
--   idx_scan_state_root_key  (root_key)    ⊂ scan_state_root_key_relative_path_key (root_key, relative_path)
--   idx_thumbnails_video_id  (video_id)    ⊂ thumbnails_video_id_type_key (video_id, type)
--   idx_videos_path          (path)        ⊂ idx_videos_path_last_modified (path, last_modified)
-- Partial indexes (idx_jobs_queue_processing, idx_scan_state_pending_*)
-- stay — they serve queries the covering indexes cannot answer.
DROP INDEX IF EXISTS idx_progress_media_type;
DROP INDEX IF EXISTS idx_scan_state_root_key;
DROP INDEX IF EXISTS idx_thumbnails_video_id;
DROP INDEX IF EXISTS idx_videos_path;
