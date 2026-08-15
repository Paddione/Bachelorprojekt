// Regression test for T000304 — admin content saves silently stopped
// persisting for ~30 days on web.mentolder.de (homepage, prices/Leistungen).
//
// ROOT CAUSE: website-db.ts runs idempotent schema-init DDL on the REQUEST HOT
// PATH. getSiteSetting()/setSiteSetting() each call initSiteSettingsTable()
// first, which runs `CREATE TABLE IF NOT EXISTS site_settings ...` plus a
// `DO $$ ... ALTER TABLE ADD CONSTRAINT ... $$` block on EVERY call. Under
// concurrent admin requests those multi-statement DDL ops race on the Postgres
// system catalog ("tuple concurrently updated"); the failed multi-statement
// DDL then leaves the pooled pg connection in an aborted-transaction state, so
// every subsequent save on that pooled connection fails until the pod restarts.
//
// pg-mem is single-threaded JS and CANNOT reproduce the real Postgres
// concurrent-catalog race. So instead of trying to trigger "tuple concurrently
// updated", this test asserts the STRUCTURAL INVARIANT the fix must establish:
//
//   Schema-initialization DDL must NOT run on every read/write request.
//   Calling setSiteSetting()/getSiteSetting() N times must trigger the
//   site_settings table/constraint init AT MOST ONCE (ideally zero times after
//   a one-time/startup init), NOT once per call.
//
// TODAY (current code, which calls initSiteSettingsTable on every call) this
// FAILS — three saves run the init DDL three times. After the planned fix
// (run-once guard / init moved off the hot path) it will PASS.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Test scaffolding (NOT the fix) -----------------------------------------
// We mock the `pg` module BEFORE website-db.ts imports it, so its module-level
// `export const pool = new Pool(...)` gets a pg-mem backed pool whose `query`
// is wrapped to TALLY how many times schema-init DDL for `site_settings` runs.
//
// vi.mock factories are hoisted above the imports, so everything the factory
// needs (pg-mem, the shared db, the counter) is created INSIDE the factory and
// the counter is exposed as a static on the returned Pool class. The test body
// reads it via that class.
//
// This is a TEST SEAM ONLY: it observes the SQL the production code already
// emits. The fix lives in website-db.ts (a run-once guard or moving init off
// the hot path) — this file must NOT be the thing that changes to make it pass.

vi.mock('pg', () => {
  // require() is available inside a vi.mock factory (it runs in CJS-interop
  // context); pg-mem is single-threaded but fine for observing emitted SQL.
   
  const { newDb } = require('pg-mem') as typeof import('pg-mem');

  const mem = newDb();
  // Pre-create the real schema (brands + site_settings) so the read/write
  // queries succeed without relying on the production init DDL. pg-mem has
  // limited DDL coverage, so we DO NOT run the production init SQL through it —
  // instead we count it and swallow it (see CountingPool.query below). This is
  // exactly the structural property the fix establishes: init is decoupled from
  // the hot path.
  mem.public.none(`
    CREATE TABLE public.brands (
      id   text PRIMARY KEY,
      name text NOT NULL
    );
    INSERT INTO public.brands (id, name) VALUES ('mentolder', 'mentolder');

    CREATE TABLE site_settings (
      brand      text REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      key        text,
      value      text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (brand, key)
    );
  `);

  const { Pool: MemPool } = mem.adapters.createPg();

  // Detects the schema-init DDL that initSiteSettingsTable() emits:
  // CREATE TABLE ... site_settings, ALTER TABLE site_settings ..., or the
  // DO $$ ... site_settings_brand_fkey ... $$ guard block.
  function isSiteSettingsInitDdl(sql: string): boolean {
    const s = sql.toLowerCase();
    const mentionsSiteSettings =
      s.includes('site_settings') || s.includes('site_settings_brand_fkey');
    const isDdl =
      s.includes('create table') ||
      s.includes('alter table') ||
      s.includes('do $$');
    return mentionsSiteSettings && isDdl;
  }

  class CountingPool extends (MemPool as unknown as new (...a: unknown[]) => {
    query(t: unknown, v?: unknown): Promise<unknown>;
  }) {
    // Exposed to the test body. Reset in beforeEach.
    static siteSettingsInitDdlCount = 0;

    override async query(textOrConfig: unknown, values?: unknown): Promise<unknown> {
      const sql =
        typeof textOrConfig === 'string'
          ? textOrConfig
          : (textOrConfig as { text?: string })?.text ?? '';

      // Count AND swallow the production schema-init DDL. The table already
      // exists in the seeded pg-mem db, and pg-mem can't execute the
      // multi-statement CREATE TABLE + DO $$ block anyway. Swallowing it keeps
      // the harness focused on the invariant: how MANY times init runs.
      if (isSiteSettingsInitDdl(sql)) {
        CountingPool.siteSettingsInitDdlCount += 1;
        return { rows: [], rowCount: 0 };
      }
      return super.query(textOrConfig, values);
    }
  }

  return { default: { Pool: CountingPool }, Pool: CountingPool };
});

// initTicketsSchema is also called per-request from other website-db functions
// but is irrelevant to the site_settings invariant under test — stub it out so
// it can't touch the DB or skew counts.
vi.mock('./tickets-schema', () => ({
  initTicketsSchema: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./tickets/transition', () => ({
  transitionTicket: vi.fn().mockResolvedValue(undefined),
}));

// Import AFTER the mocks are registered. website-db's module-level
// `new Pool(...)` is now our CountingPool.
import { setSiteSetting, getSiteSetting, pool, __resetSchemaInitCacheForTests } from './website-db';

// The pool instance is a CountingPool; reach its constructor to read/reset the
// static counter without re-importing the mocked module.
const CountingPool = (pool as unknown as { constructor: { siteSettingsInitDdlCount: number } })
  .constructor;

describe('website-db site_settings schema init is NOT on the hot path (T000304)', () => {
  beforeEach(() => {
    CountingPool.siteSettingsInitDdlCount = 0;
    __resetSchemaInitCacheForTests();
  });

  it('runs site_settings init DDL at most once across multiple setSiteSetting calls', async () => {
    await setSiteSetting('mentolder', 'hero_title', 'Willkommen');
    await setSiteSetting('mentolder', 'hero_title', 'Willkommen v2');
    await setSiteSetting('mentolder', 'price_block', '60 EUR');

    // RED today: current code runs initSiteSettingsTable() on every call → 3.
    // GREEN after the fix: a run-once guard / startup init → <= 1.
    expect(CountingPool.siteSettingsInitDdlCount).toBeLessThanOrEqual(1);
  });

  it('runs site_settings init DDL at most once across mixed get/set calls', async () => {
    await getSiteSetting('mentolder', 'hero_title');
    await setSiteSetting('mentolder', 'hero_title', 'X');
    await getSiteSetting('mentolder', 'hero_title');

    expect(CountingPool.siteSettingsInitDdlCount).toBeLessThanOrEqual(1);
  });

  it('persists the value (sanity: the save path still works under the harness)', async () => {
    await setSiteSetting('mentolder', 'sanity_key', 'sanity_value');
    expect(await getSiteSetting('mentolder', 'sanity_key')).toBe('sanity_value');
  });
});
