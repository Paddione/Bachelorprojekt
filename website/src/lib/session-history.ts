import type { Pool } from 'pg';
import type { ConversationTurn } from './session-agent';
import { pool as defaultPool } from './website-db';

let _pool: Pool | null = null;
export function __setPoolForTests(p: Pool): void { _pool = p; }
function p(): Pool { return _pool ?? defaultPool; }

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const MAX_HISTORY_TOKENS = 80_000;

export async function buildSessionHistory(
  sessionId: string,
  upToStep: number,
): Promise<ConversationTurn[]> {
  const r = await p().query(
    `SELECT step_number, ai_prompt, ai_response
       FROM coaching.session_steps
      WHERE session_id = $1
        AND step_number > 0
        AND step_number < $2
        AND status IN ('accepted', 'skipped')
        AND ai_prompt IS NOT NULL
        AND ai_response IS NOT NULL
      ORDER BY step_number ASC`,
    [sessionId, upToStep],
  );

  const turns: ConversationTurn[] = [];
  for (const row of r.rows) {
    turns.push({ role: 'user', content: row.ai_prompt as string });
    turns.push({ role: 'assistant', content: row.ai_response as string });
  }

  let totalTokens = turns.reduce((sum, t) => sum + estimateTokens(t.content), 0);
  while (totalTokens > MAX_HISTORY_TOKENS && turns.length >= 2) {
    const removed = turns.splice(0, 2);
    totalTokens -= removed.reduce((sum, t) => sum + estimateTokens(t.content), 0);
  }

  return turns;
}
