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
  updateSessionStatus,
  archiveSession,
  unarchiveSession,
  getAuditLog,
  updateSessionFields,
  deleteSession,
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
      client_name TEXT,
      ki_config_id INT,
      mode TEXT NOT NULL DEFAULT 'live',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned')),
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ
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
    CREATE TABLE coaching.session_audit_log (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id  UUID NOT NULL REFERENCES coaching.sessions(id) ON DELETE CASCADE,
      event_type  TEXT NOT NULL,
      actor       TEXT NOT NULL,
      step_number INT,
      payload     JSONB NOT NULL DEFAULT '{}',
      changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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

describe('updateSessionStatus', () => {
  it('changes status and writes audit log', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'T', mode: 'live', createdBy: 'coach',
    });
    const updated = await updateSessionStatus(pool, s.id, 'paused', 'coach');
    expect(updated?.status).toBe('paused');
    const log = await getAuditLog(pool, s.id);
    expect(log[0].eventType).toBe('status_change');
    expect(log[0].payload).toMatchObject({ from: 'active', to: 'paused' });
  });

  it('blocks completed → active transition', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'T', mode: 'live', createdBy: 'coach',
    });
    await completeSession(pool, s.id, 'report');
    const result = await updateSessionStatus(pool, s.id, 'active', 'coach');
    expect(result).toBeNull();
    const fetched = await getSession(pool, s.id);
    expect(fetched!.status).toBe('completed');
  });
});

describe('archiveSession / unarchiveSession', () => {
  it('sets and clears archived_at', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'T', mode: 'live', createdBy: 'coach',
    });
    await archiveSession(pool, s.id, 'coach');
    const fetched = await getSession(pool, s.id);
    expect(fetched?.archivedAt).not.toBeNull();
    await unarchiveSession(pool, s.id, 'coach');
    const fetched2 = await getSession(pool, s.id);
    expect(fetched2?.archivedAt).toBeNull();
  });
});

describe('listSessions paginiert', () => {
  it('filtert archivierte Sessions standardmäßig aus', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Archiviert', mode: 'live', createdBy: 'coach',
    });
    await archiveSession(pool, s.id, 'coach');
    const result = await listSessions(pool, 'mentolder', {});
    expect(result.sessions.find(x => x.id === s.id)).toBeUndefined();
  });

  it('zeigt archivierte Sessions wenn archived=true', async () => {
    const result = await listSessions(pool, 'mentolder', { archived: true });
    expect(result.sessions.some(x => x.archivedAt !== null)).toBe(true);
  });

  it('gibt ListSessionsResult zurück', async () => {
    const result = await listSessions(pool, 'mentolder', { pageSize: 5 });
    expect(result).toHaveProperty('sessions');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('page');
    expect(result).toHaveProperty('pageSize');
  });

  it('gibt korrekte total-Anzahl zurück', async () => {
    // Erstelle Sessions mit einer einzigartigen Brand um Isolation sicherzustellen
    const brand = 'test-total-brand';
    await createSession(pool, { brand, title: 'A', mode: 'live', createdBy: 'c' });
    await createSession(pool, { brand, title: 'B', mode: 'live', createdBy: 'c' });
    await createSession(pool, { brand, title: 'C', mode: 'live', createdBy: 'c' });
    const result = await listSessions(pool, brand, {});
    expect(result.total).toBe(3);
    expect(result.sessions).toHaveLength(3);
  });
});

describe('updateSessionFields', () => {
  it('ändert title und clientName und schreibt audit log', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Alt', mode: 'live', createdBy: 'coach',
    });
    const updated = await updateSessionFields(pool, s.id, { title: 'Neu', clientName: 'Müller' }, 'coach');
    expect(updated?.title).toBe('Neu');
    expect(updated?.clientName).toBe('Müller');
    const log = await getAuditLog(pool, s.id);
    expect(log.some(e => e.eventType === 'field_change' && (e.payload as Record<string,unknown>)['field'] === 'title')).toBe(true);
    expect(log.some(e => e.eventType === 'field_change' && (e.payload as Record<string,unknown>)['field'] === 'client_name')).toBe(true);
  });

  it('gibt null zurück bei unbekannter id', async () => {
    const result = await updateSessionFields(pool, '00000000-0000-4000-8000-000000000000', { title: 'X' }, 'coach');
    expect(result).toBeNull();
  });

  it('gibt Steps zurück wenn die Session Steps hat', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Session mit Steps', mode: 'live', createdBy: 'coach',
    });
    await upsertStep(pool, {
      sessionId: s.id, stepNumber: 1, stepName: 'Schritt 1', phase: 'problem_ziel',
      coachInputs: {}, status: 'pending',
    });
    const updated = await updateSessionFields(pool, s.id, { title: 'Geändert' }, 'coach');
    expect(updated?.steps).toHaveLength(1);
    expect(updated?.steps[0].stepNumber).toBe(1);
  });
});

describe('deleteSession', () => {
  it('löscht eine Session und gibt true zurück', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Zu löschen', mode: 'live', createdBy: 'coach',
    });
    const result = await deleteSession(pool, s.id);
    expect(result).toBe(true);
    const fetched = await getSession(pool, s.id);
    expect(fetched).toBeNull();
  });

  it('gibt false zurück bei unbekannter id', async () => {
    const result = await deleteSession(pool, '00000000-0000-4000-8000-000000000099');
    expect(result).toBe(false);
  });
});
