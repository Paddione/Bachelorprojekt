import { pool } from '../website-db';

let ready = false;

export async function ensureAssistantSchema(): Promise<void> {
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assistant_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_sub TEXT NOT NULL,
      profile TEXT NOT NULL CHECK (profile IN ('admin','portal')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user
      ON assistant_conversations(user_sub, profile, last_active_at DESC);

    CREATE TABLE IF NOT EXISTS assistant_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL,
      proposed_action JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_messages_conv
      ON assistant_messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS assistant_nudge_dismissals (
      user_sub TEXT NOT NULL,
      nudge_id TEXT NOT NULL,
      snoozed_until TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_sub, nudge_id)
    );

    CREATE TABLE IF NOT EXISTS assistant_first_seen (
      user_sub TEXT NOT NULL,
      profile TEXT NOT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_sub, profile)
    );
  `);
  ready = true;
}
