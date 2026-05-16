import { describe, it, expect, beforeAll } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  listKiProviders, getActiveProvider, setActiveProvider,
  updateKiProvider, createKiProvider, deleteKiProvider,
} from './coaching-ki-config-db';

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
      api_key TEXT,
      api_endpoint TEXT,
      temperature NUMERIC(5,3),
      max_tokens INT,
      top_p NUMERIC(5,3),
      system_prompt TEXT,
      notes TEXT,
      top_k INT,
      thinking_mode BOOLEAN NOT NULL DEFAULT false,
      presence_penalty NUMERIC(5,3),
      frequency_penalty NUMERIC(5,3),
      safe_prompt BOOLEAN NOT NULL DEFAULT false,
      random_seed INT,
      organization_id TEXT,
      eu_endpoint BOOLEAN NOT NULL DEFAULT false,
      enabled_fields JSONB,
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
    await setActiveProvider(pool, 'mentolder', 'claude');
  });

  it('wirft Fehler bei unbekanntem Provider — aktiver bleibt erhalten', async () => {
    await expect(
      setActiveProvider(pool, 'mentolder', 'nonexistent'),
    ).rejects.toThrow("Provider 'nonexistent' not found for brand 'mentolder'");
    const active = await getActiveProvider(pool, 'mentolder');
    expect(active).not.toBeNull();
  });
});

describe('updateKiProvider', () => {
  it('aktualisiert modelName und displayName eines Providers', async () => {
    const before = await listKiProviders(pool, 'mentolder');
    const mistral = before.find(p => p.provider === 'mistral')!;
    await updateKiProvider(pool, mistral.id, { modelName: 'mistral-large', displayName: 'Mistral Large' });
    const after = await listKiProviders(pool, 'mentolder');
    const updated = after.find(p => p.provider === 'mistral')!;
    expect(updated.modelName).toBe('mistral-large');
    expect(updated.displayName).toBe('Mistral Large');
  });

  it('erlaubt modelName als null (Modell zurücksetzen)', async () => {
    const providers = await listKiProviders(pool, 'mentolder');
    const claude = providers.find(p => p.provider === 'claude')!;
    await updateKiProvider(pool, claude.id, { modelName: null, displayName: 'Claude' });
    const after = await listKiProviders(pool, 'mentolder');
    expect(after.find(p => p.provider === 'claude')!.modelName).toBeNull();
  });
});

describe('createKiProvider', () => {
  it('legt neuen Custom-Provider an und gibt ihn zurück', async () => {
    const p = await createKiProvider(pool, 'mentolder', {
      displayName: 'Mein GPT',
      provider: 'custom_my-gpt',
      enabledFields: ['apiKey', 'apiEndpoint', 'temperature', 'systemPrompt'],
    });
    expect(p.provider).toBe('custom_my-gpt');
    expect(p.displayName).toBe('Mein GPT');
    expect(p.enabledFields).toEqual(['apiKey', 'apiEndpoint', 'temperature', 'systemPrompt']);
    expect(p.isActive).toBe(false);
  });

  it('wirft Fehler bei Duplikat (brand + provider)', async () => {
    await expect(
      createKiProvider(pool, 'mentolder', {
        displayName: 'Duplikat',
        provider: 'custom_my-gpt',
        enabledFields: [],
      }),
    ).rejects.toThrow();
  });
});

describe('deleteKiProvider', () => {
  it('löscht Custom-Provider', async () => {
    const p = await createKiProvider(pool, 'mentolder', {
      displayName: 'Zu löschen',
      provider: 'custom_to-delete',
      enabledFields: [],
    });
    await deleteKiProvider(pool, p.id);
    const all = await listKiProviders(pool, 'mentolder');
    expect(all.find(x => x.id === p.id)).toBeUndefined();
  });

  it('wirft Fehler beim Löschen eines Standard-Providers', async () => {
    const all = await listKiProviders(pool, 'mentolder');
    const claude = all.find(p => p.provider === 'claude')!;
    await expect(deleteKiProvider(pool, claude.id)).rejects.toThrow('Nur Custom-Provider');
  });
});
