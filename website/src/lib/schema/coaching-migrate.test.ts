import { describe, it, expect } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { initProviderConfigSchema } from './provider-config-schema';
import { migrateCoachingKiConfig } from './coaching-migrate';

async function setup(): Promise<Pool> {
  const db = newDb({ noAstCoverageCheck: true });
  db.public.none(`
    CREATE SCHEMA tickets;
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.ki_config (
      id SERIAL PRIMARY KEY, brand TEXT, provider TEXT, is_active BOOLEAN,
      model_name TEXT, display_name TEXT, api_key TEXT, api_endpoint TEXT,
      temperature NUMERIC, max_tokens INT, top_p NUMERIC, top_k INT,
      system_prompt TEXT, notes TEXT, thinking_mode BOOLEAN, presence_penalty NUMERIC,
      frequency_penalty NUMERIC, safe_prompt BOOLEAN, random_seed INT,
      organization_id TEXT, eu_endpoint BOOLEAN, enabled_fields JSONB
    );
    CREATE TABLE coaching.sessions (
      id SERIAL PRIMARY KEY,
      ki_config_id INT,
      CONSTRAINT sessions_ki_config_id_fkey FOREIGN KEY (ki_config_id)
        REFERENCES coaching.ki_config(id) ON DELETE SET NULL
    );
    INSERT INTO coaching.ki_config (brand,provider,is_active,model_name,display_name,api_key,temperature)
      VALUES ('mentolder','claude',true,'claude-haiku','Claude','sk-1',0.4),
             ('mentolder','openai',false,NULL,'GPT',NULL,NULL);
    INSERT INTO coaching.sessions (ki_config_id) VALUES (1),(2),(NULL);
  `);
  const { Pool: PgMemPool } = db.adapters.createPg();
  const pool = new PgMemPool() as unknown as Pool;
  await initProviderConfigSchema(pool as never);
  return pool;
}

describe('migrateCoachingKiConfig', () => {
  it('überführt coaching.ki_config nach provider_config (source=coaching) mit allen Feldern', async () => {
    const pool = await setup();
    const res = await migrateCoachingKiConfig(pool as never);
    expect(res.migrated).toBe(2);
    const { rows } = await pool.query(
      `SELECT brand, provider, model_id, is_active, api_key, temperature FROM tickets.provider_config WHERE source='coaching' ORDER BY provider`,
    );
    expect(rows.map((r: any) => r.provider)).toEqual(['claude', 'openai']);
    const claude = rows.find((r: any) => r.provider === 'claude');
    expect(claude.is_active).toBe(true);
    expect(claude.api_key).toBe('sk-1');
    expect(claude.model_id).toBe('claude-haiku');
  });

  it('remappt coaching.sessions.ki_config_id auf die neuen provider_config-IDs', async () => {
    const pool = await setup();
    await migrateCoachingKiConfig(pool as never);
    const { rows } = await pool.query(
      `SELECT s.id, p.provider FROM coaching.sessions s
         LEFT JOIN tickets.provider_config p ON p.id = s.ki_config_id
        ORDER BY s.id`,
    );
    expect(rows[0].provider).toBe('claude');  // war ki_config_id=1
    expect(rows[1].provider).toBe('openai');  // war ki_config_id=2
    expect(rows[2].provider).toBeNull();       // war NULL
  });

  it('ist idempotent — zweimal anwenden dupliziert nichts und remappt nicht doppelt', async () => {
    const pool = await setup();
    await migrateCoachingKiConfig(pool as never);
    const second = await migrateCoachingKiConfig(pool as never);
    expect(second.migrated).toBe(0);
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM tickets.provider_config WHERE source='coaching'`);
    expect(rows[0].n).toBe(2);
    const sess = await pool.query(
      `SELECT s.id, p.provider FROM coaching.sessions s
         LEFT JOIN tickets.provider_config p ON p.id = s.ki_config_id ORDER BY s.id`,
    );
    expect(sess.rows[0].provider).toBe('claude');
    expect(sess.rows[1].provider).toBe('openai');
  });
});
