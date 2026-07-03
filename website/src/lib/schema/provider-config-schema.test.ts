import { describe, it, expect } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { initProviderConfigSchema } from './provider-config-schema';

function freshPool(): Pool {
  // noAstCoverageCheck: pg-mem flaggt sonst das zweite (idempotente) `CREATE TABLE IF NOT
  // EXISTS` als "AST nicht gelesen" — in echtem Postgres ein sauberer No-Op.
  const db = newDb({ noAstCoverageCheck: true });
  db.public.none('CREATE SCHEMA tickets');
  const { Pool: PgMemPool } = db.adapters.createPg();
  return new PgMemPool() as unknown as Pool;
}

describe('initProviderConfigSchema (Coaching-Fusion)', () => {
  it('legt provider_config mit brand + Coaching-Spalten an und erlaubt tier=coaching', async () => {
    const pool = freshPool();
    await initProviderConfigSchema(pool as never);
    await pool.query(
      `INSERT INTO tickets.provider_config
         (brand, source, tier, priority, provider, model_id, is_active, api_key, temperature, system_prompt, eu_endpoint, enabled_fields)
       VALUES ('mentolder','coaching','coaching',1,'claude','',true,'sk-x',0.5,'Sei hilfreich',true,'["apiKey"]'::jsonb)`,
    );
    const r = await pool.query(
      `SELECT brand, tier, api_key, temperature, is_active, system_prompt FROM tickets.provider_config WHERE source='coaching'`,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].brand).toBe('mentolder');
    expect(r.rows[0].tier).toBe('coaching');
    expect(r.rows[0].is_active).toBe(true);
    expect(r.rows[0].api_key).toBe('sk-x');
  });

  it('seedet vier globale Default-Routing-Rows (brand=*)', async () => {
    const pool = freshPool();
    await initProviderConfigSchema(pool as never);
    const r = await pool.query(`SELECT count(*)::int AS n FROM tickets.provider_config WHERE source='*'`);
    expect(r.rows[0].n).toBe(4);
  });

  it('ist idempotent — zweimal anwenden wirft nicht und dupliziert keine Defaults', async () => {
    const pool = freshPool();
    await initProviderConfigSchema(pool as never);
    await initProviderConfigSchema(pool as never);
    const r = await pool.query(`SELECT count(*)::int AS n FROM tickets.provider_config WHERE source='*'`);
    expect(r.rows[0].n).toBe(4);
  });

  it('adds context_window, context_budget, reserved_tokens columns (T001590)', async () => {
    const pool = freshPool();
    await initProviderConfigSchema(pool as never);
    // Hinweis: pg-mem meldet table_schema immer als 'public' (Schema-Quirk) — daher hier
    // kein table_schema-Filter, table_name reicht zur eindeutigen Identifikation.
    const cfgCols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='provider_config'
          AND column_name IN ('context_window','context_budget')`,
    );
    expect(cfgCols.rows.map((r) => r.column_name).sort()).toEqual(['context_budget', 'context_window']);
    const healthCol = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='provider_health' AND column_name='reserved_tokens'`,
    );
    expect(healthCol.rows).toHaveLength(1);
  });
});
