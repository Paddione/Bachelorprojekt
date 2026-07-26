import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import { getSessionStepTool, draftSessionReportTool, __setPoolForTests } from './session-tools';
import { upsertStep } from './coaching-session-db';

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
  const { Pool: PgMemPool } = pgmem.adapters.createPg();
  pool = new PgMemPool() as unknown as Pool;
  __setPoolForTests(pool);
});

afterAll(async () => {
  await (pool as unknown as { end(): Promise<void> }).end?.();
});

const SID = '00000000-0000-4000-8000-000000000010';

describe('getSessionStepTool', () => {
  it('returns step data for an existing accepted step', async () => {
    await upsertStep(pool, { sessionId: SID, stepNumber: 1, stepName: 'Erstanamnese', phase: 'problem_ziel', beats: [{ beatIndex: 0, captured: 'Konflikt im Team', status: 'accepted' }, { beatIndex: 1, aiResponse: 'antwort', status: 'accepted' }], status: 'accepted' });
    const result = await getSessionStepTool(SID, 1);
    expect(result.found).toBe(true);
    expect(result.stepName).toBe('Erstanamnese');
    expect(result.beats?.length).toBe(2);
    expect(result.aiResponse).toBe('antwort');
  });

  it('returns found=false for a nonexistent step', async () => {
    const result = await getSessionStepTool(SID, 99);
    expect(result.found).toBe(false);
  });
});

describe('draftSessionReportTool', () => {
  it('returns error when no accepted steps exist', async () => {
    const result = await draftSessionReportTool('00000000-0000-4000-8000-000000000099', 'markdown');
    expect(result.error).toBeDefined();
  });

  it('assembles text from accepted steps for report prompt', async () => {
    const SID2 = '00000000-0000-4000-8000-000000000011';
    await upsertStep(pool, { sessionId: SID2, stepNumber: 1, stepName: 'S1', phase: 'p', beats: [{ beatIndex: 0, aiResponse: 'r1', status: 'accepted' }], status: 'accepted' });
    await upsertStep(pool, { sessionId: SID2, stepNumber: 2, stepName: 'S2', phase: 'p', beats: [{ beatIndex: 0, aiResponse: 'r2', status: 'accepted' }], status: 'accepted' });
    const result = await draftSessionReportTool(SID2, 'markdown');
    expect(result.stepsText).toContain('S1');
    expect(result.stepsText).toContain('r1');
  });
});
