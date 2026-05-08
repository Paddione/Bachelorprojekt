import { pool } from '../website-db';
import { ensureAssistantSchema } from './schema';
import type { AssistantProfile } from './types';

export async function snoozeNudge(userSub: string, nudgeId: string, seconds: number): Promise<void> {
  await ensureAssistantSchema();
  await pool.query(
    `INSERT INTO assistant_nudge_dismissals (user_sub, nudge_id, snoozed_until)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)
       ON CONFLICT (user_sub, nudge_id)
       DO UPDATE SET snoozed_until = EXCLUDED.snoozed_until`,
    [userSub, nudgeId, String(seconds)],
  );
}

export async function isSnoozed(userSub: string, nudgeId: string): Promise<boolean> {
  await ensureAssistantSchema();
  const r = await pool.query<{ alive: boolean }>(
    `SELECT (snoozed_until > now()) AS alive
       FROM assistant_nudge_dismissals
       WHERE user_sub = $1 AND nudge_id = $2`,
    [userSub, nudgeId],
  );
  return Boolean(r.rows[0]?.alive);
}

export async function listFirstSeenAt(
  userSub: string,
  profile: AssistantProfile,
): Promise<Date | null> {
  await ensureAssistantSchema();
  const r = await pool.query<{ first_seen_at: Date }>(
    `SELECT first_seen_at FROM assistant_first_seen
       WHERE user_sub = $1 AND profile = $2`,
    [userSub, profile],
  );
  return r.rows[0]?.first_seen_at ?? null;
}

export async function recordFirstSeen(
  userSub: string,
  profile: AssistantProfile,
): Promise<Date> {
  await ensureAssistantSchema();
  const r = await pool.query<{ first_seen_at: Date }>(
    `INSERT INTO assistant_first_seen (user_sub, profile) VALUES ($1, $2)
       ON CONFLICT (user_sub, profile) DO UPDATE SET first_seen_at = assistant_first_seen.first_seen_at
       RETURNING first_seen_at`,
    [userSub, profile],
  );
  return r.rows[0].first_seen_at;
}
