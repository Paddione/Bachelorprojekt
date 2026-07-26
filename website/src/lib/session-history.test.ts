import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import { buildSessionHistory, estimateTokens } from './session-history';
import { upsertStep } from './coaching-session-db';
import { __setPoolForTests } from './session-history';

let pool: Pool;

beforeAll(async () => {
  const pgmem = newDb();
  pgmem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  pgmem.public.none(`
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.session_steps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL,
      step_number int NOT NULL,
      step_name text NOT NULL DEFAULT '',
      phase text NOT NULL DEFAULT '',
      coach_inputs jsonb NOT NULL DEFAULT '{}',
      ai_prompt text,
      ai_response text,
      coach_notes text,
      status text NOT NULL DEFAULT 'pending',
      generated_at timestamptz,
      UNIQUE(session_id, step_number)
    );
  `);
  const { Pool } = pgmem.adapters.createPg();
  pool = new Pool();
  __setPoolForTests(pool);
});

afterAll(async () => {
  await (pool as unknown as { end(): Promise<void> }).end?.();
});

const SID = '00000000-0000-4000-8000-000000000001';

describe('buildSessionHistory', () => {
  it('returns empty array when no prior steps exist', async () => {
    const hist = await buildSessionHistory(SID, 1);
    expect(hist).toEqual([]);
  });

  it('includes accepted and skipped steps as user+assistant turns', async () => {
    await upsertStep(pool, { sessionId: SID, stepNumber: 1, stepName: 'Erstanamnese', phase: 'problem_ziel', beats: [{ beatIndex: 0, inputs: { anlass: 'Stress' }, aiResponse: 'Schritt-1-Antwort', status: 'accepted' }], status: 'accepted' });
    await upsertStep(pool, { sessionId: SID, stepNumber: 2, stepName: 'Schlüsselemotion', phase: 'problem_ziel', beats: [{ beatIndex: 0, inputs: { emotion: 'Angst' }, aiResponse: 'Schritt-2-Antwort', status: 'skipped' }], status: 'skipped' });
    const hist = await buildSessionHistory(SID, 3);
    expect(hist).toHaveLength(4);
    expect(hist[0]).toEqual({ role: 'user', content: 'anlass: Stress' });
    expect(hist[1]).toEqual({ role: 'assistant', content: 'Schritt-1-Antwort' });
    expect(hist[2]).toEqual({ role: 'user', content: 'emotion: Angst' });
    expect(hist[3]).toEqual({ role: 'assistant', content: 'Schritt-2-Antwort' });
  });

  it('excludes generated and pending steps', async () => {
    const SID2 = '00000000-0000-4000-8000-000000000002';
    await upsertStep(pool, { sessionId: SID2, stepNumber: 1, stepName: 'S1', phase: 'p', beats: [], status: 'generated' });
    const hist = await buildSessionHistory(SID2, 2);
    expect(hist).toHaveLength(0);
  });

  it('does not include step N itself', async () => {
    const hist = await buildSessionHistory(SID, 2);
    expect(hist).toHaveLength(2);
  });
});

describe('estimateTokens', () => {
  it('estimates ~1 token per 4 chars', () => {
    expect(estimateTokens('abcdefghijklmnop')).toBe(4);
  });
});
