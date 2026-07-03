// website/src/lib/schema/provider-config-schema.ts
// Idempotente DDL für die VEREINHEITLICHTE tickets.provider_config (globales Routing +
// fusioniertes Coaching) sowie tickets.provider_health.
//
// Ausgelagert aus tickets-db.ts (war: initProviderRouting), damit die Coaching-Fusion
// die Routing-Tabelle um brand + reiche Generierungs-Parameter erweitern kann, ohne die
// zentrale DB-Datei wachsen zu lassen. Autoritativ; gespiegelt in scripts/migrations/*.sql.
// Mehrfach ausführbar (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / IF EXISTS-Guards).

import type { PoolClient } from 'pg';

// Coaching-Felder: alle nullable — nur Coaching-Rows (source='coaching') nutzen sie,
// globale Routing-Rows lassen sie NULL.
const COACHING_COLUMNS: [string, string][] = [
  ['brand', `TEXT NOT NULL DEFAULT '*'`],
  ['is_active', 'BOOLEAN'],
  ['display_name', 'TEXT'],
  ['api_key', 'TEXT'],
  ['api_endpoint', 'TEXT'],
  ['temperature', 'NUMERIC'],
  ['max_tokens', 'INTEGER'],
  ['top_p', 'NUMERIC'],
  ['top_k', 'INTEGER'],
  ['system_prompt', 'TEXT'],
  ['notes', 'TEXT'],
  ['thinking_mode', 'BOOLEAN'],
  ['presence_penalty', 'NUMERIC'],
  ['frequency_penalty', 'NUMERIC'],
  ['safe_prompt', 'BOOLEAN'],
  ['random_seed', 'INTEGER'],
  ['organization_id', 'TEXT'],
  ['eu_endpoint', 'BOOLEAN'],
  ['enabled_fields', 'JSONB'],
];

export async function initProviderConfigSchema(c: PoolClient): Promise<void> {
  // Basis-Tabelle (frische Installs). Bestehende Installs: CREATE ist ein No-Op,
  // die folgenden ALTERs migrieren das alte Schema.
  await c.query(`CREATE TABLE IF NOT EXISTS tickets.provider_config (
    id BIGSERIAL PRIMARY KEY, source TEXT NOT NULL, tier TEXT NOT NULL,
    priority INTEGER NOT NULL, provider TEXT NOT NULL, model_id TEXT NOT NULL, base_url TEXT,
    max_concurrent INTEGER NOT NULL DEFAULT 3, enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (source, tier, priority))`);
  await c.query(`CREATE TABLE IF NOT EXISTS tickets.provider_health (
    provider TEXT PRIMARY KEY, failure_count INTEGER NOT NULL DEFAULT 0, last_failure TIMESTAMPTZ,
    cooldown_until TIMESTAMPTZ, active_agents INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  // Coaching-Fusion: brand + reiche Parameter ergänzen (idempotent).
  for (const [col, type] of COACHING_COLUMNS) {
    await c.query(`ALTER TABLE tickets.provider_config ADD COLUMN IF NOT EXISTS ${col} ${type}`);
  }

  // Alte Installs trugen CHECK (tier IN ('sonnet','haiku')). tier='coaching' braucht den
  // Wegfall dieser DB-CHECK; tier wird auf App-Ebene validiert (ki-services Registry +
  // /api/admin/ki/providers). Constraint-Name = Postgres-Default.
  await c.query(`ALTER TABLE tickets.provider_config DROP CONSTRAINT IF EXISTS provider_config_tier_check`);

  // Brand-scoped Coaching-Eindeutigkeit: ein Eintrag pro (brand, provider) für Coaching.
  await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS provider_config_coaching_brand_provider
    ON tickets.provider_config (brand, provider) WHERE source = 'coaching'`);
  await c.query(`CREATE INDEX IF NOT EXISTS provider_config_coaching_active
    ON tickets.provider_config (brand, source, is_active)`);

  // Token-Budget-Semaphor (T001590): context_window pro Row, context_budget pro Provider
  // (NULL = unbegrenzt), reserved_tokens laufende Reservierung pro Provider.
  await c.query(`ALTER TABLE tickets.provider_config ADD COLUMN IF NOT EXISTS context_window INTEGER`);
  await c.query(`ALTER TABLE tickets.provider_config ADD COLUMN IF NOT EXISTS context_budget INTEGER`);
  await c.query(`ALTER TABLE tickets.provider_health ADD COLUMN IF NOT EXISTS reserved_tokens INTEGER NOT NULL DEFAULT 0`);

  // Globale Default-Routing-Rows (brand='*').
  await c.query(`INSERT INTO tickets.provider_config (source,tier,priority,provider,model_id,base_url)
    VALUES ('*','sonnet',99,'anthropic','claude-sonnet-4-6',NULL),('*','haiku',99,'anthropic','claude-haiku-4-5',NULL),('*','sonnet',1,'deepseek','deepseek-v4-pro','https://api.deepseek.com/anthropic'),('*','haiku',1,'deepseek','deepseek-v4-flash','https://api.deepseek.com/anthropic')
    ON CONFLICT (source,tier,priority) DO NOTHING`);
}
