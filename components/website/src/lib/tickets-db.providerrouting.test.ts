import { describe, it, expect, vi } from 'vitest';

// Spiegelt das VEREINHEITLICHTE provider_config-Schema (siehe schema/provider-config-schema.ts):
// brand + Coaching-Spalten, KEIN tier-CHECK mehr (tier wird app-seitig validiert), Default-Rows
// inkl. DeepSeek.
vi.mock('pg', () => {
  const { newDb } = require('pg-mem') as typeof import('pg-mem');
  const mem = newDb({ noAstCoverageCheck: true });
  mem.public.none(`
    CREATE SCHEMA tickets;
    CREATE TABLE tickets.provider_config (
      id             BIGSERIAL PRIMARY KEY,
      source         TEXT NOT NULL,
      tier           TEXT NOT NULL,
      priority       INTEGER NOT NULL,
      provider       TEXT NOT NULL,
      model_id       TEXT NOT NULL,
      base_url       TEXT,
      api_key        TEXT,
      max_concurrent INTEGER NOT NULL DEFAULT 3,
      enabled        BOOLEAN NOT NULL DEFAULT true,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      brand          TEXT NOT NULL DEFAULT '*',
      is_active      BOOLEAN,
      context_window INTEGER,
      context_budget INTEGER,
      UNIQUE (source, tier, priority)
    );
    CREATE TABLE tickets.provider_health (
      provider       TEXT PRIMARY KEY,
      failure_count  INTEGER NOT NULL DEFAULT 0,
      last_failure   TIMESTAMPTZ,
      cooldown_until TIMESTAMPTZ,
      active_agents  INTEGER NOT NULL DEFAULT 0,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO tickets.provider_config (source, tier, priority, provider, model_id, base_url)
    VALUES
      ('*', 'sonnet', 99, 'anthropic', 'claude-sonnet-4-6', NULL),
      ('*', 'haiku',  99, 'anthropic', 'claude-haiku-4-5',  NULL)
    ON CONFLICT (source, tier, priority) DO NOTHING;
  `);
  const { Pool } = mem.adapters.createPg();
  return { default: { Pool }, Pool };
});
vi.mock('./tickets-schema', () => ({
  initTicketsSchema: vi.fn().mockResolvedValue(undefined),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}));

import { pool } from './website-db';
import { getProviderConfig, setProviderCooldown } from './provider-config';

describe('provider routing schema', () => {
  it('erlaubt tier=coaching (Coaching-Fusion; tier-Validierung ist app-seitig)', async () => {
    await pool.query(
      `INSERT INTO tickets.provider_config (brand,source,tier,priority,provider,model_id,is_active)
       VALUES ('mentolder','coaching','coaching',1,'claude','',true)`,
    );
    const { rows } = await pool.query(`SELECT brand, tier FROM tickets.provider_config WHERE source='coaching'`);
    expect(rows[0]).toMatchObject({ brand: 'mentolder', tier: 'coaching' });
  });

  it('seeds wildcard anthropic rows for sonnet and haiku', async () => {
    const { rows } = await pool.query(
      `SELECT tier FROM tickets.provider_config WHERE source='*' AND provider='anthropic' ORDER BY tier`,
    );
    expect(rows.map((r: { tier: string }) => r.tier)).toEqual(['haiku', 'sonnet']);
  });

  it('creates provider_health keyed by provider', async () => {
    await pool.query(`INSERT INTO tickets.provider_health (provider) VALUES ('deepseek') ON CONFLICT DO NOTHING`);
    const { rows } = await pool.query(`SELECT active_agents, failure_count FROM tickets.provider_health WHERE provider='deepseek'`);
    expect(rows[0]).toMatchObject({ active_agents: 0, failure_count: 0 });
  });
});

describe('provider-config helpers', () => {
  it('apiKeyForProvider returns non-empty string for local-cluster (no key needed)', async () => {
    await pool.query(
      `INSERT INTO tickets.provider_config (source, tier, priority, provider, model_id, base_url)
       VALUES ('assistant-chat', 'sonnet', 1, 'local-cluster', 'mistral', 'http://llm-gw:11434/v1')
       ON CONFLICT (source, tier, priority) DO UPDATE SET provider=EXCLUDED.provider`,
    );
    const cfg = await getProviderConfig('assistant-chat', 'sonnet');
    expect(cfg.provider).toBe('local-cluster');
    expect(cfg.apiKey).toBeTruthy();
  });

  it('setProviderCooldown inserts/updates provider_health cooldown_until', async () => {
    await setProviderCooldown(pool, 'ticket-triage', 'deepseek', 5);
    const { rows } = await pool.query(
      `SELECT cooldown_until FROM tickets.provider_health WHERE provider = 'deepseek'`,
    );
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].cooldown_until).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('provider routing DDL lebt im ausgelagerten Schema-Modul', () => {
  it('provider-config-schema.ts enthält CREATE TABLE für provider_config und provider_health', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('./schema/provider-config-schema.ts', import.meta.url)), 'utf8');
    expect(src).toContain('CREATE TABLE IF NOT EXISTS tickets.provider_config');
    expect(src).toContain('CREATE TABLE IF NOT EXISTS tickets.provider_health');
  });

  it('seedet wildcard anthropic + deepseek Rows', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('./schema/provider-config-schema.ts', import.meta.url)), 'utf8');
    expect(src).toContain("('*','sonnet',99,'anthropic'");
    expect(src).toContain("('*','haiku',99,'anthropic'");
    expect(src).toContain("'deepseek'");
  });

  it('tickets-db.ts ruft das ausgelagerte initProviderConfigSchema auf', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('./tickets-schema.ts', import.meta.url)), 'utf8');
    expect(src).toContain('initProviderConfigSchema');
  });
});
