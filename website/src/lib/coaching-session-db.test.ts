import { describe, it, expect, beforeAll } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  createSession,
  getSession,
  listSessions,
  upsertStep,
  getStep,
  completeSession,
} from './coaching-session-db';

let pool: Pool;

beforeAll(async () => {
  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  db.public.none(`
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand TEXT NOT NULL DEFAULT 'mentolder',
      client_id UUID,
      mode TEXT NOT NULL DEFAULT 'live',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE coaching.session_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES coaching.sessions(id) ON DELETE CASCADE,
      step_number INT NOT NULL,
      step_name TEXT NOT NULL,
      phase TEXT NOT NULL,
      coach_inputs JSONB NOT NULL DEFAULT '{}',
      ai_prompt TEXT,
      ai_response TEXT,
      coach_notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      generated_at TIMESTAMPTZ,
      UNIQUE (session_id, step_number)
    );
  `);
  const { Pool: PgMemPool } = db.adapters.createPg();
  pool = new PgMemPool() as unknown as Pool;
});

describe('createSession', () => {
  it('creates a session and returns it', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Test-Session', createdBy: 'coach1', mode: 'live',
    });
    expect(s.id).toBeTruthy();
    expect(s.title).toBe('Test-Session');
    expect(s.status).toBe('active');
    expect(s.clientId).toBeNull();
  });
});

describe('getSession', () => {
  it('returns session with steps', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Mit Steps', createdBy: 'coach1', mode: 'prep',
    });
    await upsertStep(pool, {
      sessionId: s.id, stepNumber: 1, stepName: 'Erstanamnese', phase: 'problem_ziel',
      coachInputs: { anlass: 'Stress' },
    });
    const result = await getSession(pool, s.id);
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(1);
    expect(result!.steps[0].coachInputs).toEqual({ anlass: 'Stress' });
  });
});

describe('upsertStep', () => {
  it('updates an existing step on second call', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Upsert-Test', createdBy: 'coach1', mode: 'live',
    });
    await upsertStep(pool, {
      sessionId: s.id, stepNumber: 1, stepName: 'Erstanamnese', phase: 'problem_ziel',
      coachInputs: { anlass: 'alt' },
    });
    await upsertStep(pool, {
      sessionId: s.id, stepNumber: 1, stepName: 'Erstanamnese', phase: 'problem_ziel',
      coachInputs: { anlass: 'neu' }, aiResponse: 'KI sagt...', status: 'generated',
    });
    const step = await getStep(pool, s.id, 1);
    expect(step!.coachInputs).toEqual({ anlass: 'neu' });
    expect(step!.aiResponse).toBe('KI sagt...');
    expect(step!.status).toBe('generated');
  });
});

describe('completeSession', () => {
  it('sets status to completed and stores report', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Abschluss-Test', createdBy: 'coach1', mode: 'live',
    });
    await completeSession(pool, s.id, '# Bericht\nZusammenfassung...');
    const result = await getSession(pool, s.id);
    expect(result!.status).toBe('completed');
    expect(result!.completedAt).not.toBeNull();
    const report = result!.steps.find(s => s.stepNumber === 0);
    expect(report!.aiResponse).toContain('Zusammenfassung');
  });
});
