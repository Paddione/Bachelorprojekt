import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('pg', () => {
   
  const { newDb } = require('pg-mem') as typeof import('pg-mem');
  const mem = newDb();
  // Simplified platform tables (pg-mem can't do uuid/array/timestamptz DDL); seed
  // one English-placeholder row and one admin-customised row per table.
  mem.public.none(`
    CREATE SCHEMA platform;
    CREATE TABLE platform.software_assets (slug text PRIMARY KEY, name text, description text, url text, subdomain text, health_url text, base_status text, updated_at timestamptz, sort_order integer default 0);
    CREATE TABLE platform.hardware_assets (slug text PRIMARY KEY, name text, description text, sort_order integer default 0);
    INSERT INTO platform.software_assets (slug, name, description) VALUES
      ('keycloak', 'Keycloak', 'SSO / OIDC identity provider'),
      ('website',  'Website',  'Mein eigener Text');
    INSERT INTO platform.hardware_assets (slug, name, description) VALUES
      ('pk-hetzner-4', 'PK CP 1', NULL);
    UPDATE platform.software_assets SET subdomain = 'auth', health_url = 'http://keycloak.{ns}.svc.cluster.local:8080/health/ready' WHERE slug = 'keycloak';
    UPDATE platform.software_assets SET subdomain = 'web', health_url = 'http://website.{ns}.svc.cluster.local' WHERE slug = 'website';
  `);
  const { Pool: MemPool } = mem.adapters.createPg();
  function isPlatformCreateDdl(sql: string): boolean {
    const s = sql.toLowerCase();
    return s.includes('create') && (s.includes('platform.software_assets') || s.includes('platform.hardware_assets') || s.includes('schema platform') || s.includes('schema if not exists platform'));
  }
  class CountingPool extends (MemPool as unknown as new (...a: unknown[]) => { query(t: unknown, v?: unknown): Promise<unknown> }) {
    static platformCreateDdlCount = 0;
    async query(textOrConfig: unknown, values?: unknown): Promise<unknown> {
      const sql = typeof textOrConfig === 'string' ? textOrConfig : (textOrConfig as { text?: string })?.text ?? '';
      if (isPlatformCreateDdl(sql)) { CountingPool.platformCreateDdlCount += 1; return { rows: [], rowCount: 0 }; }
      return super.query(textOrConfig, values);
    }
  }
  return { default: { Pool: CountingPool }, Pool: CountingPool };
});
vi.mock('./tickets-schema', () => ({ initTicketsSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./tickets/transition', () => ({ transitionTicket: vi.fn().mockResolvedValue(undefined) }));

import { listSoftwareAssets, listHardwareAssets } from './platform-db';
import { pool, __resetSchemaInitCacheForTests } from './website-db';
const CountingPool = (pool as unknown as { constructor: { platformCreateDdlCount: number } }).constructor;

describe('ensurePlatformSchema seeds German descriptions safely', () => {
  beforeEach(() => { CountingPool.platformCreateDdlCount = 0; __resetSchemaInitCacheForTests(); });

  it('replaces the English placeholder with German but never an admin edit', async () => {
    const sw = await listSoftwareAssets();
    const byslug = Object.fromEntries(sw.map((r) => [r.slug, r.description]));
    expect(byslug.keycloak).toMatch(/Anmeldung/);          // placeholder → German
    expect(byslug.website).toBe('Mein eigener Text');       // admin edit untouched
  });

  it('fills NULL hardware descriptions with German', async () => {
    const hw = await listHardwareAssets();
    expect(hw.find((r) => r.slug === 'pk-hetzner-4')?.description).toMatch(/Fleet/);
  });

  it('runs the platform CREATE DDL only on the first call, not on subsequent ones', async () => {
    await listSoftwareAssets();
    const afterFirst = CountingPool.platformCreateDdlCount; // the single ensure run emits its CREATEs once
    expect(afterFirst).toBeGreaterThan(0);
    await listHardwareAssets();
    await listSoftwareAssets();
    expect(CountingPool.platformCreateDdlCount).toBe(afterFirst); // ensureSchemaOnce → no re-run
  });

  it('exposes seeded subdomain/health_url and is idempotent across two reads', async () => {
    const first = await listSoftwareAssets();
    const kc1 = first.find((r) => r.slug === 'keycloak');
    expect(kc1?.subdomain).toBe('auth');
    expect(kc1?.health_url).toBe('http://keycloak.{ns}.svc.cluster.local:8080/health/ready');
    const second = await listSoftwareAssets();
    const kc2 = second.find((r) => r.slug === 'keycloak');
    expect(kc2?.subdomain).toBe('auth');
    expect(kc2?.health_url).toBe(kc1?.health_url);
  });
});
