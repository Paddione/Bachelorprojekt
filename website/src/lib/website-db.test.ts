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
  initServiceConfigTable, getServiceConfig, saveServiceConfig,
  initLeistungenConfigTable, getLeistungenConfig, saveLeistungenConfig,
  getSiteSetting, setSiteSetting, getJsonSetting, setJsonSetting,
  getSeoTitle, getSeoOgImage, getSeoMeta,
  getVacationPeriods, saveVacationPeriods,
  getLegalPage, saveLegalPage,
  getReferenzen, saveReferenzen,
  createProject, updateProject, deleteProject,
  createSubProject, updateSubProject, deleteSubProject,
  listDirectTasks, listSubProjectTasks, createProjectTask, updateProjectTask, deleteProjectTask,
  listProjectAttachments, getProjectAttachment, createProjectAttachment, deleteProjectAttachmentRecord,
  listProjectsForCustomer, togglePortalTaskDone,
  getLastTimeEntryRate, createTimeEntry, listTimeEntries, listAllTimeEntries,
  setTimeEntryStripeInvoice, getTimeEntryIdsByInvoice, getUnbilledBillableEntriesByCustomer,
  deleteTimeEntry, getProjectTotalMinutes,
  listMeetingsForProject, assignMeetingToProject, findProjectByName,
  listUnassignedMeetingsForCustomer, claimBrettLinkPost,
  listClientNotes, createClientNote, deleteClientNote,
  getOrCreateOnboardingChecklist, toggleOnboardingItem, resetOnboardingChecklist,
  createFollowUp, listFollowUps, getDueFollowUps, updateFollowUp, deleteFollowUp,
  getHomepageContent, saveHomepageContent,
  getUebermichContent, saveUebermichContent,
  getFaqContent, saveFaqContent,
  getKontaktContent, saveKontaktContent,
  listAdminShortcuts, createAdminShortcut, deleteAdminShortcut, updateAdminShortcut,
  insertDsgvoRequest,
  getNextInvoiceNumber, seedInvoiceCounter,
  listCustomSections, getCustomSection, createCustomSection, updateCustomSection, deleteCustomSection,
  readContent, writeContent, listVersions, ContentConflictError,
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

describe('service / leistungen config', () => {
  test('getServiceConfig returns null then saved value after saveServiceConfig', async () => {
    await initServiceConfigTable();
    expect(await getServiceConfig('mentolder')).toBeNull();
    const overrides = [{ slug: 'coaching', title: 'Coaching', description: 'd', icon: 'i', features: ['a'] }];
    await saveServiceConfig('mentolder', overrides);
    expect(await getServiceConfig('mentolder')).toEqual(overrides);
    // Upsert path (ON CONFLICT DO UPDATE)
    const updated = [...overrides, { slug: 'x', title: 'X', description: '', icon: '', features: [] }];
    await saveServiceConfig('mentolder', updated);
    expect(await getServiceConfig('mentolder')).toHaveLength(2);
  });

  test('getLeistungenConfig / saveLeistungenConfig round-trip', async () => {
    await initLeistungenConfigTable();
    expect(await getLeistungenConfig('korczewski')).toBeNull();
    const categories = [{ id: 'cat1', title: 'Kategorie 1' }];
    await saveLeistungenConfig('korczewski', categories);
    expect(await getLeistungenConfig('korczewski')).toEqual(categories);
  });
});

describe('site settings + derived helpers', () => {
  test('getSiteSetting/setSiteSetting round-trip and overwrite', async () => {
    expect(await getSiteSetting('mentolder', 'k1')).toBeNull();
    await setSiteSetting('mentolder', 'k1', 'v1');
    expect(await getSiteSetting('mentolder', 'k1')).toBe('v1');
    await setSiteSetting('mentolder', 'k1', 'v2');
    expect(await getSiteSetting('mentolder', 'k1')).toBe('v2');
  });

  test('getJsonSetting/setJsonSetting round-trip, null on absent/unparseable', async () => {
    expect(await getJsonSetting('mentolder', 'missing-json')).toBeNull();
    await setJsonSetting('mentolder', 'kore_flags', { timeline: true });
    expect(await getJsonSetting('mentolder', 'kore_flags')).toEqual({ timeline: true });
  });

  test('getSeoTitle/getSeoOgImage/getSeoMeta read seo_*-prefixed keys', async () => {
    await setSiteSetting('mentolder', 'seo_title_startseite', 'Titel');
    await setSiteSetting('mentolder', 'seo_meta_desc_startseite', 'Beschreibung');
    await setSiteSetting('mentolder', 'seo_og_image_startseite', '/img.png');
    expect(await getSeoTitle('mentolder', 'startseite')).toBe('Titel');
    expect(await getSeoOgImage('mentolder', 'startseite')).toBe('/img.png');
    const meta = await getSeoMeta('mentolder', 'startseite');
    expect(meta).toEqual({ title: 'Titel', description: 'Beschreibung', ogImage: '/img.png' });
  });

  test('getSeoMeta returns all-null shape when nothing set', async () => {
    const meta = await getSeoMeta('mentolder', 'nichts-gesetzt');
    expect(meta).toEqual({ title: null, description: null, ogImage: null });
  });

  test('getVacationPeriods/saveVacationPeriods round-trip, [] when absent', async () => {
    expect(await getVacationPeriods('korczewski')).toEqual([]);
    const periods = [{ id: '1', start: '2026-07-01', end: '2026-07-14', label: 'Urlaub' }];
    await saveVacationPeriods('korczewski', periods);
    expect(await getVacationPeriods('korczewski')).toEqual(periods);
  });
});

describe('legal pages', () => {
  test('getLegalPage/saveLegalPage round-trip and upsert', async () => {
    expect(await getLegalPage('mentolder', 'impressum')).toBeNull();
    await saveLegalPage('mentolder', 'impressum', '<p>v1</p>');
    expect(await getLegalPage('mentolder', 'impressum')).toBe('<p>v1</p>');
    await saveLegalPage('mentolder', 'impressum', '<p>v2</p>');
    expect(await getLegalPage('mentolder', 'impressum')).toBe('<p>v2</p>');
  });
});

describe('referenzen', () => {
  test('getReferenzen normalizes legacy bare-array shape', async () => {
    await saveReferenzen('mentolder', { types: [{ id: 't1', label: 'Typ' }], items: [{ id: 'i1', text: 'Ref' } as never] } as never);
    const cfg = await getReferenzen('mentolder');
    expect(cfg?.types).toHaveLength(1);
    expect(cfg?.items).toHaveLength(1);
  });

  test('getReferenzen returns null when nothing saved', async () => {
    expect(await getReferenzen('korczewski')).toBeNull();
  });
});

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

describe('onboarding checklist', () => {
  test('getOrCreateOnboardingChecklist seeds defaults once, then returns existing', async () => {
    const kcId = `onboard-${Math.random().toString(36).slice(2)}`;
    const seeded = await getOrCreateOnboardingChecklist(kcId);
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.every(i => i.done === false)).toBe(true);

    const again = await getOrCreateOnboardingChecklist(kcId);
    expect(again).toHaveLength(seeded.length); // not re-seeded

    await toggleOnboardingItem(seeded[0].id, true);
    const afterToggle = await getOrCreateOnboardingChecklist(kcId);
    expect(afterToggle.find(i => i.id === seeded[0].id)?.done).toBe(true);

    await resetOnboardingChecklist(kcId);
    const afterReset = await getOrCreateOnboardingChecklist(kcId);
    expect(afterReset.every(i => i.done === false)).toBe(true);
  });
});

describe('follow-ups', () => {
  test('create/list/getDue/update/delete lifecycle', async () => {
    const past = await createFollowUp({ reason: 'Rückruf fällig', dueDate: '2020-01-01', clientEmail: 'f1@x.de' });
    const future = await createFollowUp({ reason: 'Später', dueDate: '2099-01-01', clientEmail: 'f2@x.de' });

    const due = await getDueFollowUps();
    expect(due.map(f => f.id)).toContain(past.id);
    expect(due.map(f => f.id)).not.toContain(future.id);

    await updateFollowUp(past.id, { done: true });
    const openOnly = await listFollowUps(false);
    expect(openOnly.map(f => f.id)).not.toContain(past.id);
    const withDone = await listFollowUps(true);
    expect(withDone.map(f => f.id)).toContain(past.id);

    // no-op when no fields given
    await updateFollowUp(future.id, {});

    await deleteFollowUp(future.id);
    expect((await listFollowUps(true)).map(f => f.id)).not.toContain(future.id);
  });
});

describe('homepage / uebermich / faq / kontakt content (site_settings-backed JSON)', () => {
  test('homepage content round-trip, null when unset', async () => {
    expect(await getHomepageContent('mentolder')).toBeNull();
    const data = { hero: { title: 't', subtitle: 's', tagline: 'tl' }, stats: [], servicesHeadline: '', servicesSubheadline: '', whyMeHeadline: '', whyMeIntro: '', whyMePoints: [], quote: '', quoteName: '' };
    await saveHomepageContent('mentolder', data);
    expect(await getHomepageContent('mentolder')).toEqual(data);
  });

  test('uebermich content round-trip, null when unset', async () => {
    expect(await getUebermichContent('korczewski')).toBeNull();
    const data = { pageHeadline: 'h', subheadline: 's', introParagraphs: [], sections: [], milestones: [], notDoing: [], privateText: '' };
    await saveUebermichContent('korczewski', data);
    expect(await getUebermichContent('korczewski')).toEqual(data);
  });

  test('faq content round-trip, null when unset', async () => {
    expect(await getFaqContent('mentolder')).toBeNull();
    const items = [{ question: 'Q?', answer: 'A.' }];
    await saveFaqContent('mentolder', items);
    expect(await getFaqContent('mentolder')).toEqual(items);
  });

  test('kontakt content round-trip, null when unset', async () => {
    expect(await getKontaktContent('mentolder')).toBeNull();
    const data = { intro: 'i', sidebarTitle: 't', sidebarText: 'tx', sidebarCta: 'cta', showPhone: true };
    await saveKontaktContent('mentolder', data);
    expect(await getKontaktContent('mentolder')).toEqual(data);
  });
});

describe('admin shortcuts', () => {
  test('create/list/update/delete lifecycle', async () => {
    const shortcut = await createAdminShortcut('https://example.com', 'Beispiel');
    expect(shortcut.url).toBe('https://example.com');
    const list = await listAdminShortcuts();
    expect(list.map(s => s.id)).toContain(shortcut.id);

    const updated = await updateAdminShortcut(shortcut.id, { label: 'Neu' });
    expect(updated?.label).toBe('Neu');
    expect(updated?.url).toBe('https://example.com');

    expect(await updateAdminShortcut(shortcut.id, {})).toBeNull();

    await deleteAdminShortcut(shortcut.id);
    expect((await listAdminShortcuts()).map(s => s.id)).not.toContain(shortcut.id);
  });
});

describe('DSGVO audit log', () => {
  test('insertDsgvoRequest writes a row without throwing', async () => {
    await expect(insertDsgvoRequest({ type: 'auskunft', name: 'Max Muster', email: 'max@x.de', ipAddress: '1.2.3.4' })).resolves.toBeUndefined();
    const row = await pool.query(`SELECT * FROM dsgvo_audit_log WHERE email = 'max@x.de'`);
    expect(row.rows).toHaveLength(1);
  });
});

describe('invoice counters', () => {
  test('getNextInvoiceNumber increments per (brand, year, kind)', async () => {
    const first = await getNextInvoiceNumber('mentolder', 'invoice');
    const second = await getNextInvoiceNumber('mentolder', 'invoice');
    expect(first).toMatch(/^RE-\d{4}-0001$/);
    expect(second).toMatch(/^RE-\d{4}-0002$/);

    const gutschrift = await getNextInvoiceNumber('mentolder', 'gutschrift');
    expect(gutschrift).toMatch(/^GS-\d{4}-0001$/);
  });

  // FOUND BUG (not fixed — see task report): seedInvoiceCounter() issues
  // `INSERT ... ON CONFLICT (brand, year) DO NOTHING`, but the table's
  // actual unique constraint (after initInvoiceCountersTable()'s own
  // migration) is the 3-column PRIMARY KEY (brand, year, kind). Postgres
  // validates the ON CONFLICT target against existing constraints at parse
  // time regardless of whether a row actually conflicts, so this always
  // throws "there is no unique or exclusion constraint matching the ON
  // CONFLICT specification" — reproduced here against pg-mem, which mirrors
  // real Postgres's behavior for this exact error.
  test('seedInvoiceCounter throws — ON CONFLICT (brand, year) target does not match the (brand, year, kind) PK', async () => {
    await expect(seedInvoiceCounter('korczewski', 2020, 41)).rejects.toThrow(/no unique or exclusion constraint/);
  });
});

describe('custom website sections', () => {
  test('create/list/get/update/delete lifecycle', async () => {
    const slug = `sec-${Math.random().toString(36).slice(2)}`;
    const created = await createCustomSection({ slug, title: 'Testsektion', fields: [{ name: 'f1', label: 'F1', type: 'text', required: true }] });
    expect(created.slug).toBe(slug);

    const fetched = await getCustomSection(slug);
    expect(fetched?.title).toBe('Testsektion');

    const list = await listCustomSections();
    expect(list.map(s => s.slug)).toContain(slug);

    const updated = await updateCustomSection(slug, { title: 'Neu', content: { f1: 'Wert' } });
    expect(updated?.title).toBe('Neu');
    expect(updated?.content).toEqual({ f1: 'Wert' });

    // no fields given -> falls back to plain getCustomSection
    const unchanged = await updateCustomSection(slug, {});
    expect(unchanged?.title).toBe('Neu');

    await deleteCustomSection(slug);
    expect(await getCustomSection(slug)).toBeNull();
  });
});

// Uses site_setting keys ('navigation'/'footer'/'stammdaten') that no other
// describe block in this file touches, so "never written yet" assertions
// stay valid regardless of test execution order (the pg-mem instance is
// shared for the whole file, like a single long-lived DB connection).
describe('content versioning (readContent/writeContent/listVersions)', () => {
  test('readContent returns version=0/value=null for a never-written key', async () => {
    const read = await readContent('mentolder', 'navigation');
    expect(read).toEqual({ value: null, version: 0 });
  });

  test('readContent throws for an unknown contentKey', async () => {
    await expect(readContent('mentolder', 'does-not-exist')).rejects.toThrow(/unknown contentKey/);
  });

  test('writeContent creates v1, then v2 with a version-history snapshot; listVersions surfaces it', async () => {
    const first = await writeContent('mentolder', 'footer', { intro: 'v1' }, 0, 'editor@x.de');
    expect(first.version).toBe(1);
    expect((await readContent('mentolder', 'footer')).value).toEqual({ intro: 'v1' });

    const second = await writeContent('mentolder', 'footer', { intro: 'v2' }, 1, 'editor@x.de');
    expect(second.version).toBe(2);

    const versions = await listVersions('mentolder', 'footer');
    expect(versions).toHaveLength(1); // only prior state (v1) is archived
    expect(versions[0].editor).toBe('editor@x.de');
    expect((versions[0].snapshot as { value: { intro: string } }).value.intro).toBe('v1');
  });

  test('writeContent rejects a stale baseVersion with ContentConflictError', async () => {
    await writeContent('mentolder', 'stammdaten', { a: 1 }, 0, 'a@x.de');
    await expect(writeContent('mentolder', 'stammdaten', { a: 2 }, 0, 'b@x.de')).rejects.toBeInstanceOf(ContentConflictError);
  });

  test('writeContent supports legal_page content type', async () => {
    const w = await writeContent('mentolder', 'legal:impressum', '<p>Impressum</p>', 0, 'a@x.de');
    expect(w.version).toBe(1);
    const r = await readContent('mentolder', 'legal:impressum');
    expect(r.value).toBe('<p>Impressum</p>');
  });

  test('writeContent supports leistungen content type', async () => {
    const w = await writeContent('mentolder', 'leistungen', [{ id: 'cat' }], 0, 'a@x.de');
    expect(w.version).toBe(1);
    const r = await readContent('mentolder', 'leistungen');
    expect(r.value).toEqual([{ id: 'cat' }]);
  });

  test('writeContent supports service content type (service_page_config)', async () => {
    const w = await writeContent('mentolder', 'service:coaching', { headline: 'Coaching' }, 0, 'a@x.de');
    expect(w.version).toBe(1);
    const r = await readContent('mentolder', 'service:coaching');
    expect(r.value).toEqual({ headline: 'Coaching' });
  });
});
