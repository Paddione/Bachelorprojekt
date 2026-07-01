// PR5: confirm listTimeline reads from tickets.pr_events (the source of
// truth after the bachelorprojekt.v_timeline sunset).
//
// DB-backed: skipped unless DATABASE_URL/SESSIONS_DATABASE_URL is set.
import { describe, it, test, expect, beforeAll, beforeEach, vi } from 'vitest';

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
// transitionTicket has its own dedicated test suite (tickets/transition.test.ts)
// covering email side-effects, reporter-link, readiness updates, etc. Here we
// only need to verify website-db.ts's bug-ticket wrappers call it correctly.
const transitionTicketMock = vi.fn().mockResolvedValue({
  id: 'ticket-1', externalId: 'BUG-1', type: 'bug', status: 'done',
  resolution: 'fixed', emailSent: false,
});
vi.mock('./tickets/transition', () => ({
  transitionTicket: (...args: unknown[]) => transitionTicketMock(...args),
}));

import {
  listTimeline, pool,
  upsertCustomer, listPendingEnrollments, declineEnrollment, getCustomerFullById,
  getCustomerByKeycloakId, setCustomerNumber, setAdminNumber, setIsAdmin,
  getCustomerByEmail, listAllCustomers, listAdminUsers,
  assignMeeting,
  insertBugTicket, resolveBugTicket, archiveBugTicket,
  appendBugTicketComment, reopenBugTicket,
  listClientNotes, createClientNote, deleteClientNote,
  insertDsgvoRequest,
} from './website-db';

const dbAvailable = !!(process.env.DATABASE_URL || process.env.SESSIONS_DATABASE_URL);

describe.skipIf(!dbAvailable)('listTimeline (DB-backed)', () => {
  beforeAll(async () => {
    // Ensure the source-of-truth table exists. tickets.pr_events is created
    // by the unified ticketing schema migration; if running in isolation we
    // create a minimal version sufficient for these tests.
    await pool.query(`CREATE SCHEMA IF NOT EXISTS tickets`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets.pr_events (
        pr_number   integer PRIMARY KEY,
        title       text NOT NULL,
        description text,
        category    text NOT NULL,
        scope       text,
        brand       text REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        merged_at   timestamptz NOT NULL,
        merged_by   text,
        status      text NOT NULL DEFAULT 'shipped',
        created_at  timestamptz NOT NULL DEFAULT now()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets.ticket_links (
        ticket_id  text NOT NULL,
        kind       text NOT NULL,
        pr_number  integer
      )`);
  });

  it('returns rows shaped like TimelineRow from tickets.pr_events', async () => {
    const probePr = 999_999_001;
    await pool.query(
      `INSERT INTO tickets.pr_events (pr_number, title, description, category, scope, brand, merged_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (pr_number) DO UPDATE SET title=EXCLUDED.title`,
      [probePr, 'PR5 listTimeline probe', 'desc', 'feat', 'tickets', 'mentolder', '2026-05-09T12:00:00Z'],
    );

    const rows = await listTimeline({ limit: 50 });
    const probe = rows.find(r => r.pr_number === probePr);
    expect(probe).toBeDefined();
    expect(probe!.title).toBe('PR5 listTimeline probe');
    expect(probe!.category).toBe('feat');
    expect(probe!.brand).toBe('mentolder');
    expect(probe!.day).toBe('2026-05-09');
    // Requirement linkage no longer applies — both fields are NULL.
    expect(probe!.requirement_id).toBeNull();
    expect(probe!.requirement_name).toBeNull();
    expect(typeof probe!.bugs_fixed).toBe('number');

    await pool.query(`DELETE FROM tickets.pr_events WHERE pr_number = $1`, [probePr]);
  });

  it('filters by brand (returns null-brand rows + matching brand)', async () => {
    const ids = [999_999_101, 999_999_102, 999_999_103];
    await pool.query(`DELETE FROM tickets.pr_events WHERE pr_number = ANY($1)`, [ids]);
    await pool.query(
      `INSERT INTO tickets.pr_events (pr_number, title, category, brand, merged_at) VALUES
       ($1, 'mentolder-only', 'feat', 'mentolder', now()),
       ($2, 'korczewski-only', 'feat', 'korczewski', now()),
       ($3, 'no-brand', 'feat', NULL, now())`,
      ids,
    );

    const mentolder = await listTimeline({ brand: 'mentolder', limit: 100 });
    const titles = mentolder.map(r => r.title);
    expect(titles).toContain('mentolder-only');
    expect(titles).toContain('no-brand');
    expect(titles).not.toContain('korczewski-only');

    await pool.query(`DELETE FROM tickets.pr_events WHERE pr_number = ANY($1)`, [ids]);
  });
});

// ── pg-mem-backed tests below (always run) ───────────────────────────────────

beforeEach(() => {
  transitionTicketMock.mockClear();
});

async function seedCustomer(email = `c-${Math.random().toString(36).slice(2)}@x.de`): Promise<string> {
  const c = await upsertCustomer({ name: 'Kunde', email });
  return c.id;
}

describe('customers', () => {
  test('upsertCustomer inserts then updates on conflict (email)', async () => {
    const email = `dup-${Math.random().toString(36).slice(2)}@x.de`;
    const a = await upsertCustomer({ name: 'Erst', email, phone: '123' });
    expect(a.name).toBe('Erst');
    const b = await upsertCustomer({ name: 'Zweit', email, company: 'ACME' });
    expect(b.id).toBe(a.id);
    expect(b.name).toBe('Zweit');
    const full = await getCustomerFullById(b.id);
    expect(full?.company).toBe('ACME');
    expect(full?.phone).toBe('123'); // preserved via COALESCE
  });

  test('listPendingEnrollments / declineEnrollment', async () => {
    const email = `pending-${Math.random().toString(36).slice(2)}@x.de`;
    const c = await upsertCustomer({ name: 'Wartend', email });
    const pending = await listPendingEnrollments();
    expect(pending.some(p => p.id === c.id)).toBe(true);

    await declineEnrollment(c.id);
    const after = await listPendingEnrollments();
    expect(after.some(p => p.id === c.id)).toBe(false);
  });

  test('getCustomerByKeycloakId returns null when unmatched', async () => {
    expect(await getCustomerByKeycloakId('does-not-exist')).toBeNull();
  });

  test('setCustomerNumber validates format and rejects duplicates', async () => {
    const id = await seedCustomer();
    const bad = await setCustomerNumber(id, 'ABC');
    expect(bad.ok).toBe(false);
    const ok = await setCustomerNumber(id, 'M0042');
    expect(ok.ok).toBe(true);

    const id2 = await seedCustomer();
    const dup = await setCustomerNumber(id2, 'M0042');
    expect(dup.ok).toBe(false);
    expect(dup.error).toMatch(/bereits vergeben/);
  });

  test('setAdminNumber validates format and rejects duplicates', async () => {
    const id = await seedCustomer();
    const bad = await setAdminNumber(id, 'X1');
    expect(bad.ok).toBe(false);
    const ok = await setAdminNumber(id, 'A0001');
    expect(ok.ok).toBe(true);

    const id2 = await seedCustomer();
    const dup = await setAdminNumber(id2, 'A0001');
    expect(dup.ok).toBe(false);
  });

  test('setIsAdmin flips flag; listAllCustomers/listAdminUsers partition on it', async () => {
    const id = await seedCustomer();
    await setIsAdmin(id, true);
    const admins = await listAdminUsers();
    expect(admins.some(a => a.id === id)).toBe(true);
    const nonAdmins = await listAllCustomers();
    expect(nonAdmins.some(a => a.id === id)).toBe(false);
  });

  test('getCustomerByEmail finds by exact match, null otherwise', async () => {
    const email = `byemail-${Math.random().toString(36).slice(2)}@x.de`;
    await upsertCustomer({ name: 'X', email });
    expect((await getCustomerByEmail(email))?.email).toBe(email);
    expect(await getCustomerByEmail('nope@nope.de')).toBeNull();
  });
});

describe('assignMeeting', () => {
  test('updates customer/meetingType/projectId on the meeting row', async () => {
    const custId = await seedCustomer();
    const m = await pool.query<{ id: string }>(
      `INSERT INTO meetings (customer_id, meeting_type) VALUES ($1, 'intro') RETURNING id`,
      [custId],
    );
    const meetingId = m.rows[0].id;
    await assignMeeting(meetingId, { customerName: 'Neu', customerEmail: `assign-${Math.random()}@x.de`, meetingType: 'follow_up', projectId: null });
    const row = (await pool.query(`SELECT customer_id, meeting_type, project_id FROM meetings WHERE id=$1`, [meetingId])).rows[0];
    expect(row.meeting_type).toBe('follow_up');
    expect(row.project_id).toBeNull();
  });
});

describe('bug tickets', () => {
  test('insertBugTicket writes ticket + tag + screenshots', async () => {
    const result = await insertBugTicket({
      category: 'fehler',
      reporterEmail: 'reporter@x.de',
      description: 'Etwas ist kaputt',
      brand: 'mentolder',
      screenshots: ['data:image/png;base64,AAA'],
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBeDefined();

    const tag = await pool.query(`SELECT name FROM tickets.tags WHERE name = 'kind:fehler'`);
    expect(tag.rows).toHaveLength(1);
    const shots = await pool.query(`SELECT mime_type FROM tickets.ticket_attachments WHERE ticket_id = $1`, [result!.id]);
    expect(shots.rows[0].mime_type).toBe('image/png');
  });

  // getBugTicketStatus / getBugTicketWithComments / listBugTickets are NOT
  // exercised here: their SQL embeds a *correlated scalar subquery in the
  // SELECT list* (e.g. `(SELECT pr_number FROM tickets.ticket_links WHERE
  // from_id = t.id ...)`), which pg-mem cannot execute — confirmed via a
  // minimal repro ("column \"t.id\" does not exist", a pg-mem limitation,
  // not a bug in website-db.ts). appendBugTicketComment itself (a plain
  // INSERT ... SELECT, no correlated subquery) is still exercised below.
  test('appendBugTicketComment writes a comment row for the bug ticket', async () => {
    const result = await insertBugTicket({
      category: 'fehler', reporterEmail: 'c@x.de', description: 'desc', brand: 'korczewski',
    });
    const comment = await appendBugTicketComment({
      ticketId: result!.ticketId, author: 'admin', body: 'wird untersucht',
    });
    expect(comment.body).toBe('wird untersucht');
    expect(comment.author).toBe('admin');

    const row = await pool.query(
      `SELECT tc.body, tc.kind FROM tickets.ticket_comments tc
       JOIN tickets.tickets t ON t.id = tc.ticket_id WHERE t.id = $1`,
      [result!.id],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].kind).toBe('comment');
  });

  test('resolveBugTicket calls transitionTicket with resolution=fixed', async () => {
    const result = await insertBugTicket({
      category: 'fehler', reporterEmail: 'd@x.de', description: 'desc', brand: 'mentolder',
    });
    await resolveBugTicket(result!.ticketId, 'behoben in PR');
    expect(transitionTicketMock).toHaveBeenCalledWith(
      result!.id,
      expect.objectContaining({ status: 'done', resolution: 'fixed', note: 'behoben in PR' }),
    );
  });

  test('resolveBugTicket throws when ticket is unknown', async () => {
    await expect(resolveBugTicket('BUG-NOPE-3', 'x')).rejects.toThrow(/not found/);
  });

  test('archiveBugTicket calls transitionTicket, no-ops for unknown ticket', async () => {
    const result = await insertBugTicket({
      category: 'erweiterungswunsch', reporterEmail: 'e@x.de', description: 'desc', brand: 'mentolder',
    });
    await archiveBugTicket(result!.ticketId);
    expect(transitionTicketMock).toHaveBeenCalledWith(
      result!.id, expect.objectContaining({ status: 'archived', resolution: 'obsolete' }),
    );

    transitionTicketMock.mockClear();
    await archiveBugTicket('BUG-NOPE-4');
    expect(transitionTicketMock).not.toHaveBeenCalled();
  });

  test('reopenBugTicket calls transitionTicket with status=backlog', async () => {
    const result = await insertBugTicket({
      category: 'fehler', reporterEmail: 'f@x.de', description: 'desc', brand: 'mentolder',
    });
    await reopenBugTicket(result!.ticketId, 'admin', 'doch nicht behoben');
    expect(transitionTicketMock).toHaveBeenCalledWith(
      result!.id, expect.objectContaining({ status: 'backlog', note: 'doch nicht behoben' }),
    );
  });

  test('reopenBugTicket throws when ticket is unknown', async () => {
    await expect(reopenBugTicket('BUG-NOPE-5', 'admin')).rejects.toThrow(/not found/);
  });
});

describe('client notes', () => {
  test('create/list/delete round-trip', async () => {
    const kcId = `notes-${Math.random().toString(36).slice(2)}`;
    expect(await listClientNotes(kcId)).toEqual([]);
    const note = await createClientNote(kcId, 'Wichtiger Kontext');
    expect(note.content).toBe('Wichtiger Kontext');
    const list = await listClientNotes(kcId);
    expect(list).toHaveLength(1);
    await deleteClientNote(note.id);
    expect(await listClientNotes(kcId)).toHaveLength(0);
  });
});

describe('DSGVO audit log', () => {
  test('insertDsgvoRequest writes a row without throwing', async () => {
    await expect(insertDsgvoRequest({ type: 'auskunft', name: 'Max Muster', email: 'max@x.de', ipAddress: '1.2.3.4' })).resolves.toBeUndefined();
    const row = await pool.query(`SELECT * FROM dsgvo_audit_log WHERE email = 'max@x.de'`);
    expect(row.rows).toHaveLength(1);
  });
});
