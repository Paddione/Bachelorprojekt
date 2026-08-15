-- Migration: 0006_add_admin_flag
-- Description: Add is_admin boolean flag to users table, seed admin users
-- Created: 2026-03-23

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Seed admin users (upsert: insert if missing, update if exists)
INSERT INTO users (id, username, password, is_admin)
VALUES
  (gen_random_uuid()::text, 'Paddione', '', true),
  (gen_random_uuid()::text, 'test_admin', '', true)
ON CONFLICT (username)
DO UPDATE SET is_admin = true;
