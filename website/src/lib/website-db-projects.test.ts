// Split out of website-db.test.ts (S1 file-size gate) — projects/portal/
// time-entries area: projects/sub-projects/tasks, portal (customer-scoped)
// project access, time entries, meeting-project linkage. See
// website-db.test.ts for the DB-backed listTimeline suite and the shared
// pg-mem mock rationale.
import { describe, test, expect, vi } from 'vitest';

// ── pg-mem-backed `pg` mock ──────────────────────────────────────────────────
// website-db.ts (and the leaf-most db-pool.ts it re-exports `pool` from)
// creates a single module-level `new Pool(...)` at import time. To exercise
// its real SQL against something Postgres-compatible without a live cluster,
// we replace the `pg` module itself with a pg-mem-backed Pool/Client — every
// consumer of `./db-pool` (website-db.ts, tickets-schema.ts, meetings-db.ts,
// ...) transparently gets the in-memory engine.
//
// Some of website-db.ts's `init*Table()` helpers issue idempotent DDL that
// pg-mem can't execute (PL/pgSQL `DO $$ ... END $$` blocks, advisory-lock
// transactions). Since the tables they create already exist in our
// hand-written schema below (see `SCHEMA_SQL`), it's safe to no-op any
// call that is pure DDL/transaction-control — the statements that matter
// (SELECT/INSERT/UPDATE/DELETE) still go to the real pg-mem engine.
function isDdlOrTxControl(sql: string): boolean {
  return /^(CREATE\s|ALTER\s|DO\b|BEGIN\b|COMMIT\b|ROLLBACK\b)/i.test(sql.trim());
}

vi.mock('pg', () => {
  const { newDb, DataType } = require('pg-mem') as typeof import('pg-mem');
  const mem = newDb();

  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    },
  });

  mem.public.none(`
    CREATE TABLE public.brands (id text PRIMARY KEY, name text NOT NULL);
    INSERT INTO public.brands (id, name) VALUES ('mentolder','mentolder'), ('korczewski','korczewski');

    CREATE TABLE customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      company TEXT,
      keycloak_user_id TEXT,
      customer_number TEXT,
      admin_number TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      enrollment_declined BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE SCHEMA tickets;
    CREATE TABLE tickets.tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id TEXT DEFAULT (gen_random_uuid()::text),
      type TEXT NOT NULL,
      parent_id UUID,
      brand TEXT REFERENCES public.brands(id),
      title TEXT,
      description TEXT,
      notes TEXT,
      url TEXT,
      reporter_email TEXT,
      status TEXT NOT NULL DEFAULT 'triage',
      resolution TEXT,
      priority TEXT,
      customer_id UUID,
      assignee_id UUID,
      start_date DATE,
      due_date DATE,
      is_test_data BOOLEAN DEFAULT false,
      done_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE tickets.tags (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE tickets.ticket_tags (ticket_id UUID, tag_id INT);
    CREATE TABLE tickets.ticket_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id UUID,
      filename TEXT,
      data_url TEXT,
      nc_path TEXT,
      mime_type TEXT,
      file_size INT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE tickets.ticket_comments (
      id SERIAL PRIMARY KEY,
      ticket_id UUID,
      author_id TEXT,
      author_label TEXT,
      kind TEXT,
      body TEXT,
      visibility TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE tickets.ticket_links (
      from_id UUID, to_id UUID, kind TEXT, pr_number INT, created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE tickets.pr_events (
      pr_number INT PRIMARY KEY, title TEXT, description TEXT, category TEXT, scope TEXT,
      brand TEXT REFERENCES public.brands(id), merged_at TIMESTAMPTZ, merged_by TEXT,
      status TEXT DEFAULT 'shipped', created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE meetings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID REFERENCES customers(id),
      meeting_type TEXT,
      scheduled_at TIMESTAMPTZ, talk_room_token TEXT, status TEXT DEFAULT 'scheduled',
      started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, duration_seconds INT,
      recording_path TEXT, released_at TIMESTAMPTZ, project_id UUID,
      brett_link_posted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE transcripts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id UUID, full_text TEXT, language TEXT, duration_seconds INT);
    CREATE TABLE meeting_insights (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id UUID, insight_type TEXT, content TEXT, generated_by TEXT, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE meeting_artifacts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id UUID, artifact_type TEXT, name TEXT, content_text TEXT, storage_path TEXT, created_at TIMESTAMPTZ DEFAULT now());

    CREATE TABLE time_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL,
      task_id UUID,
      description TEXT,
      minutes INTEGER NOT NULL,
      billable BOOLEAN NOT NULL DEFAULT true,
      rate_cents INTEGER NOT NULL DEFAULT 0,
      stripe_invoice_id TEXT,
      leistung_key TEXT,
      entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE client_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE onboarding_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id TEXT NOT NULL,
      label TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE follow_ups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id TEXT,
      client_name TEXT,
      client_email TEXT,
      reason TEXT NOT NULL,
      due_date DATE NOT NULL,
      done BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE admin_shortcuts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      url TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE dsgvo_audit_log (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE invoice_counters (
      brand TEXT REFERENCES public.brands(id) NOT NULL,
      year INT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'invoice',
      counter INT NOT NULL DEFAULT 0,
      PRIMARY KEY (brand, year, kind)
    );
    CREATE TABLE website_custom_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      fields JSONB NOT NULL DEFAULT '[]',
      content JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE service_config (
      brand TEXT PRIMARY KEY REFERENCES public.brands(id),
      services_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE leistungen_config (
      brand TEXT PRIMARY KEY REFERENCES public.brands(id),
      categories_json JSONB NOT NULL,
      version INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE site_settings (
      brand TEXT,
      key TEXT,
      value TEXT NOT NULL,
      version INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (brand, key)
    );
    CREATE TABLE legal_pages (
      brand TEXT,
      page_key TEXT,
      content_html TEXT NOT NULL,
      version INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (brand, page_key)
    );
    CREATE TABLE referenzen_config (
      brand TEXT PRIMARY KEY REFERENCES public.brands(id),
      items_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE service_page_config (
      brand TEXT NOT NULL,
      slug TEXT NOT NULL,
      page_content JSONB,
      version INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (brand, slug)
    );
    CREATE TABLE content_versions (
      id SERIAL PRIMARY KEY,
      brand TEXT,
      content_key TEXT,
      content_type TEXT,
      snapshot JSONB,
      editor TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { Pool: MemPool } = mem.adapters.createPg();

  // pg-mem's generated Client class has no exported type (require()'d dynamically above).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function wrapClientQuery(client: any) {
    const orig = client.query.bind(client);
    client.query = (text: unknown, params?: unknown) => {
      if (typeof text === 'string' && isDdlOrTxControl(text)) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return orig(text, params);
    };
    return client;
  }

  class WrappedPool extends MemPool {
    query(text: unknown, params?: unknown, cb?: unknown) {
      if (typeof text === 'string' && isDdlOrTxControl(text)) {
        const result = Promise.resolve({ rows: [], rowCount: 0 });
        if (typeof cb === 'function') {
          result.then((r) => (cb as (e: unknown, r: unknown) => void)(null, r));
          return undefined;
        }
        return result;
      }
      return super.query(text, params, cb);
    }
    async connect() {
      const client = await super.connect();
      return wrapClientQuery(client);
    }
  }

  return { default: { Pool: WrappedPool }, Pool: WrappedPool };
});
// initTicketsSchema issues real schema-migration DDL (advisory locks, role
// AUTHORIZATION, ...) that's out of scope for pg-mem; the tables it would
// create already exist in the hand-written schema above, so a no-op stub is
// behaviorally equivalent for every website-db.ts call site.
vi.mock('./tickets-schema', () => ({
  initTicketsSchema: vi.fn().mockResolvedValue(undefined),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
  MixedEmbeddingModelError: class MixedEmbeddingModelError extends Error {},
}));

import {
  pool, upsertCustomer,
  getLastTimeEntryRate, createTimeEntry, listTimeEntries, listAllTimeEntries,
  setTimeEntryStripeInvoice, getTimeEntryIdsByInvoice, getUnbilledBillableEntriesByCustomer,
  deleteTimeEntry, getProjectTotalMinutes,
  claimBrettLinkPost,
} from './website-db';
import {
  createProject, updateProject, deleteProject,
  createSubProject, updateSubProject, deleteSubProject,
  listDirectTasks, listSubProjectTasks, createProjectTask, updateProjectTask, deleteProjectTask,
  listProjectAttachments, getProjectAttachment, createProjectAttachment, deleteProjectAttachmentRecord,
  listProjectsForCustomer, togglePortalTaskDone,
} from './projects-db';
import {
  listMeetingsForProject, assignMeetingToProject, findProjectByName,
  listUnassignedMeetingsForCustomer,
} from './project-export-db';

// ── pg-mem-backed tests below (always run) ───────────────────────────────────

async function seedCustomer(email = `c-${Math.random().toString(36).slice(2)}@x.de`): Promise<string> {
  const c = await upsertCustomer({ name: 'Kunde', email });
  return c.id;
}

describe('projects / sub-projects / tasks', () => {
  test('createProject requires a customerId', async () => {
    await expect(createProject({
      brand: 'mentolder', name: 'Ohne Kunde', status: 'entwurf', priority: 'mittel',
    })).rejects.toThrow(/customerId is required/);
  });

  // getProject/listProjects/getSubProject/listSubProjects/exportProjectsFlat
  // are NOT exercised here: PROJECT_SELECT / SUBPROJECT_SELECT embed
  // correlated scalar subqueries in the SELECT list (subProjectCount,
  // taskCount), which pg-mem cannot execute (same limitation as the bug
  // ticket queries above). create/update/delete for projects and
  // sub-projects don't use those SELECTs (plain INSERT/UPDATE/DELETE), so
  // they're verified against the raw table state instead.
  test('createProject/updateProject/deleteProject write the expected row (verified via raw SQL)', async () => {
    const customerId = await seedCustomer();
    const id = await createProject({
      brand: 'mentolder', name: 'Website Relaunch', status: 'aktiv', priority: 'hoch', customerId,
    });
    const row = (await pool.query(`SELECT title, status, customer_id, type, parent_id FROM tickets.tickets WHERE id=$1`, [id])).rows[0];
    expect(row.title).toBe('Website Relaunch');
    expect(row.status).toBe('in_progress'); // 'aktiv' forward-mapped
    expect(row.type).toBe('project');
    expect(row.parent_id).toBeNull();

    await updateProject(id, { name: 'Website Relaunch v2', status: 'erledigt', priority: 'niedrig', customerId });
    const updated = (await pool.query(`SELECT title, status, resolution FROM tickets.tickets WHERE id=$1`, [id])).rows[0];
    expect(updated.title).toBe('Website Relaunch v2');
    expect(updated.status).toBe('done');
    expect(updated.resolution).toBe('shipped');

    await deleteProject(id);
    expect((await pool.query(`SELECT id FROM tickets.tickets WHERE id=$1`, [id])).rows).toHaveLength(0);
  });

  test('sub-projects: create/update/delete + parent existence check (verified via raw SQL)', async () => {
    const customerId = await seedCustomer();
    const projectId = await createProject({ brand: 'mentolder', name: 'Elternprojekt', status: 'aktiv', priority: 'mittel', customerId });

    await expect(createSubProject({
      projectId: '00000000-0000-0000-0000-000000000000', name: 'x', status: 'entwurf', priority: 'mittel',
    })).rejects.toThrow(/not found/);

    const subId = await createSubProject({ projectId, name: 'Teilprojekt A', status: 'aktiv', priority: 'mittel' });
    const sub = (await pool.query(`SELECT title, parent_id, type FROM tickets.tickets WHERE id=$1`, [subId])).rows[0];
    expect(sub.title).toBe('Teilprojekt A');
    expect(sub.parent_id).toBe(projectId);
    expect(sub.type).toBe('project');

    await updateSubProject(subId, { name: 'Teilprojekt A2', status: 'erledigt', priority: 'niedrig' });
    expect((await pool.query(`SELECT title FROM tickets.tickets WHERE id=$1`, [subId])).rows[0].title).toBe('Teilprojekt A2');

    await deleteSubProject(subId);
    expect((await pool.query(`SELECT id FROM tickets.tickets WHERE id=$1`, [subId])).rows).toHaveLength(0);
  });

  test('tasks: create direct + sub-project task, list, update, delete + parent existence check', async () => {
    const customerId = await seedCustomer();
    const projectId = await createProject({ brand: 'mentolder', name: 'Projekt mit Aufgaben', status: 'aktiv', priority: 'mittel', customerId });
    const subId = await createSubProject({ projectId, name: 'Sub', status: 'aktiv', priority: 'mittel' });

    await expect(createProjectTask({
      projectId: '00000000-0000-0000-0000-000000000000', name: 'x', status: 'entwurf', priority: 'mittel',
    })).rejects.toThrow(/not found/);

    const directTaskId = await createProjectTask({ projectId, name: 'Direkte Aufgabe', status: 'entwurf', priority: 'mittel' });
    const subTaskId = await createProjectTask({ projectId, subProjectId: subId, name: 'Sub-Aufgabe', status: 'entwurf', priority: 'mittel' });

    const direct = await listDirectTasks(projectId);
    expect(direct.map(t => t.id)).toContain(directTaskId);
    expect(direct.map(t => t.id)).not.toContain(subTaskId);

    const subTasks = await listSubProjectTasks(subId);
    expect(subTasks.map(t => t.id)).toEqual([subTaskId]);

    await updateProjectTask(directTaskId, { name: 'Direkt v2', status: 'aktiv', priority: 'hoch' });
    const [refetched] = await listDirectTasks(projectId);
    expect(refetched.name).toBe('Direkt v2');

    await deleteProjectTask(directTaskId);
    expect(await listDirectTasks(projectId)).toHaveLength(0);
  });

  test('project attachments: create/list/get/delete', async () => {
    const customerId = await seedCustomer();
    const projectId = await createProject({ brand: 'mentolder', name: 'Mit Anhang', status: 'aktiv', priority: 'mittel', customerId });
    const attId = await createProjectAttachment({
      projectId, filename: 'vertrag.pdf', ncPath: '/Projekte/vertrag.pdf', mimeType: 'application/pdf', fileSize: 1024,
    });
    const list = await listProjectAttachments(projectId);
    expect(list).toHaveLength(1);
    const got = await getProjectAttachment(attId);
    expect(got?.filename).toBe('vertrag.pdf');
    const deletedPath = await deleteProjectAttachmentRecord(attId);
    expect(deletedPath).toBe('/Projekte/vertrag.pdf');
    expect(await getProjectAttachment(attId)).toBeNull();
  });

  // exportProjectsFlat calls listProjects()/listSubProjects() internally
  // (both broken under pg-mem, see note above) — not exercised here.
});

describe('portal (customer-scoped) project access', () => {
  test('listProjectsForCustomer returns [] for unknown keycloak id', async () => {
    expect(await listProjectsForCustomer('no-such-user')).toEqual([]);
  });

  test('listProjectsForCustomer + togglePortalTaskDone happy path', async () => {
    const kcId = `kc-${Math.random().toString(36).slice(2)}`;
    const c = await upsertCustomer({ name: 'Portal-Kunde', email: `portal-${kcId}@x.de`, keycloakUserId: kcId });
    const projectId = await createProject({ brand: 'mentolder', name: 'Portal-Projekt', status: 'aktiv', priority: 'mittel', customerId: c.id });
    const taskId = await createProjectTask({ projectId, name: 'Portal-Aufgabe', status: 'entwurf', priority: 'mittel', customerId: c.id });

    const projects = await listProjectsForCustomer(kcId);
    expect(projects).toHaveLength(1);
    expect(projects[0].tasks).toHaveLength(1);
    expect(projects[0].tasks[0].isUserTask).toBe(true);

    const toggled = await togglePortalTaskDone(taskId, kcId);
    expect(toggled.ok).toBe(true);
    const after = await listProjectsForCustomer(kcId);
    expect(after[0].tasks[0].status).toBe('erledigt');

    // toggling again flips back
    await togglePortalTaskDone(taskId, kcId);
    const after2 = await listProjectsForCustomer(kcId);
    expect(after2[0].tasks[0].status).toBe('aktiv');
  });

  test('togglePortalTaskDone fails closed for unknown user / unknown task', async () => {
    expect(await togglePortalTaskDone('00000000-0000-0000-0000-000000000000', 'nobody')).toEqual({ ok: false });
    const kcId = `kc2-${Math.random().toString(36).slice(2)}`;
    await upsertCustomer({ name: 'X', email: `kc2-${kcId}@x.de`, keycloakUserId: kcId });
    expect(await togglePortalTaskDone('00000000-0000-0000-0000-000000000000', kcId)).toEqual({ ok: false });
  });
});

// NOTE (found, not fixed — see task report): createTimeEntry() does
// `params.entryDate ?? null` and always includes entry_date in the INSERT
// values list, so an explicit NULL is written whenever entryDate is
// omitted. entry_date is NOT NULL DEFAULT CURRENT_DATE — but an explicit
// NULL in an INSERT bypasses the column DEFAULT in Postgres too (DEFAULT
// only applies when the column is omitted from the INSERT, not when NULL
// is passed explicitly), so this throws in real Postgres exactly like it
// does here. The only current caller (api/admin/zeiterfassung/create.ts)
// passes `entryDate: entryDate || undefined`, so an admin submitting the
// time-entry form with an empty date field would hit this today. All
// createTimeEntry() calls below pass an explicit entryDate to avoid
// tripping this pre-existing bug.
describe('time entries', () => {
  async function seedProject(): Promise<string> {
    const customerId = await seedCustomer();
    return createProject({ brand: 'mentolder', name: 'Zeiterfassung', status: 'aktiv', priority: 'mittel', customerId });
  }

  test('createTimeEntry/listTimeEntries/getProjectTotalMinutes', async () => {
    const projectId = await seedProject();
    await createTimeEntry({ projectId, minutes: 60, billable: true, rateCents: 9000, description: 'Beratung', entryDate: '2026-06-01' });
    await createTimeEntry({ projectId, minutes: 30, billable: false, entryDate: '2026-06-02' });

    const entries = await listTimeEntries(projectId);
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.minutes === 60)?.projectName).toBe('Zeiterfassung');

    const totals = await getProjectTotalMinutes(projectId);
    expect(totals.total).toBe(90);
    expect(totals.billable).toBe(60);
  });

  test('getLastTimeEntryRate returns 0 when no entries, else most recent', async () => {
    expect(await getLastTimeEntryRate()).toBe(0);
    const projectId = await seedProject();
    await createTimeEntry({ projectId, minutes: 15, rateCents: 5000, entryDate: '2026-06-03' });
    expect(await getLastTimeEntryRate()).toBe(5000);
  });

  test('listAllTimeEntries filters by billable/since', async () => {
    const projectId = await seedProject();
    await createTimeEntry({ projectId, minutes: 10, billable: true, entryDate: '2026-01-01' });
    await createTimeEntry({ projectId, minutes: 20, billable: false, entryDate: '2026-06-01' });

    const billableOnly = await listAllTimeEntries({ billable: true });
    expect(billableOnly.every(e => e.billable)).toBe(true);

    const since = await listAllTimeEntries({ since: '2026-05-01' });
    expect(since.every(e => new Date(e.entryDate) >= new Date('2026-05-01'))).toBe(true);
  });

  test('setTimeEntryStripeInvoice no-ops on empty ids; getTimeEntryIdsByInvoice returns [] when unmatched', async () => {
    // setTimeEntryStripeInvoice's `WHERE id = ANY($2::uuid[])` can't be
    // assert-checked end-to-end here: pg-mem's `= ANY(<array>)` operator
    // doesn't match existing rows regardless of parameter vs. literal array
    // syntax (confirmed via a minimal repro against a plain text column —
    // a pg-mem engine bug, not a website-db.ts issue). The empty-array
    // short-circuit (no DB round-trip at all) and the plain lookup path are
    // still exercised.
    const projectId = await seedProject();
    const entry = await createTimeEntry({ projectId, minutes: 45, billable: true, entryDate: '2026-06-04' });
    await setTimeEntryStripeInvoice([], 'in_ignored'); // should not throw / no-op
    expect(await getTimeEntryIdsByInvoice('in_never_set')).toEqual([]);
    await expect(setTimeEntryStripeInvoice([entry.id], 'in_123')).resolves.toBeUndefined();
  });

  test('getUnbilledBillableEntriesByCustomer groups by customer', async () => {
    // Uses a year/month (2019-03) not touched by any other time-entry test in
    // this file, since the query has no project/customer scoping filter.
    const customerId = await seedCustomer();
    const projectId = await createProject({ brand: 'mentolder', name: 'Abrechnung', status: 'aktiv', priority: 'mittel', customerId });
    await createTimeEntry({ projectId, minutes: 60, billable: true, rateCents: 9000, entryDate: '2019-03-15' });

    const groups = await getUnbilledBillableEntriesByCustomer(2019, 3);
    expect(groups).toHaveLength(1);
    expect(groups[0].customerId).toBe(customerId);
    expect(groups[0].entries).toHaveLength(1);
  });

  test('deleteTimeEntry removes the row', async () => {
    const projectId = await seedProject();
    const entry = await createTimeEntry({ projectId, minutes: 12, entryDate: '2026-06-05' });
    await deleteTimeEntry(entry.id);
    expect(await listTimeEntries(projectId)).toHaveLength(0);
  });
});

describe('meeting-project linkage', () => {
  test('findProjectByName matches by ILIKE, prefers active status', async () => {
    const customerId = await seedCustomer();
    await createProject({ brand: 'mentolder', name: 'Findbares Projekt', status: 'aktiv', priority: 'mittel', customerId });
    const found = await findProjectByName('mentolder', 'findbar');
    expect(found?.name).toBe('Findbares Projekt');
    expect(await findProjectByName('mentolder', 'existiert-nicht-xyz')).toBeNull();
  });

  test('listMeetingsForProject / assignMeetingToProject / listUnassignedMeetingsForCustomer', async () => {
    const customerId = await seedCustomer();
    const projectId = await createProject({ brand: 'mentolder', name: 'Meeting-Projekt', status: 'aktiv', priority: 'mittel', customerId });
    const m = await pool.query<{ id: string }>(
      `INSERT INTO meetings (customer_id, meeting_type) VALUES ($1, 'intro') RETURNING id`,
      [customerId],
    );
    const meetingId = m.rows[0].id;

    const unassigned = await listUnassignedMeetingsForCustomer(customerId);
    expect(unassigned.some(x => x.id === meetingId)).toBe(true);

    await assignMeetingToProject(meetingId, projectId);
    const meetings = await listMeetingsForProject(projectId);
    expect(meetings).toHaveLength(1);
    expect(meetings[0].transcripts).toEqual([]);
    expect(meetings[0].insights).toEqual([]);
    expect(meetings[0].artifacts).toEqual([]);
  });

  test('claimBrettLinkPost only wins once', async () => {
    const customerId = await seedCustomer();
    const m = await pool.query<{ id: string }>(
      `INSERT INTO meetings (customer_id, meeting_type) VALUES ($1, 'intro') RETURNING id`,
      [customerId],
    );
    const meetingId = m.rows[0].id;
    expect(await claimBrettLinkPost(meetingId)).toBe(true);
    expect(await claimBrettLinkPost(meetingId)).toBe(false);
  });
});
