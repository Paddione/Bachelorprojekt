import { pool } from '../website-db';
import { ensureAssistantSchema } from './schema';
import type { Message, MessageRole, ProposedAction, AssistantProfile } from './types';

export async function getOrCreateActiveConversation(
  userSub: string,
  profile: AssistantProfile,
): Promise<{ id: string }> {
  await ensureAssistantSchema();
  const found = await pool.query<{ id: string }>(
    `SELECT id FROM assistant_conversations
       WHERE user_sub = $1 AND profile = $2
       ORDER BY last_active_at DESC LIMIT 1`,
    [userSub, profile],
  );
  if (found.rows[0]) {
    await pool.query(
      `UPDATE assistant_conversations SET last_active_at = now() WHERE id = $1`,
      [found.rows[0].id],
    );
    return { id: found.rows[0].id };
  }
  const created = await pool.query<{ id: string }>(
    `INSERT INTO assistant_conversations (user_sub, profile)
       VALUES ($1, $2) RETURNING id`,
    [userSub, profile],
  );
  return { id: created.rows[0].id };
}

export async function appendMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  proposedAction?: ProposedAction,
): Promise<Message> {
  await ensureAssistantSchema();
  const r = await pool.query<{ id: string; created_at: Date }>(
    `INSERT INTO assistant_messages (conversation_id, role, content, proposed_action)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [conversationId, role, content, proposedAction ?? null],
  );
  return {
    id: r.rows[0].id,
    conversationId,
    role,
    content,
    createdAt: r.rows[0].created_at.toISOString(),
    proposedAction,
  };
}

export async function loadHistory(conversationId: string, limit = 50): Promise<Message[]> {
  await ensureAssistantSchema();
  const r = await pool.query<{
    id: string;
    role: MessageRole;
    content: string;
    proposed_action: ProposedAction | null;
    created_at: Date;
  }>(
    `SELECT id, role, content, proposed_action, created_at
       FROM assistant_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
    [conversationId, limit],
  );
  return r.rows.map((row) => ({
    id: row.id,
    conversationId,
    role: row.role,
    content: row.content,
    proposedAction: row.proposed_action ?? undefined,
    createdAt: row.created_at.toISOString(),
  }));
}
