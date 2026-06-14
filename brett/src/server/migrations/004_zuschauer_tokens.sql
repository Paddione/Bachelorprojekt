ALTER TABLE brett_share_tokens
  ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'share';
CREATE INDEX IF NOT EXISTS idx_share_tokens_type
  ON brett_share_tokens (token_type, room_token)
  WHERE disabled_at IS NULL;
