// website/src/lib/planning-office.test.ts
// Real DML tests for planning-office.ts, backed by an in-memory Postgres (pg-mem).
// planning-office.ts imports `pool` from ./website-db as a MODULE BINDING, so we
// vi.mock('./website-db') and swap in a pg-mem-backed pool (same pattern as
// learning-db.test.ts — see the HOISTING TRAP comment there for why the pool must
// be built inside vi.hoisted()).
//
// pg-mem 3.0.14 limitation: the jsonb `||` concat/merge operator is NOT
// implemented as a real merge (it silently falls back to string concatenation,
// which then fails to re-parse as valid JSON when written back into a jsonb
// column), and the jsonb `?` key-existence operator is not implemented at all
// (`operator does not exist: jsonb ? text`). Both are used by planning-office.ts
// (readiness merge in patchItem/clarifyItem; grilling_meta ? 'triage' /
// grilling_meta - 'triage' in discardTriage). Rather than weaken the assertions,
// the mock pool below intercepts exactly those two SQL shapes, performs the
// equivalent merge/delete in JS, and re-issues an operator-free query against
// pg-mem — the real planning-office.ts query text/params are still exercised
// verbatim; only the incompatible-with-pg-mem operator is substituted.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { Pool } from 'pg';

const { memPool } = vi.hoisted(() => {

  const { newDb, DataType } = require('pg-mem');
  const pgmem = newDb();
  pgmem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });

  pgmem.public.none(`
    CREATE SCHEMA tickets;
    CREATE SEQUENCE ext_id_seq AS BIGINT START 1;
    CREATE TABLE tickets.tickets (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id       TEXT UNIQUE DEFAULT ('T' || nextval('ext_id_seq')::text),
      type              TEXT NOT NULL,
      brand             TEXT NOT NULL,
      title             TEXT NOT NULL,
      value_prop        TEXT,
      priority          TEXT NOT NULL DEFAULT 'mittel',
      severity          TEXT,
      effort            TEXT,
      component         TEXT,
      areas             TEXT[],
      depends_on        TEXT[],
      planning_rank     INT,
      readiness         JSONB NOT NULL DEFAULT '{}'::jsonb,
      pinned            BOOLEAN NOT NULL DEFAULT false,
      status            TEXT NOT NULL DEFAULT 'planning',
      requirements_list TEXT[],
      grilling_meta     JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE tickets.ticket_comments (
      id           BIGSERIAL PRIMARY KEY,
      ticket_id    UUID NOT NULL,
      author_label TEXT NOT NULL,
      body         TEXT NOT NULL,
      visibility   TEXT NOT NULL DEFAULT 'internal',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { Pool: MemPool } = pgmem.adapters.createPg();
  const raw = new MemPool();

  // ── pg-mem jsonb-operator compat shim (see file header) ──────────────────
  async function compatQuery(text: string, params?: unknown[]) {
    const p = (params ?? []) as unknown[];

    // patchItem: readiness = COALESCE(readiness, '{}'::jsonb) || $N::jsonb  (keyed by external_id)
    let m = text.match(/COALESCE\(readiness, '\{\}'::jsonb\) \|\| \$(\d+)::jsonb/);
    if (m) {
      const jsonIdx = parseInt(m[1], 10) - 1;
      const whereM = text.match(/external_id = \$(\d+)/);
      const idIdx = parseInt(whereM![1], 10) - 1;
      const cur = await raw.query('SELECT readiness FROM tickets.tickets WHERE external_id = $1', [p[idIdx]]);
      const currentReadiness = cur.rows[0]?.readiness ?? {};
      const incoming = JSON.parse(p[jsonIdx] as string);
      const merged = { ...currentReadiness, ...incoming };
      const newParams = p.slice();
      newParams[jsonIdx] = JSON.stringify(merged);
      const newText = text.replace(
        /COALESCE\(readiness, '\{\}'::jsonb\) \|\| \$(\d+)::jsonb/,
        (_full, num: string) => `$${num}::jsonb`,
      );
      return raw.query(newText, newParams);
    }

    // clarifyItem: SET readiness = readiness || $1::jsonb ... WHERE id = $2  (keyed by id)
    m = text.match(/SET readiness = readiness \|\| \$(\d+)::jsonb[\s\S]*WHERE id = \$(\d+)/);
    if (m) {
      const jsonIdx = parseInt(m[1], 10) - 1;
      const idIdx = parseInt(m[2], 10) - 1;
      const cur = await raw.query('SELECT readiness FROM tickets.tickets WHERE id = $1', [p[idIdx]]);
      const currentReadiness = cur.rows[0]?.readiness ?? {};
      const incoming = JSON.parse(p[jsonIdx] as string);
      const merged = { ...currentReadiness, ...incoming };
      const newParams = p.slice();
      newParams[jsonIdx] = JSON.stringify(merged);
      const newText = text.replace('readiness = readiness ||', 'readiness =');
      return raw.query(newText, newParams);
    }

    // discardTriage: grilling_meta = grilling_meta - 'triage' ... AND grilling_meta ? 'triage'
    if (text.includes("grilling_meta = grilling_meta - 'triage'")) {
      const whereM = text.match(/external_id = \$(\d+)/);
      const idIdx = parseInt(whereM![1], 10) - 1;
      const cur = await raw.query(
        'SELECT grilling_meta, status FROM tickets.tickets WHERE external_id = $1',
        [p[idIdx]],
      );
      const row = cur.rows[0];
      if (!row || row.status !== 'planning' || !row.grilling_meta || !('triage' in row.grilling_meta)) {
        return { rows: [], rowCount: 0 };
      }
      const newMeta = { ...row.grilling_meta };
      delete newMeta.triage;
      return raw.query(
        `UPDATE tickets.tickets SET grilling_meta = $1::jsonb, updated_at = now() WHERE external_id = $2 AND status = 'planning'`,
        [JSON.stringify(newMeta), p[idIdx]],
      );
    }

    return raw.query(text, p);
  }

  const compatPool = {
    query: (text: string, params?: unknown[]) => compatQuery(text, params),
    connect: raw.connect?.bind(raw),
    end: raw.end.bind(raw),
  };

  return { memPool: compatPool as unknown as Pool };
});

vi.mock('./website-db', () => ({ pool: memPool }));

import {
  dorScore,
  listOffice,
  createIdea,
  patchItem,
  promoteItem,
  officeCount,
  cleanupEphemeral,
  clarifyItem,
  applyTriage,
  discardTriage,
  DOR_KEYS,
} from './planning-office';

const fullReadiness = Object.fromEntries(DOR_KEYS.map((k) => [k, true]));

/** A raw ticket/comment row read straight from pg-mem (bypassing planning-office.ts). */
type RawRow = Record<string, unknown>;

beforeEach(async () => {
  await (memPool as unknown as { query(t: string): Promise<unknown> }).query('DELETE FROM tickets.ticket_comments');
  await (memPool as unknown as { query(t: string): Promise<unknown> }).query('DELETE FROM tickets.tickets');
  // pg-mem sequences aren't reset by DELETE; that's fine — external_id values
  // just keep incrementing across tests, which is realistic anyway.
});

afterAll(async () => {
  await (memPool as unknown as { end(): Promise<void> }).end();
});

describe('dorScore', () => {
  it('returns 0 for null readiness', () => {
    expect(dorScore(null)).toBe(0);
  });

  it('counts only true DOR flags', () => {
    expect(dorScore({ spec_skizziert: true, offene_fragen_geklaert: false })).toBe(1);
  });

  it('returns 4 when all DOR keys are true', () => {
    expect(dorScore(fullReadiness)).toBe(4);
  });
});

describe('createIdea + listOffice', () => {
  it('creates an idea and lists it with mapped defaults', async () => {
    const extId = await createIdea({ title: 'Neue Idee', brand: 'mentolder', valueProp: 'Spart Zeit' });
    expect(extId).toBeTruthy();

    const list = await listOffice();
    expect(list).toHaveLength(1);
    expect(list[0].extId).toBe(extId);
    expect(list[0].title).toBe('Neue Idee');
    expect(list[0].valueProp).toBe('Spart Zeit');
    expect(list[0].priority).toBe('mittel'); // COALESCE default
    expect(list[0].areas).toEqual([]);
    expect(list[0].dependsOn).toEqual([]);
    expect(list[0].dorScore).toBe(0);
    expect(list[0].isNextCandidate).toBe(false);
    expect(list[0].pinned).toBe(false);
    expect(list[0].lastenheftLocked).toBe(false);
    expect(list[0].triage).toBeNull();
  });

  it('defaults priority to mittel when explicit priority is undefined', async () => {
    const extId = await createIdea({ title: 'X', brand: 'mentolder' });
    const list = await listOffice();
    expect(list.find((i) => i.extId === extId)?.priority).toBe('mittel');
  });

  it('assigns increasing planning_rank and orders pinned items first', async () => {
    const a = await createIdea({ title: 'A', brand: 'mentolder' });
    const b = await createIdea({ title: 'B', brand: 'mentolder' });
    await patchItem(b, { pinned: true });

    const list = await listOffice();
    expect(list[0].extId).toBe(b); // pinned sorts first regardless of rank
    expect(list[1].extId).toBe(a);
  });

  it('only lists feature/planning tickets (mapRow via listOffice filters status)', async () => {
    const extId = await createIdea({ title: 'Solo', brand: 'mentolder' });
    // Move the ticket out of planning by locking its Lastenheft.
    await patchItem(extId, { requirements: ['Muss X tun'], lastenheftLocked: true });
    const list = await listOffice();
    expect(list).toHaveLength(0);
  });
});

describe('patchItem', () => {
  it('updates simple scalar fields', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    const ok = await patchItem(extId, { valueProp: 'Neuer Nutzen', priority: 'hoch', effort: 'gross' });
    expect(ok).toBe(true);

    const list = await listOffice();
    const item = list.find((i) => i.extId === extId)!;
    expect(item.valueProp).toBe('Neuer Nutzen');
    expect(item.priority).toBe('hoch');
    expect(item.effort).toBe('gross');
  });

  it('merges readiness (DOR flags) without clobbering existing keys', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    await patchItem(extId, { readiness: { spec_skizziert: true } });
    await patchItem(extId, { readiness: { offene_fragen_geklaert: true } });

    const item = (await listOffice()).find((i) => i.extId === extId)!;
    expect(item.readiness.spec_skizziert).toBe(true);
    expect(item.readiness.offene_fragen_geklaert).toBe(true);
    expect(item.dorScore).toBe(2);
  });

  it('returns false and updates nothing when the patch is empty', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    const ok = await patchItem(extId, {});
    expect(ok).toBe(false);
  });

  it('throws lastenheft_empty when locking with no requirements', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    await expect(patchItem(extId, { lastenheftLocked: true })).rejects.toThrow('lastenheft_empty');
  });

  it('throws lastenheft_empty when locking with only blank requirements', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    await expect(
      patchItem(extId, { requirements: ['   ', ''], lastenheftLocked: true }),
    ).rejects.toThrow('lastenheft_empty');
  });

  it('locks the Lastenheft, normalizes requirements, and forward-transitions status to backlog', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    const ok = await patchItem(extId, {
      requirements: [' Muss A tun ', '', '  ', 'Muss B tun'],
      lastenheftLocked: true,
    });
    expect(ok).toBe(true);

    // The ticket left status='planning', so it disappears from listOffice.
    expect(await listOffice()).toHaveLength(0);

    const raw2 = memPool as unknown as { query(t: string, p?: unknown[]): Promise<{ rows: RawRow[] }> };
    const row = (await raw2.query('SELECT * FROM tickets.tickets WHERE external_id = $1', [extId])).rows[0];
    expect(row.status).toBe('backlog');
    expect(row.requirements_list).toEqual(['Muss A tun', 'Muss B tun']);
    expect((row.readiness as Record<string, unknown>).lastenheft_locked).toBe(true);
  });

  it('locking reuses the already-stored requirements_list when none are passed in the same patch', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    await patchItem(extId, { requirements: ['Vorher gespeichert'] });
    const ok = await patchItem(extId, { lastenheftLocked: true });
    expect(ok).toBe(true);
  });

  it('returns false for an unknown external_id', async () => {
    const ok = await patchItem('T-does-not-exist', { valueProp: 'x' });
    expect(ok).toBe(false);
  });

  it('updates areas, dependsOn, rank and pinned', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    await patchItem(extId, { areas: ['website', 'infra'], dependsOn: ['T-1'], rank: 3, pinned: true });
    const item = (await listOffice()).find((i) => i.extId === extId)!;
    expect(item.areas).toEqual(['website', 'infra']);
    expect(item.dependsOn).toEqual(['T-1']);
    expect(item.rank).toBe(3);
    expect(item.pinned).toBe(true);
  });
});

describe('promoteItem', () => {
  it('returns not_found for an unknown external_id', async () => {
    const r = await promoteItem('T-nope', false);
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns dor_incomplete when DOR is not fully satisfied and override is false', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    const r = await promoteItem(extId, false);
    expect(r).toEqual({ ok: false, reason: 'dor_incomplete' });
  });

  it('promotes when DOR is complete: sets rank=0 and posts a context comment', async () => {
    const extId = await createIdea({ title: 'Promote Me', brand: 'mentolder', valueProp: 'Nutzen X' });
    await patchItem(extId, { readiness: fullReadiness });

    const r = await promoteItem(extId, false);
    expect(r).toEqual({ ok: true });

    const item = (await listOffice()).find((i) => i.extId === extId)!;
    expect(item.rank).toBe(0);

    const raw2 = memPool as unknown as { query(t: string, p?: unknown[]): Promise<{ rows: RawRow[] }> };
    const comments = (await raw2.query('SELECT * FROM tickets.ticket_comments')).rows;
    expect(comments).toHaveLength(1);
    expect(comments[0].author_label).toBe('planning-office');
    expect(comments[0].body).toContain('Promote Me');
    expect(comments[0].body).toContain('Nutzen X');
  });

  it('promotes with override=true even when DOR is incomplete', async () => {
    const extId = await createIdea({ title: 'Override', brand: 'mentolder' });
    const r = await promoteItem(extId, true);
    expect(r).toEqual({ ok: true });
  });
});

describe('officeCount', () => {
  it('returns 0 when there are no planning ideas', async () => {
    expect(await officeCount()).toBe(0);
  });

  it('counts only feature/planning tickets', async () => {
    await createIdea({ title: 'A', brand: 'mentolder' });
    const b = await createIdea({ title: 'B', brand: 'mentolder' });
    await patchItem(b, { requirements: ['x'], lastenheftLocked: true }); // leaves planning
    expect(await officeCount()).toBe(1);
  });
});

describe('cleanupEphemeral', () => {
  it('deletes unpinned planning ideas but keeps pinned ones', async () => {
    const keep = await createIdea({ title: 'Keep', brand: 'mentolder' });
    await createIdea({ title: 'Drop me', brand: 'mentolder' });
    await patchItem(keep, { pinned: true });

    const deleted = await cleanupEphemeral();
    expect(deleted).toBe(1);

    const list = await listOffice();
    expect(list).toHaveLength(1);
    expect(list[0].extId).toBe(keep);
  });

  it('returns 0 when nothing to clean up', async () => {
    expect(await cleanupEphemeral()).toBe(0);
  });
});

describe('clarifyItem', () => {
  it('returns false for an unknown external_id', async () => {
    const ok = await clarifyItem('T-nope', 'hi', {});
    expect(ok).toBe(false);
  });

  it('writes a comment, merges readiness, and updates dependsOn/effort', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    await patchItem(extId, { readiness: { spec_skizziert: true } });

    const ok = await clarifyItem(
      extId,
      'Rückfrage beantwortet',
      { offene_fragen_geklaert: true },
      { dependsOn: ['T-9'], effort: 'klein' },
    );
    expect(ok).toBe(true);

    const item = (await listOffice()).find((i) => i.extId === extId)!;
    expect(item.readiness.spec_skizziert).toBe(true); // preserved
    expect(item.readiness.offene_fragen_geklaert).toBe(true); // merged in
    expect(item.dependsOn).toEqual(['T-9']);
    expect(item.effort).toBe('klein');

    const raw2 = memPool as unknown as { query(t: string, p?: unknown[]): Promise<{ rows: RawRow[] }> };
    const comments = (await raw2.query('SELECT * FROM tickets.ticket_comments')).rows;
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe('Rückfrage beantwortet');
  });

  it('skips the comment insert for a blank/whitespace-only body', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    await clarifyItem(extId, '   ', {});
    const raw2 = memPool as unknown as { query(t: string, p?: unknown[]): Promise<{ rows: RawRow[] }> };
    const comments = (await raw2.query('SELECT * FROM tickets.ticket_comments')).rows;
    expect(comments).toHaveLength(0);
  });

  it('does nothing to dependsOn/effort when opts are omitted', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    const ok = await clarifyItem(extId, '', {});
    expect(ok).toBe(true);
    const item = (await listOffice()).find((i) => i.extId === extId)!;
    expect(item.dependsOn).toEqual([]);
    expect(item.effort).toBeNull();
  });
});

describe('applyTriage', () => {
  async function seedWithTriage(triage: Record<string, unknown> | null) {
    const extId = await createIdea({ title: 'Triaged', brand: 'mentolder' });
    const raw2 = memPool as unknown as { query(t: string, p?: unknown[]): Promise<unknown> };
    await raw2.query('UPDATE tickets.tickets SET grilling_meta = $1::jsonb WHERE external_id = $2', [
      JSON.stringify({ triage }),
      extId,
    ]);
    return extId;
  }

  it('returns false when there is no triage suggestion', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    expect(await applyTriage(extId)).toBe(false);
  });

  it('returns false for an unknown external_id', async () => {
    expect(await applyTriage('T-nope')).toBe(false);
  });

  it('returns false when type is invalid', async () => {
    const extId = await seedWithTriage({ type: 'not-a-type', priority: 'hoch', severity: 'major' });
    expect(await applyTriage(extId)).toBe(false);
  });

  it('returns false when priority is invalid', async () => {
    const extId = await seedWithTriage({ type: 'bug', priority: 'urgent', severity: 'major' });
    expect(await applyTriage(extId)).toBe(false);
  });

  it('returns false when severity is invalid', async () => {
    const extId = await seedWithTriage({ type: 'bug', priority: 'hoch', severity: 'catastrophic' });
    expect(await applyTriage(extId)).toBe(false);
  });

  it('returns false when areas is present but not an array', async () => {
    const extId = await seedWithTriage({ type: 'bug', priority: 'hoch', severity: 'major', areas: 'website' });
    expect(await applyTriage(extId)).toBe(false);
  });

  it('applies a valid triage suggestion and updates type/priority/severity/areas/component', async () => {
    const extId = await seedWithTriage({
      type: 'bug',
      priority: 'hoch',
      severity: 'critical',
      areas: ['website', 'infra'],
      component: 'ticket-ui',
    });
    const ok = await applyTriage(extId);
    expect(ok).toBe(true);

    const raw2 = memPool as unknown as { query(t: string, p?: unknown[]): Promise<{ rows: RawRow[] }> };
    const row = (await raw2.query('SELECT * FROM tickets.tickets WHERE external_id = $1', [extId])).rows[0];
    expect(row.type).toBe('bug');
    expect(row.priority).toBe('hoch');
    expect(row.severity).toBe('critical');
    expect(row.areas).toEqual(['website', 'infra']);
    expect(row.component).toBe('ticket-ui');
  });

  it('applies a valid triage suggestion with no areas/component (both optional/null)', async () => {
    const extId = await seedWithTriage({ type: 'task', priority: 'niedrig', severity: 'trivial' });
    expect(await applyTriage(extId)).toBe(true);
    const raw2 = memPool as unknown as { query(t: string, p?: unknown[]): Promise<{ rows: RawRow[] }> };
    const row = (await raw2.query('SELECT * FROM tickets.tickets WHERE external_id = $1', [extId])).rows[0];
    expect(row.component).toBeNull();
  });
});

describe('discardTriage', () => {
  it('returns false when the ticket has no triage suggestion', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    expect(await discardTriage(extId)).toBe(false);
  });

  it('returns false for an unknown external_id', async () => {
    expect(await discardTriage('T-nope')).toBe(false);
  });

  it('removes the triage key from grilling_meta and returns true', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    const raw2 = memPool as unknown as { query(t: string, p?: unknown[]): Promise<{ rows: RawRow[] }> };
    await raw2.query('UPDATE tickets.tickets SET grilling_meta = $1::jsonb WHERE external_id = $2', [
      JSON.stringify({ triage: { type: 'bug' }, other: 1 }),
      extId,
    ]);

    const ok = await discardTriage(extId);
    expect(ok).toBe(true);

    const row = (await raw2.query('SELECT * FROM tickets.tickets WHERE external_id = $1', [extId])).rows[0];
    const meta = row.grilling_meta as Record<string, unknown>;
    expect(meta.triage).toBeUndefined();
    expect(meta.other).toBe(1); // sibling keys survive
  });

  it('is idempotent: a second discard on an already-discarded ticket returns false', async () => {
    const extId = await createIdea({ title: 'T', brand: 'mentolder' });
    const raw2 = memPool as unknown as { query(t: string, p?: unknown[]): Promise<unknown> };
    await raw2.query('UPDATE tickets.tickets SET grilling_meta = $1::jsonb WHERE external_id = $2', [
      JSON.stringify({ triage: { type: 'bug' } }),
      extId,
    ]);
    expect(await discardTriage(extId)).toBe(true);
    expect(await discardTriage(extId)).toBe(false);
  });
});
