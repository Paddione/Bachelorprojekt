-- brett/src/server/migrations/003_share_tokens.sql
-- Migration: Share-Token-Tabelle für öffentliche View-only-Links (T000608).
-- Idempotent (IF NOT EXISTS) — runMigrations() re-runs it on every startup.

CREATE TABLE IF NOT EXISTS brett_share_tokens (
  token        TEXT         PRIMARY KEY,
  room_token   TEXT         NOT NULL,
  created_by   TEXT,                          -- userId des Erstellers (NULL = admin-tool)
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  disabled_at  TIMESTAMPTZ,                   -- NULL = aktiv; gesetzt = deaktiviert
  expires_at   TIMESTAMPTZ                    -- NULL = kein Ablauf (Phase 1 ungenutzt)
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_room
  ON brett_share_tokens (room_token)
  WHERE disabled_at IS NULL;
