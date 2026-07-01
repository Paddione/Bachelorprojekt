// Split out of website-db.test.ts (S1 file-size gate) — content/site-settings
// area: service/leistungen config, site settings + derived helpers, legal
// pages, referenzen, onboarding checklist, follow-ups, homepage/uebermich/
// faq/kontakt content, admin shortcuts, invoice counters, custom website
// sections, content versioning. See website-db.test.ts for the DB-backed
// listTimeline suite and the shared pg-mem mock rationale.
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
  initServiceConfigTable, getServiceConfig, saveServiceConfig,
  initLeistungenConfigTable, getLeistungenConfig, saveLeistungenConfig,
  getSiteSetting, setSiteSetting, getJsonSetting, setJsonSetting,
  getSeoTitle, getSeoOgImage, getSeoMeta,
  getVacationPeriods, saveVacationPeriods,
  getLegalPage, saveLegalPage,
  getReferenzen, saveReferenzen,
  getHomepageContent, saveHomepageContent,
  getUebermichContent, saveUebermichContent,
  getFaqContent, saveFaqContent,
  getKontaktContent, saveKontaktContent,
  listAdminShortcuts, createAdminShortcut, deleteAdminShortcut, updateAdminShortcut,
  getNextInvoiceNumber, seedInvoiceCounter,
  listCustomSections, getCustomSection, createCustomSection, updateCustomSection, deleteCustomSection,
  readContent, writeContent, listVersions, ContentConflictError,
  getOrCreateOnboardingChecklist, toggleOnboardingItem, resetOnboardingChecklist,
  createFollowUp, listFollowUps, getDueFollowUps, updateFollowUp, deleteFollowUp,
} from './website-db';

// ── pg-mem-backed tests below (always run) ───────────────────────────────────

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
