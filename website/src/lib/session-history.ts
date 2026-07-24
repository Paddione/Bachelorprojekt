import type { Pool } from 'pg';
import type { ConversationTurn } from './session-agent';
import { pool as defaultPool } from './website-db';
import type { BeatState } from './coaching-session-beats-db';
import { deserializeBeats } from './coaching-session-beats-db';

let _pool: Pool | null = null;
export function __setPoolForTests(p: Pool): void { _pool = p; }
function p(): Pool { return _pool ?? defaultPool; }

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const MAX_HISTORY_TOKENS = 80_000;

/** Extrahiert den letzten ki_prompt-Beat mit aiResponse aus den beats. */
function lastKiTurn(beats: BeatState[]): { prompt: string; response: string } | null {
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i];
    if (b.aiResponse) {
      const inputsText = b.inputs ? Object.entries(b.inputs).map(([k, v]) => `${k}: ${v}`).join('\n') : '';
      return { prompt: inputsText, response: b.aiResponse };
    }
  }
  return null;
}

export async function buildSessionHistory(
  sessionId: string,
  upToStep: number,
): Promise<ConversationTurn[]> {
  const r = await p().query(
    `SELECT step_number, coach_inputs
       FROM coaching.session_steps
      WHERE session_id = $1
        AND step_number > 0
        AND step_number < $2
        AND status IN ('accepted', 'skipped')
      ORDER BY step_number ASC`,
    [sessionId, upToStep],
  );

  const turns: ConversationTurn[] = [];
  for (const row of r.rows) {
    const beats = deserializeBeats(row.coach_inputs);
    const turn = lastKiTurn(beats);
    if (turn) {
      turns.push({ role: 'user', content: turn.prompt });
      turns.push({ role: 'assistant', content: turn.response });
    }
  }

  let totalTokens = turns.reduce((sum, t) => sum + estimateTokens(t.content), 0);
  while (totalTokens > MAX_HISTORY_TOKENS && turns.length >= 2) {
    const removed = turns.splice(0, 2);
    totalTokens -= removed.reduce((sum, t) => sum + estimateTokens(t.content), 0);
  }

  return turns;
}
