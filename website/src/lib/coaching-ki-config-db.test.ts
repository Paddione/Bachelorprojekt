import { describe, it, expect, beforeAll } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { listKiProviders, getActiveProvider, setActiveProvider, type KiConfig } from './coaching-ki-config-db';

let pool: Pool;

beforeAll(async () => {
  const db = newDb();
  db.public.none(`
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.ki_config (
      id SERIAL PRIMARY KEY,
      brand TEXT NOT NULL,
      provider TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT false,
      model_name TEXT,
      display_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (brand, provider)
    );
    INSERT INTO coaching.ki_config (brand, provider, is_active, model_name, display_name)
    VALUES
      ('mentolder', 'claude',  true,  'claude-haiku', 'Claude'),
      ('mentolder', 'openai',  false, 'gpt-4o-mini',  'ChatGPT'),
      ('mentolder', 'mistral', false, null,            'Mistral'),
      ('mentolder', 'lumo',    false, null,            'Lumo');
  `);
  const { Pool: PgMemPool } = db.adapters.createPg();
  pool = new PgMemPool() as unknown as Pool;
});

describe('listKiProviders', () => {
  it('gibt alle 4 Provider für eine Brand zurück', async () => {
    const providers = await listKiProviders(pool, 'mentolder');
    expect(providers).toHaveLength(4);
    expect(providers.map(p => p.provider)).toContain('claude');
  });
});

describe('getActiveProvider', () => {
  it('gibt den aktiven Provider zurück', async () => {
    const p = await getActiveProvider(pool, 'mentolder');
    expect(p?.provider).toBe('claude');
    expect(p?.isActive).toBe(true);
  });

  it('gibt null zurück wenn kein Provider aktiv', async () => {
    const p = await getActiveProvider(pool, 'unknown-brand');
    expect(p).toBeNull();
  });
});

describe('setActiveProvider', () => {
  it('wechselt aktiven Provider — genau einer aktiv', async () => {
    await setActiveProvider(pool, 'mentolder', 'openai');
    const active = await getActiveProvider(pool, 'mentolder');
    expect(active?.provider).toBe('openai');
    const all = await listKiProviders(pool, 'mentolder');
    expect(all.filter(p => p.isActive)).toHaveLength(1);
    // Reset
    await setActiveProvider(pool, 'mentolder', 'claude');
  });

  it('wirft Fehler bei unbekanntem Provider — aktiver bleibt erhalten', async () => {
    await expect(
      setActiveProvider(pool, 'mentolder', 'nonexistent' as KiConfig['provider']),
    ).rejects.toThrow("Provider 'nonexistent' not found for brand 'mentolder'");
    const active = await getActiveProvider(pool, 'mentolder');
    expect(active).not.toBeNull();
  });
});
