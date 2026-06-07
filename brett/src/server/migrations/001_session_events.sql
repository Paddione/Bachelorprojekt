-- brett/src/server/migrations/001_session_events.sql
-- Migration: create session_events table for Timeline/Replay (T000472).

CREATE TABLE IF NOT EXISTS session_events (
  id           BIGSERIAL    PRIMARY KEY,
  room_token   TEXT         NOT NULL,
  session_code TEXT,
  seq          INTEGER      NOT NULL,
  event_type   TEXT         NOT NULL,
  payload      JSONB        NOT NULL,
  recorded_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Fast lookup for replay: all events for a room in order
CREATE INDEX IF NOT EXISTS idx_session_events_room_token
  ON session_events (room_token, recorded_at);

-- Fast lookup by session code for the session-picker
CREATE INDEX IF NOT EXISTS idx_session_events_session_code
  ON session_events (session_code, seq)
  WHERE session_code IS NOT NULL;

-- Composite index for seq uniqueness per room
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_events_room_seq
  ON session_events (room_token, seq);
