---
ticket_id: T000418
title: Custom KI-Anbieter Verwaltung — Implementation Plan
domains: []
status: active
pr_number: null
---

# Custom KI-Anbieter Verwaltung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin kann neue KI-Provider mit benutzerdefiniertem Namen und individuell wählbaren Parameterfeldern anlegen und löschen.

**Architecture:** Die bestehende `coaching.ki_config`-Tabelle wird um `enabled_fields JSONB` erweitert; der `provider`-CHECK-Constraint wird entfernt, damit Custom-Provider-Slugs (`custom_*`) zulässig sind. DB-Layer, API und Svelte-UI werden um Create/Delete-Operationen ergänzt. Custom-Provider unterscheiden sich von Standard-Providern (claude/openai/mistral/lumo) nur durch den Prefix `custom_` im `provider`-Feld und durch ein nicht-NULL `enabled_fields`-Array.

**Tech Stack:** PostgreSQL 16, TypeScript (Astro API Routes), Svelte 5 (runes), pg-mem (Tests), Vitest

---

**Worktree:** `/home/gekko/Bachelorprojekt/.worktrees/feature/coaching-ki-provider-profiles-und-klienten`
**Branch:** `feature/coaching-ki-provider-profiles-und-klienten`
**Ticket:** T000418

## File Map

| Datei | Änderung |
|---|---|
| `k3d/website-schema.yaml` | Neue Migration: CHECK-Constraint entfernen, `enabled_fields JSONB` hinzufügen |
| `website/src/lib/coaching-ki-config-db.ts` | `enabledFields` zum Interface, `createKiProvider()`, `deleteKiProvider()` |
| `website/src/lib/coaching-ki-config-db.test.ts` | Tests für neue Funktionen + Schema-Update |
| `website/src/pages/api/admin/coaching/ki-config/index.ts` | POST-Handler hinzufügen |
| `website/src/pages/api/admin/coaching/ki-config/[id].ts` | DELETE-Handler hinzufügen |
| `website/src/components/admin/coaching/CoachingSettings.svelte` | `showField()` updaten, Anlegen-Formular, Löschen-Button |

---

## Task 1: DB-Migration — CHECK-Constraint entfernen + enabled_fields

**Files:**
- Modify: `k3d/website-schema.yaml` (nach Zeile 1047, vor Zeile 1049)

Der `provider`-CHECK-Constraint (`provider IN ('claude','openai','mistral','lumo')`) ist inline mit CREATE TABLE definiert und hat einen auto-generierten Namen (`ki_config_provider_check`). Da `ALTER TABLE … DROP CONSTRAINT IF EXISTS` einen exakten Namen braucht, verwenden wir einen dynamischen DO-Block.

- [ ] **Schritt 1: Migration im Schema einfügen**

Öffne `k3d/website-schema.yaml`. Suche den Block der am Ende der KI-Provider-Migration liegt (nach Zeile 1047 `eu_endpoint`), und füge **vor** der Zeile `-- Per-Session KI-Auswahl` ein:

```yaml
      -- Custom KI-Anbieter: CHECK-Constraint entfernen + enabled_fields (idempotent)
      DO $$
      DECLARE v_con text;
      BEGIN
        SELECT c.conname INTO v_con
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'coaching' AND t.relname = 'ki_config'
          AND c.contype = 'c' AND c.conname LIKE '%provider%'
        LIMIT 1;
        IF v_con IS NOT NULL THEN
          EXECUTE 'ALTER TABLE coaching.ki_config DROP CONSTRAINT ' || quote_ident(v_con);
        END IF;
      END $$;
      ALTER TABLE coaching.ki_config ADD COLUMN IF NOT EXISTS enabled_fields JSONB;
```

- [ ] **Schritt 2: Validierung (kein Cluster nötig)**

```bash
cd /home/gekko/Bachelorprojekt/.worktrees/feature/coaching-ki-provider-profiles-und-klienten
task workspace:validate
```

Erwartung: `kustomize build` ohne Fehler.

- [ ] **Schritt 3: Commit**

```bash
git add k3d/website-schema.yaml
git commit -m "feat(coaching): drop provider CHECK, add enabled_fields for custom providers [T000418]"
```

---

## Task 2: DB-Layer — Interface, createKiProvider, deleteKiProvider

**Files:**
- Modify: `website/src/lib/coaching-ki-config-db.ts`
- Modify: `website/src/lib/coaching-ki-config-db.test.ts`

- [ ] **Schritt 1: Failing-Tests schreiben**

Öffne `website/src/lib/coaching-ki-config-db.test.ts`. Ersetze den gesamten Inhalt durch:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  listKiProviders, getActiveProvider, setActiveProvider,
  updateKiProvider, createKiProvider, deleteKiProvider,
  type KiConfig,
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
```

- [ ] **Schritt 2: Tests laufen lassen — müssen FAIL mit "createKiProvider not found"**

```bash
cd website && pnpm test coaching-ki-config-db 2>&1 | tail -20
```

Erwartung: FAIL mit Import-Fehler (`createKiProvider` nicht exportiert).

- [ ] **Schritt 3: DB-Layer implementieren**

Öffne `website/src/lib/coaching-ki-config-db.ts`. Ersetze den gesamten Inhalt durch:

```typescript
import type { Pool } from 'pg';

const KNOWN_PROVIDERS = new Set(['claude', 'openai', 'mistral', 'lumo']);

export interface KiConfig {
  id: number;
  brand: string;
  provider: string;
  isActive: boolean;
  modelName: string | null;
  displayName: string;
  createdAt: Date;
  // Verbindung
  apiKey: string | null;
  apiEndpoint: string | null;
  // Verhalten (gemeinsam)
  temperature: number | null;
  maxTokens: number | null;
  topP: number | null;
  systemPrompt: string | null;
  notes: string | null;
  // Anbieterspezifisch
  topK: number | null;
  thinkingMode: boolean;
  presencePenalty: number | null;
  frequencyPenalty: number | null;
  safePrompt: boolean;
  randomSeed: number | null;
  organizationId: string | null;
  euEndpoint: boolean;
  // Custom-Provider
  enabledFields: string[] | null;
}

export type UpdateKiProviderFields = Partial<Omit<KiConfig, 'id' | 'brand' | 'provider' | 'isActive' | 'createdAt' | 'enabledFields'>>;

function rowToKiConfig(row: Record<string, unknown>): KiConfig {
  return {
    id: row.id as number,
    brand: row.brand as string,
    provider: row.provider as string,
    isActive: row.is_active as boolean,
    modelName: (row.model_name as string | null) ?? null,
    displayName: row.display_name as string,
    createdAt: row.created_at as Date,
    apiKey: (row.api_key as string | null) ?? null,
    apiEndpoint: (row.api_endpoint as string | null) ?? null,
    temperature: row.temperature != null ? Number(row.temperature) : null,
    maxTokens: (row.max_tokens as number | null) ?? null,
    topP: row.top_p != null ? Number(row.top_p) : null,
    systemPrompt: (row.system_prompt as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    topK: (row.top_k as number | null) ?? null,
    thinkingMode: (row.thinking_mode as boolean) ?? false,
    presencePenalty: row.presence_penalty != null ? Number(row.presence_penalty) : null,
    frequencyPenalty: row.frequency_penalty != null ? Number(row.frequency_penalty) : null,
    safePrompt: (row.safe_prompt as boolean) ?? false,
    randomSeed: (row.random_seed as number | null) ?? null,
    organizationId: (row.organization_id as string | null) ?? null,
    euEndpoint: (row.eu_endpoint as boolean) ?? false,
    enabledFields: Array.isArray(row.enabled_fields)
      ? (row.enabled_fields as string[])
      : row.enabled_fields != null
        ? (JSON.parse(row.enabled_fields as string) as string[])
        : null,
  };
}

export async function listKiProviders(pool: Pool, brand: string): Promise<KiConfig[]> {
  const r = await pool.query(
    `SELECT * FROM coaching.ki_config WHERE brand = $1 ORDER BY id`,
    [brand],
  );
  return r.rows.map(rowToKiConfig);
}

export async function getActiveProvider(pool: Pool, brand: string): Promise<KiConfig | null> {
  const r = await pool.query(
    `SELECT * FROM coaching.ki_config WHERE brand = $1 AND is_active = true LIMIT 1`,
    [brand],
  );
  return r.rows[0] ? rowToKiConfig(r.rows[0]) : null;
}

export async function getKiProviderById(pool: Pool, id: number): Promise<KiConfig | null> {
  const r = await pool.query(`SELECT * FROM coaching.ki_config WHERE id = $1`, [id]);
  return r.rows[0] ? rowToKiConfig(r.rows[0]) : null;
}

export async function setActiveProvider(pool: Pool, brand: string, provider: string): Promise<void> {
  const exists = await pool.query(
    `SELECT id FROM coaching.ki_config WHERE brand = $1 AND provider = $2`,
    [brand, provider],
  );
  if (exists.rows.length === 0) {
    throw new Error(`Provider '${provider}' not found for brand '${brand}'`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE coaching.ki_config SET is_active = false WHERE brand = $1`, [brand]);
    await client.query(
      `UPDATE coaching.ki_config SET is_active = true WHERE brand = $1 AND provider = $2`,
      [brand, provider],
    );
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

const COLUMN_MAP: Record<string, string> = {
  modelName: 'model_name', displayName: 'display_name',
  apiKey: 'api_key', apiEndpoint: 'api_endpoint',
  temperature: 'temperature', maxTokens: 'max_tokens', topP: 'top_p',
  systemPrompt: 'system_prompt', notes: 'notes',
  topK: 'top_k', thinkingMode: 'thinking_mode',
  presencePenalty: 'presence_penalty', frequencyPenalty: 'frequency_penalty',
  safePrompt: 'safe_prompt', randomSeed: 'random_seed',
  organizationId: 'organization_id', euEndpoint: 'eu_endpoint',
};

export async function updateKiProvider(
  pool: Pool,
  id: number,
  fields: UpdateKiProviderFields,
): Promise<KiConfig> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    const col = COLUMN_MAP[k];
    if (!col) continue;
    sets.push(`${col} = $${i++}`);
    vals.push(v);
  }
  if (sets.length === 0) {
    const r = await pool.query(`SELECT * FROM coaching.ki_config WHERE id = $1`, [id]);
    if (r.rows.length === 0) throw new Error(`KI-Provider id=${id} nicht gefunden`);
    return rowToKiConfig(r.rows[0]);
  }
  vals.push(id);
  const r = await pool.query(
    `UPDATE coaching.ki_config SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  if (r.rows.length === 0) throw new Error(`KI-Provider id=${id} nicht gefunden`);
  return rowToKiConfig(r.rows[0]);
}

export async function createKiProvider(
  pool: Pool,
  brand: string,
  data: { displayName: string; provider: string; enabledFields: string[] },
): Promise<KiConfig> {
  const r = await pool.query(
    `INSERT INTO coaching.ki_config (brand, provider, display_name, is_active, enabled_fields)
     VALUES ($1, $2, $3, false, $4)
     RETURNING *`,
    [brand, data.provider, data.displayName, JSON.stringify(data.enabledFields)],
  );
  return rowToKiConfig(r.rows[0]);
}

export async function deleteKiProvider(pool: Pool, id: number): Promise<void> {
  const r = await pool.query(`SELECT provider FROM coaching.ki_config WHERE id = $1`, [id]);
  if (r.rows.length === 0) throw new Error(`KI-Provider id=${id} nicht gefunden`);
  const provider = r.rows[0].provider as string;
  if (KNOWN_PROVIDERS.has(provider)) {
    throw new Error('Nur Custom-Provider können gelöscht werden');
  }
  await pool.query(`DELETE FROM coaching.ki_config WHERE id = $1`, [id]);
}
```

- [ ] **Schritt 4: Tests laufen lassen — müssen PASS**

```bash
cd website && pnpm test coaching-ki-config-db 2>&1 | tail -20
```

Erwartung: alle Tests PASS.

- [ ] **Schritt 5: Commit**

```bash
git add website/src/lib/coaching-ki-config-db.ts website/src/lib/coaching-ki-config-db.test.ts
git commit -m "feat(coaching): createKiProvider + deleteKiProvider + enabledFields [T000418]"
```

---

## Task 3: API-Endpunkte — POST (Create) + DELETE

**Files:**
- Modify: `website/src/pages/api/admin/coaching/ki-config/index.ts`
- Modify: `website/src/pages/api/admin/coaching/ki-config/[id].ts`

Der `provider`-String für Custom-Provider kommt vom Client als Freitext — die API erzwingt den `custom_`-Prefix.

- [ ] **Schritt 1: POST-Handler in index.ts hinzufügen**

Ersetze den gesamten Inhalt von `website/src/pages/api/admin/coaching/ki-config/index.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listKiProviders, createKiProvider } from '../../../../../lib/coaching-ki-config-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

const ALL_FIELDS = [
  'apiKey', 'apiEndpoint', 'modelName', 'temperature', 'maxTokens', 'topP',
  'topK', 'thinkingMode', 'presencePenalty', 'frequencyPenalty',
  'safePrompt', 'randomSeed', 'organizationId', 'euEndpoint',
  'systemPrompt', 'notes',
] as const;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const providers = await listKiProviders(pool, brand);
  return new Response(JSON.stringify({ providers }), { headers: { 'content-type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!displayName) {
    return new Response(JSON.stringify({ error: 'displayName darf nicht leer sein' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : '';
  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug darf nicht leer sein' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const rawFields = Array.isArray(body.enabledFields) ? body.enabledFields as string[] : [];
  const enabledFields = rawFields.filter(f => (ALL_FIELDS as readonly string[]).includes(f));

  const brand = process.env.BRAND || 'mentolder';
  try {
    const provider = await createKiProvider(pool, brand, {
      displayName,
      provider: `custom_${slug}`,
      enabledFields,
    });
    return new Response(JSON.stringify({ provider }), { status: 201, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('UNIQUE') || msg.includes('duplicate')) {
      return new Response(JSON.stringify({ error: `Slug '${slug}' bereits vergeben` }), { status: 409, headers: { 'content-type': 'application/json' } });
    }
    throw e;
  }
};
```

- [ ] **Schritt 2: DELETE-Handler in [id].ts hinzufügen**

Ersetze den gesamten Inhalt von `website/src/pages/api/admin/coaching/ki-config/[id].ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateKiProvider, deleteKiProvider, type UpdateKiProviderFields } from '../../../../../lib/coaching-ki-config-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

const ALLOWED_FIELDS: (keyof UpdateKiProviderFields)[] = [
  'modelName', 'displayName', 'apiKey', 'apiEndpoint',
  'temperature', 'maxTokens', 'topP', 'systemPrompt', 'notes',
  'topK', 'thinkingMode', 'presencePenalty', 'frequencyPenalty',
  'safePrompt', 'randomSeed', 'organizationId', 'euEndpoint',
];

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Ungültige ID' }), { status: 400, headers: { 'content-type': 'application/json' } });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  if ('displayName' in body && (typeof body.displayName !== 'string' || (body.displayName as string).trim() === '')) {
    return new Response(JSON.stringify({ error: 'displayName darf nicht leer sein' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const fields: UpdateKiProviderFields = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      if (key === 'displayName') {
        fields.displayName = (body.displayName as string).trim();
      } else {
        (fields as Record<string, unknown>)[key] = body[key];
      }
    }
  }

  const provider = await updateKiProvider(pool, id, fields);
  return new Response(JSON.stringify({ provider }), { headers: { 'content-type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Ungültige ID' }), { status: 400, headers: { 'content-type': 'application/json' } });

  try {
    await deleteKiProvider(pool, id);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
};
```

- [ ] **Schritt 3: TypeScript-Check**

```bash
cd website && pnpm tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```

Erwartung: keine Fehler.

- [ ] **Schritt 4: Commit**

```bash
git add website/src/pages/api/admin/coaching/ki-config/index.ts \
        website/src/pages/api/admin/coaching/ki-config/[id].ts
git commit -m "feat(coaching): POST create + DELETE ki-config API endpoints [T000418]"
```

---

## Task 4: UI — showField für Custom, Anlegen-Formular, Löschen-Button

**Files:**
- Modify: `website/src/components/admin/coaching/CoachingSettings.svelte`

Das bestehende Svelte hat bereits das vollständige Bearbeitungsformular für Standard-Provider. Wir ergänzen:
1. `showField()` für Custom-Provider: `enabledFields`-Array aus DB nutzen
2. "+ Neuer KI-Anbieter" Button
3. Anlegen-Formular mit Slug, Name, Feldauswahl-Checkboxen
4. Löschen-Button auf Provider-Karten für `custom_*`-Provider

- [ ] **Schritt 1: Script-Block aktualisieren**

Öffne `website/src/components/admin/coaching/CoachingSettings.svelte`.

Ersetze den gesamten `<script lang="ts">` Block (Zeilen 1–207) durch:

```svelte
<script lang="ts">
  import type { KiConfig } from '../../../lib/coaching-ki-config-db';
  import type { StepTemplate } from '../../../lib/coaching-templates-db';

  let {
    initialProviders,
    initialTemplates,
  }: {
    initialProviders: KiConfig[];
    initialTemplates: StepTemplate[];
  } = $props();

  let activeTab = $state<'ki' | 'templates'>('ki');
  let providers = $state<KiConfig[]>(initialProviders);
  let templates = $state<StepTemplate[]>(initialTemplates);
  let savingProvider = $state<string | null>(null);
  let editingTemplate = $state<StepTemplate | null>(null);
  let editFields = $state({ stepName: '', systemPrompt: '', userPromptTpl: '', keywords: '' });

  // KI-Provider Inline-Edit
  let editingProvider = $state<KiConfig | null>(null);
  let providerEditTab = $state<'connection' | 'behavior'>('connection');
  let savingProviderEdit = $state(false);
  let showApiKey = $state(false);

  // Custom-Provider Anlegen
  let creatingProvider = $state(false);
  let savingNewProvider = $state(false);
  let newProviderForm = $state({
    displayName: '',
    slug: '',
    enabledFields: [] as string[],
  });

  const ALL_FIELDS: { key: string; label: string }[] = [
    { key: 'apiKey',           label: 'API-Key' },
    { key: 'apiEndpoint',      label: 'API-Endpunkt' },
    { key: 'modelName',        label: 'Modell' },
    { key: 'temperature',      label: 'Temperature' },
    { key: 'maxTokens',        label: 'Max Tokens' },
    { key: 'topP',             label: 'top_p' },
    { key: 'topK',             label: 'top_k' },
    { key: 'thinkingMode',     label: 'Thinking-Modus (Claude)' },
    { key: 'presencePenalty',  label: 'Presence Penalty' },
    { key: 'frequencyPenalty', label: 'Frequency Penalty' },
    { key: 'safePrompt',       label: 'Safe Prompt (Mistral)' },
    { key: 'randomSeed',       label: 'Random Seed' },
    { key: 'organizationId',   label: 'Organization ID' },
    { key: 'euEndpoint',       label: 'EU-Endpunkt (DSGVO)' },
    { key: 'systemPrompt',     label: 'System-Prompt' },
    { key: 'notes',            label: 'Notiz / Freitext' },
  ];

  type ProviderFields = {
    displayName: string; modelName: string;
    apiKey: string; apiEndpoint: string;
    temperature: string; maxTokens: string; topP: string;
    systemPrompt: string; notes: string;
    topK: string; thinkingMode: boolean;
    presencePenalty: string; frequencyPenalty: string;
    safePrompt: boolean; randomSeed: string;
    organizationId: string; euEndpoint: boolean;
  };

  let providerFields = $state<ProviderFields>({
    displayName: '', modelName: '',
    apiKey: '', apiEndpoint: '',
    temperature: '', maxTokens: '', topP: '',
    systemPrompt: '', notes: '',
    topK: '', thinkingMode: false,
    presencePenalty: '', frequencyPenalty: '',
    safePrompt: false, randomSeed: '',
    organizationId: '', euEndpoint: false,
  });

  function parseNum(s: string): number | null {
    const v = parseFloat(s);
    return isNaN(v) ? null : v;
  }

  function parseInt2(s: string): number | null {
    const v = parseInt(s, 10);
    return isNaN(v) ? null : v;
  }

  const KNOWN_FIELD_MAP: Record<string, string[]> = {
    claude:  ['apiKey', 'apiEndpoint', 'modelName', 'temperature', 'maxTokens', 'topP', 'topK', 'thinkingMode', 'systemPrompt', 'notes'],
    openai:  ['apiKey', 'apiEndpoint', 'modelName', 'temperature', 'maxTokens', 'topP', 'presencePenalty', 'frequencyPenalty', 'organizationId', 'systemPrompt', 'notes'],
    mistral: ['apiKey', 'apiEndpoint', 'modelName', 'temperature', 'maxTokens', 'topP', 'topK', 'safePrompt', 'randomSeed', 'euEndpoint', 'systemPrompt', 'notes'],
    lumo:    ['euEndpoint', 'notes'],
  };

  function showField(p: KiConfig, field: string): boolean {
    if (p.enabledFields !== null) return p.enabledFields.includes(field);
    return (KNOWN_FIELD_MAP[p.provider] ?? []).includes(field);
  }

  const PROVIDER_BADGE: Record<string, string> = {
    claude: 'Anthropic', openai: 'OpenAI', mistral: 'Mistral AI', lumo: 'Lumo',
  };

  function providerBadgeLabel(p: KiConfig): string {
    return PROVIDER_BADGE[p.provider] ?? (p.displayName || p.provider);
  }

  function isCustom(p: KiConfig): boolean {
    return p.provider.startsWith('custom_');
  }

  function startEditProvider(p: KiConfig) {
    editingProvider = p;
    providerEditTab = 'connection';
    showApiKey = false;
    providerFields = {
      displayName: p.displayName,
      modelName: p.modelName ?? '',
      apiKey: p.apiKey ?? '',
      apiEndpoint: p.apiEndpoint ?? '',
      temperature: p.temperature != null ? String(p.temperature) : '',
      maxTokens: p.maxTokens != null ? String(p.maxTokens) : '',
      topP: p.topP != null ? String(p.topP) : '',
      systemPrompt: p.systemPrompt ?? '',
      notes: p.notes ?? '',
      topK: p.topK != null ? String(p.topK) : '',
      thinkingMode: p.thinkingMode,
      presencePenalty: p.presencePenalty != null ? String(p.presencePenalty) : '',
      frequencyPenalty: p.frequencyPenalty != null ? String(p.frequencyPenalty) : '',
      safePrompt: p.safePrompt,
      randomSeed: p.randomSeed != null ? String(p.randomSeed) : '',
      organizationId: p.organizationId ?? '',
      euEndpoint: p.euEndpoint,
    };
  }

  async function saveProviderEdit() {
    if (!editingProvider) return;
    savingProviderEdit = true;
    const p = editingProvider;
    const payload: Record<string, unknown> = {
      displayName: providerFields.displayName,
      modelName: providerFields.modelName.trim() || null,
      apiKey: providerFields.apiKey.trim() || null,
      apiEndpoint: providerFields.apiEndpoint.trim() || null,
      temperature: parseNum(providerFields.temperature),
      maxTokens: parseInt2(providerFields.maxTokens),
      topP: parseNum(providerFields.topP),
      systemPrompt: providerFields.systemPrompt.trim() || null,
      notes: providerFields.notes.trim() || null,
    };
    if (showField(p, 'topK'))            payload.topK = parseInt2(providerFields.topK);
    if (showField(p, 'thinkingMode'))    payload.thinkingMode = providerFields.thinkingMode;
    if (showField(p, 'presencePenalty')) payload.presencePenalty = parseNum(providerFields.presencePenalty);
    if (showField(p, 'frequencyPenalty')) payload.frequencyPenalty = parseNum(providerFields.frequencyPenalty);
    if (showField(p, 'safePrompt'))      payload.safePrompt = providerFields.safePrompt;
    if (showField(p, 'randomSeed'))      payload.randomSeed = parseInt2(providerFields.randomSeed);
    if (showField(p, 'organizationId'))  payload.organizationId = providerFields.organizationId.trim() || null;
    if (showField(p, 'euEndpoint'))      payload.euEndpoint = providerFields.euEndpoint;

    await fetch(`/api/admin/coaching/ki-config/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res = await fetch('/api/admin/coaching/ki-config');
    providers = (await res.json()).providers;
    editingProvider = null;
    savingProviderEdit = false;
  }

  async function activateProvider(provider: string) {
    savingProvider = provider;
    await fetch('/api/admin/coaching/ki-config/active', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    providers = (await (await fetch('/api/admin/coaching/ki-config')).json()).providers;
    savingProvider = null;
  }

  function toggleNewField(key: string) {
    if (newProviderForm.enabledFields.includes(key)) {
      newProviderForm.enabledFields = newProviderForm.enabledFields.filter(k => k !== key);
    } else {
      newProviderForm.enabledFields = [...newProviderForm.enabledFields, key];
    }
  }

  async function saveNewProvider() {
    savingNewProvider = true;
    const res = await fetch('/api/admin/coaching/ki-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: newProviderForm.displayName.trim(),
        slug: newProviderForm.slug.trim(),
        enabledFields: newProviderForm.enabledFields,
      }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? 'Fehler beim Anlegen'); savingNewProvider = false; return; }
    providers = (await (await fetch('/api/admin/coaching/ki-config')).json()).providers;
    creatingProvider = false;
    newProviderForm = { displayName: '', slug: '', enabledFields: [] };
    savingNewProvider = false;
  }

  async function deleteProvider(p: KiConfig) {
    if (!confirm(`Anbieter "${p.displayName}" wirklich löschen?`)) return;
    const res = await fetch(`/api/admin/coaching/ki-config/${p.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? 'Fehler beim Löschen'); return; }
    providers = providers.filter(x => x.id !== p.id);
  }

  // Templates
  function startEdit(t: StepTemplate) {
    editingTemplate = t;
    editFields = {
      stepName: t.stepName,
      systemPrompt: t.systemPrompt,
      userPromptTpl: t.userPromptTpl,
      keywords: t.keywords.join(', '),
    };
  }

  const EMPTY_TEMPLATE: Omit<StepTemplate, 'id' | 'brand' | 'createdAt'> = {
    stepNumber: 1, stepName: '', phase: 'problem_ziel',
    systemPrompt: '', userPromptTpl: '', inputSchema: [],
    keywords: [], isActive: true, sortOrder: 0,
  };

  function startNewTemplate() {
    editingTemplate = { ...EMPTY_TEMPLATE, id: '', brand: '', createdAt: new Date() } as StepTemplate;
    editFields = { stepName: '', systemPrompt: '', userPromptTpl: '', keywords: '' };
  }

  async function saveTemplate() {
    if (!editingTemplate) return;
    const isNew = editingTemplate.id === '';
    const payload = {
      stepNumber: editingTemplate.stepNumber,
      stepName: editFields.stepName,
      phase: editingTemplate.phase,
      systemPrompt: editFields.systemPrompt,
      userPromptTpl: editFields.userPromptTpl,
      inputSchema: editingTemplate.inputSchema,
      keywords: editFields.keywords.split(',').map(s => s.trim()).filter(Boolean),
      isActive: true,
      sortOrder: editingTemplate.sortOrder,
    };
    if (isNew) {
      await fetch('/api/admin/coaching/step-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/admin/coaching/step-templates/${editingTemplate.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    }
    templates = (await (await fetch('/api/admin/coaching/step-templates')).json()).templates;
    editingTemplate = null;
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Template wirklich löschen?')) return;
    const res = await fetch(`/api/admin/coaching/step-templates/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    templates = templates.filter(t => t.id !== id);
  }
</script>
```

- [ ] **Schritt 2: HTML-Template aktualisieren**

Ersetze den gesamten Bereich zwischen `<div class="settings">` und `</div>` (exkl. äußerstem div) sowie den `<style>`-Block. Ersetze den gesamten Template- und Style-Teil (ab Zeile 209 bis Ende) durch:

```svelte
<div class="settings">
  <div class="tabs">
    <button class="tab {activeTab === 'ki' ? 'active' : ''}" onclick={() => activeTab = 'ki'}>KI-Provider</button>
    <button class="tab {activeTab === 'templates' ? 'active' : ''}" onclick={() => activeTab = 'templates'}>Prompt-Templates</button>
  </div>

  {#if activeTab === 'ki'}
    {#if editingProvider}
      <div class="edit-panel">
        <div class="edit-panel-header">
          <div class="edit-title">
            <span class="provider-badge {isCustom(editingProvider) ? 'custom' : editingProvider.provider}">{providerBadgeLabel(editingProvider)}</span>
            <span>{editingProvider.displayName}</span>
          </div>
          <button class="btn-sm" onclick={() => editingProvider = null}>✕ Schließen</button>
        </div>

        <div class="edit-tabs">
          <button class="edit-tab {providerEditTab === 'connection' ? 'active' : ''}" onclick={() => providerEditTab = 'connection'}>Verbindung</button>
          <button class="edit-tab {providerEditTab === 'behavior' ? 'active' : ''}" onclick={() => providerEditTab = 'behavior'}>Verhalten</button>
        </div>

        {#if providerEditTab === 'connection'}
          <div class="edit-section">
            <label class="field-label">Name / Label
              <input type="text" bind:value={providerFields.displayName} />
            </label>
            {#if editingProvider.provider === 'lumo'}
              <div class="lumo-info">
                <strong>Lumo (Proton)</strong> hat derzeit keine öffentliche API — das Profil dient als Platzhalter.
              </div>
              <label class="checkbox-label">
                <input type="checkbox" bind:checked={providerFields.euEndpoint} />
                EU-Endpunkt verwenden (DSGVO)
              </label>
            {:else}
              {#if showField(editingProvider, 'modelName')}
                <label class="field-label">Modell
                  <input type="text" bind:value={providerFields.modelName} placeholder="leer = Standardmodell" />
                </label>
              {/if}
              {#if showField(editingProvider, 'apiKey')}
                <label class="field-label">API-Key
                  <div class="api-key-row">
                    {#if showApiKey}
                      <input type="text" bind:value={providerFields.apiKey} placeholder="sk-..." class="api-key-input" />
                    {:else}
                      <input type="password" bind:value={providerFields.apiKey} placeholder="sk-..." class="api-key-input" />
                    {/if}
                    <button class="btn-icon" onclick={() => showApiKey = !showApiKey}>{showApiKey ? '🙈' : '👁'}</button>
                  </div>
                </label>
              {/if}
              {#if showField(editingProvider, 'apiEndpoint')}
                <label class="field-label">API-Endpunkt (optional)
                  <input type="url" bind:value={providerFields.apiEndpoint} placeholder="https://api.example.com/v1" />
                </label>
              {/if}
              {#if showField(editingProvider, 'organizationId')}
                <label class="field-label">Organization ID (optional)
                  <input type="text" bind:value={providerFields.organizationId} placeholder="org-..." />
                </label>
              {/if}
              {#if showField(editingProvider, 'euEndpoint')}
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={providerFields.euEndpoint} />
                  EU-Endpunkt verwenden
                </label>
              {/if}
            {/if}
          </div>
        {:else}
          <div class="edit-section">
            {#if editingProvider.provider === 'lumo'}
              <p class="lumo-info">Lumo unterstützt derzeit keine konfigurierbaren Verhaltenparameter.</p>
            {:else}
              <div class="field-row">
                {#if showField(editingProvider, 'temperature')}
                  <label class="field-label">Temperature (0.0–2.0)
                    <input type="number" step="0.01" min="0" max="2" bind:value={providerFields.temperature} placeholder="leer = Standard" />
                  </label>
                {/if}
                {#if showField(editingProvider, 'maxTokens')}
                  <label class="field-label">Max Tokens
                    <input type="number" min="1" bind:value={providerFields.maxTokens} placeholder="leer = Standard" />
                  </label>
                {/if}
                {#if showField(editingProvider, 'topP')}
                  <label class="field-label">top_p
                    <input type="number" step="0.01" min="0" max="1" bind:value={providerFields.topP} placeholder="leer = Standard" />
                  </label>
                {/if}
              </div>
              {#if showField(editingProvider, 'topK')}
                <div class="field-row">
                  <label class="field-label">top_k
                    <input type="number" min="1" bind:value={providerFields.topK} placeholder="leer = Standard" />
                  </label>
                </div>
              {/if}
              {#if showField(editingProvider, 'thinkingMode')}
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={providerFields.thinkingMode} />
                  Extended Thinking aktivieren (Claude)
                </label>
              {/if}
              {#if showField(editingProvider, 'presencePenalty')}
                <div class="field-row">
                  <label class="field-label">Presence Penalty (–2 bis 2)
                    <input type="number" step="0.01" min="-2" max="2" bind:value={providerFields.presencePenalty} placeholder="leer = Standard" />
                  </label>
                  <label class="field-label">Frequency Penalty (–2 bis 2)
                    <input type="number" step="0.01" min="-2" max="2" bind:value={providerFields.frequencyPenalty} placeholder="leer = Standard" />
                  </label>
                </div>
              {/if}
              {#if showField(editingProvider, 'safePrompt')}
                <label class="checkbox-label">
                  <input type="checkbox" bind:checked={providerFields.safePrompt} />
                  Safe Prompt aktivieren (Mistral)
                </label>
              {/if}
              {#if showField(editingProvider, 'randomSeed')}
                <label class="field-label">Random Seed (leer = zufällig)
                  <input type="number" bind:value={providerFields.randomSeed} placeholder="z.B. 42" />
                </label>
              {/if}
              {#if showField(editingProvider, 'systemPrompt')}
                <label class="field-label">System-Prompt
                  <textarea rows="5" bind:value={providerFields.systemPrompt} placeholder="Optionaler System-Prompt…"></textarea>
                </label>
              {/if}
            {/if}
            {#if showField(editingProvider, 'notes')}
              <label class="field-label">Notiz / Freitext
                <textarea rows="2" bind:value={providerFields.notes} placeholder="Interne Beschreibung…"></textarea>
              </label>
            {/if}
          </div>
        {/if}

        <div class="edit-actions">
          <button class="btn-primary" onclick={saveProviderEdit} disabled={savingProviderEdit}>
            {savingProviderEdit ? 'Speichern…' : 'Speichern'}
          </button>
          <button class="btn-sm" onclick={() => editingProvider = null}>Abbrechen</button>
        </div>
      </div>

    {:else if creatingProvider}
      <div class="edit-panel">
        <div class="edit-panel-header">
          <div class="edit-title">Neuer KI-Anbieter</div>
          <button class="btn-sm" onclick={() => creatingProvider = false}>✕ Schließen</button>
        </div>
        <div class="edit-section">
          <label class="field-label">Name / Label
            <input type="text" bind:value={newProviderForm.displayName} placeholder="z.B. Mein eigener GPT" />
          </label>
          <label class="field-label">Interner Slug (nur a–z, 0–9, Bindestrich — wird zu <code>custom_&lt;slug&gt;</code>)
            <input type="text" bind:value={newProviderForm.slug} placeholder="z.B. mein-gpt" />
          </label>
          <div class="field-label">Verfügbare Felder auswählen
            <div class="fields-grid">
              {#each ALL_FIELDS as f}
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newProviderForm.enabledFields.includes(f.key)}
                    onchange={() => toggleNewField(f.key)}
                  />
                  {f.label}
                </label>
              {/each}
            </div>
          </div>
        </div>
        <div class="edit-actions">
          <button class="btn-primary" onclick={saveNewProvider} disabled={savingNewProvider}>
            {savingNewProvider ? 'Anlegen…' : 'Anbieter anlegen'}
          </button>
          <button class="btn-sm" onclick={() => creatingProvider = false}>Abbrechen</button>
        </div>
      </div>

    {:else}
      <div class="ki-grid-header">
        <button class="btn-primary" onclick={() => creatingProvider = true}>+ Neuer KI-Anbieter</button>
      </div>
      <div class="ki-grid">
        {#each providers as p}
          <div class="provider-card {p.isActive ? 'active' : ''}">
            <div class="card-head">
              <span class="provider-badge {isCustom(p) ? 'custom' : p.provider}">{providerBadgeLabel(p)}</span>
              {#if p.isActive}<span class="active-badge">● Aktiv</span>{/if}
            </div>
            <div class="provider-name">{p.displayName}</div>
            <div class="provider-model">{p.modelName ?? 'kein Modell'}</div>
            {#if p.apiKey}
              <div class="provider-key">API-Key gesetzt ✓</div>
            {:else if p.provider !== 'lumo'}
              <div class="provider-key warn">kein API-Key</div>
            {/if}
            <div class="provider-actions">
              {#if !p.isActive}
                <button class="btn-activate" onclick={() => activateProvider(p.provider)} disabled={savingProvider === p.provider}>
                  {savingProvider === p.provider ? '…' : 'Aktivieren'}
                </button>
              {/if}
              <button class="btn-sm" onclick={() => startEditProvider(p)}>Bearbeiten</button>
              {#if isCustom(p)}
                <button class="btn-sm btn-danger" onclick={() => deleteProvider(p)}>🗑</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

  {:else}
    <div class="templates-list">
      {#if editingTemplate}
        <div class="edit-modal">
          <h3>{editingTemplate.id === '' ? 'Neues Template' : `Schritt ${editingTemplate.stepNumber}: bearbeiten`}</h3>
          <label>Schritt-Nr.
            <input type="number" min="1" bind:value={editingTemplate.stepNumber} />
          </label>
          <label>Phase
            <select bind:value={editingTemplate.phase}>
              <option value="problem_ziel">Problem & Ziel</option>
              <option value="analyse">Analyse</option>
              <option value="ressourcen">Ressourcen</option>
              <option value="loesungsweg">Lösungsweg</option>
              <option value="abschluss">Abschluss</option>
            </select>
          </label>
          <label>Name
            <input type="text" bind:value={editFields.stepName} />
          </label>
          <label>System-Prompt
            <textarea rows="4" bind:value={editFields.systemPrompt}></textarea>
          </label>
          <label>Prompt-Template (Platzhalter: &#123;feldname&#125;)
            <textarea rows="5" bind:value={editFields.userPromptTpl}></textarea>
          </label>
          <label>Schlagwörter (kommagetrennt)
            <input type="text" bind:value={editFields.keywords} />
          </label>
          <div class="edit-actions">
            <button class="btn-primary" onclick={saveTemplate}>Speichern</button>
            <button class="btn-sm" onclick={() => editingTemplate = null}>Abbrechen</button>
          </div>
        </div>
      {:else}
        <div class="templates-header">
          <button class="btn-primary" onclick={startNewTemplate}>+ Neues Template</button>
        </div>
        <table class="table">
          <thead><tr><th>#</th><th>Name</th><th>Phase</th><th>Schlagwörter</th><th></th></tr></thead>
          <tbody>
            {#each templates as t (t.id)}
              <tr>
                <td>{t.stepNumber}</td>
                <td>{t.stepName}</td>
                <td>{t.phase}</td>
                <td>{t.keywords.join(', ') || '—'}</td>
                <td>
                  <button class="btn-sm" onclick={() => startEdit(t)}>✏️ Bearbeiten</button>
                  <button class="btn-sm btn-danger" onclick={() => deleteTemplate(t.id)}>🗑</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</div>

<style>
  .settings { max-width: 960px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--line,#333); }
  .tab { padding: 0.5rem 1rem; background: none; border: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.9rem; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab.active { color: var(--gold,#c9a55c); border-bottom-color: var(--gold,#c9a55c); }

  .ki-grid-header { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
  .ki-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
  .provider-card { padding: 1.2rem; border: 1px solid var(--line,#333); border-radius: 8px; background: var(--bg-2,#1a1a1a); display: flex; flex-direction: column; gap: 0.4rem; }
  .provider-card.active { border-color: var(--gold,#c9a55c); }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .provider-name { font-weight: 700; color: var(--text-light,#f0f0f0); margin-top: 0.2rem; }
  .provider-model { font-size: 0.78rem; color: var(--text-muted,#888); }
  .provider-key { font-size: 0.72rem; color: #4ade80; font-family: monospace; }
  .provider-key.warn { color: #f97316; }
  .active-badge { color: var(--gold,#c9a55c); font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
  .provider-actions { display: flex; gap: 0.4rem; align-items: center; margin-top: 0.5rem; flex-wrap: wrap; }
  .btn-activate { padding: 0.4rem 0.8rem; background: var(--gold,#c9a55c); color: #111; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.82rem; }
  .btn-activate:disabled { opacity: 0.5; cursor: not-allowed; }

  .provider-badge { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 99px; letter-spacing: 0.03em; }
  .provider-badge.claude  { background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44; }
  .provider-badge.openai  { background: #16a34a22; color: #4ade80; border: 1px solid #16a34a44; }
  .provider-badge.mistral { background: #ea580c22; color: #fb923c; border: 1px solid #ea580c44; }
  .provider-badge.lumo    { background: #0891b222; color: #38bdf8; border: 1px solid #0891b244; }
  .provider-badge.custom  { background: #52525b22; color: #a1a1aa; border: 1px solid #52525b44; }

  .edit-panel { border: 1px solid var(--gold,#c9a55c); border-radius: 10px; background: var(--bg-2,#1a1a1a); padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
  .edit-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .edit-title { display: flex; align-items: center; gap: 0.75rem; font-weight: 700; color: var(--text-light,#f0f0f0); }
  .edit-tabs { display: flex; gap: 0.5rem; border-bottom: 1px solid var(--line,#333); }
  .edit-tab { padding: 0.4rem 1rem; background: none; border: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.85rem; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .edit-tab.active { color: var(--gold,#c9a55c); border-bottom-color: var(--gold,#c9a55c); }
  .edit-section { display: flex; flex-direction: column; gap: 0.9rem; padding-top: 0.5rem; }
  .field-label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.8rem; color: var(--text-muted,#888); }
  .field-label input, .field-label textarea, .field-label select {
    padding: 0.45rem 0.7rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333);
    border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.88rem; outline: none; resize: vertical;
  }
  .field-label textarea { min-height: 80px; }
  .field-row { display: flex; gap: 1rem; flex-wrap: wrap; }
  .field-row .field-label { flex: 1; min-width: 120px; }
  .checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-muted,#888); cursor: pointer; }
  .checkbox-label input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--gold,#c9a55c); cursor: pointer; }
  .api-key-row { display: flex; gap: 0.4rem; align-items: center; }
  .api-key-input { flex: 1; }
  .btn-icon { padding: 0.4rem 0.6rem; background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 6px; cursor: pointer; font-size: 0.9rem; }
  .lumo-info { background: #0891b211; border: 1px solid #0891b244; border-radius: 8px; padding: 0.9rem 1rem; color: #38bdf8; font-size: 0.85rem; line-height: 1.5; }
  .fields-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.4rem 1rem; margin-top: 0.4rem; }
  code { font-family: monospace; background: var(--bg-dark,#111); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em; }

  .edit-actions { display: flex; gap: 0.5rem; }
  .btn-sm { padding: 0.3rem 0.7rem; border: 1px solid var(--line,#444); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted,#888); background: none; cursor: pointer; }
  .btn-danger { border-color: #ef4444; color: #ef4444; }
  .btn-primary { padding: 0.5rem 1.2rem; background: var(--gold,#c9a55c); color: #111; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.85rem; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line,#333); font-size: 0.82rem; color: var(--text-muted,#888); }
  .table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line,#222); font-size: 0.88rem; }
  .templates-header { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
  .edit-modal { background: var(--bg-2,#1a1a1a); border: 1px solid var(--gold,#c9a55c); border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
  .edit-modal label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; color: var(--text-muted,#888); }
  .edit-modal input, .edit-modal textarea { padding: 0.5rem 0.75rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.88rem; outline: none; resize: vertical; }
  .edit-modal select { padding: 0.5rem 0.75rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.88rem; }
</style>
```

- [ ] **Schritt 3: TypeScript-Check + Build**

```bash
cd website && pnpm tsc --noEmit 2>&1 | grep "error TS" | head -20
```

Erwartung: keine TS-Fehler.

- [ ] **Schritt 4: Commit**

```bash
git add website/src/components/admin/coaching/CoachingSettings.svelte
git commit -m "feat(coaching): custom provider creation form + field selector + delete [T000418]"
```

---

## Task 5: Gesamtverifikation

- [ ] **Schritt 1: Alle Unit-Tests laufen lassen**

```bash
cd website && pnpm test 2>&1 | tail -30
```

Erwartung: alle Tests PASS, kein `coaching-ki-config-db` FAIL.

- [ ] **Schritt 2: Manifest-Validierung**

```bash
cd .. && task workspace:validate 2>&1 | tail -5
```

Erwartung: kein Fehler.

- [ ] **Schritt 3: Push + PR updaten**

```bash
git push origin feature/coaching-ki-provider-profiles-und-klienten
```

PR #795 wird automatisch aktualisiert.

---

## Self-Review

**Spec Coverage:**
- ✅ Formulare je Anbieter (Claude/ChatGPT/Mistral/Lumo) — bereits auf Branch, kein neuer Code nötig
- ✅ Gemeinsame Felder: Name, API-Endpoint, API-Key (masked), Modell, Temperature, Max Tokens, System-Prompt, Notiz
- ✅ Anbieterspezifische Felder: top_p/top_k (Claude+Mistral), Thinking-Modus (Claude), presence/frequency penalty + org-id (ChatGPT), safe_prompt/random_seed/EU-Endpoint (Mistral), Hinweistext (Lumo)
- ✅ Custom-Provider anlegen mit individueller Feldzuordnung
- ✅ Custom-Provider löschen (Standard-Provider geschützt)
- ✅ DB-Migration: CHECK-Constraint weg, enabled_fields hinzu
- ✅ API: POST (create), DELETE (delete)
- ✅ UI: Anlegen-Formular mit Feldauswahl-Grid, Löschen-Button, Custom-Badge

**Placeholder-Scan:** keine TBDs, alle Code-Blöcke vollständig.

**Typ-Konsistenz:**
- `KiConfig.provider` ist nun `string` statt Union — `setActiveProvider` akzeptiert `string` ✓
- `enabledFields: string[] | null` konsistent durch alle Schichten ✓
- `showField(p: KiConfig, field: string)` — nimmt jetzt `KiConfig` statt `string` für korrekte Custom-Auflösung ✓
- `createKiProvider` gibt `KiConfig` zurück ✓
- Test-Import: `createKiProvider, deleteKiProvider` neu im Import ✓
