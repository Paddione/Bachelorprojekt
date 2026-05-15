---
ticket_id: T000403
title: Session-Management-Erweiterung — Implementierungsplan
domains: []
status: active
pr_number: null
---

# Session-Management-Erweiterung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erweitert das triadische KI-Coaching Session-System um Status-Verwaltung (inkl. Pause/Archiv), server-seitige Suche/Sortierung/Paginierung, vollständigen Audit-Trail, wählbare KI-Provider und editierbare Prompt-Templates.

**Architecture:** Vier neue DB-Tabellen (`session_audit_log`, `ki_config`, `step_templates` + Erweiterung `sessions`). Neue TS-Module je DB-Domäne. Neue API-Routen. SessionsOverview-Svelte-Komponente ersetzt statisches Astro-Template. CoachingSettings-Seite für KI + Templates.

**Tech Stack:** PostgreSQL 16, Astro 5 SSR, Svelte 5 Runes, TypeScript, pg-mem (Tests), Anthropic/OpenAI/Mistral SDK

---

## Dateistruktur

**Neu erstellen:**
- `website/src/lib/coaching-ki-config-db.ts` + `.test.ts`
- `website/src/lib/coaching-templates-db.ts` + `.test.ts`
- `website/src/components/admin/coaching/SessionsOverview.svelte`
- `website/src/components/admin/coaching/CoachingSettings.svelte`
- `website/src/pages/admin/coaching/settings.astro`
- `website/src/pages/api/admin/coaching/sessions/[id]/status.ts`
- `website/src/pages/api/admin/coaching/sessions/[id]/archive.ts`
- `website/src/pages/api/admin/coaching/sessions/[id]/unarchive.ts`
- `website/src/pages/api/admin/coaching/sessions/[id]/audit.ts`
- `website/src/pages/api/admin/coaching/ki-config/index.ts`
- `website/src/pages/api/admin/coaching/ki-config/active.ts`
- `website/src/pages/api/admin/coaching/step-templates/index.ts`
- `website/src/pages/api/admin/coaching/step-templates/[id].ts`

**Ändern:**
- `k3d/website-schema.yaml` (init Zeile 260 + ensure Zeile 846)
- `website/src/lib/coaching-session-db.ts`
- `website/src/lib/coaching-session-db.test.ts`
- `website/src/pages/admin/coaching/sessions/index.astro`
- `website/src/pages/admin/coaching/sessions/[id].astro`
- `website/src/pages/api/admin/coaching/sessions/index.ts`
- `website/src/pages/api/admin/coaching/sessions/[id]/index.ts`
- `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts`

---

## Task 1: DB-Schema erweitern

**Files:**
- Modify: `k3d/website-schema.yaml:260-278` (init-Block)
- Modify: `k3d/website-schema.yaml:846-864` (ensure-Block)

- [ ] **Schritt 1: Sessions-Tabelle im init-Block (Zeile 266) erweitern**

Ersetze den `CREATE TABLE IF NOT EXISTS coaching.sessions`-Block (Zeile 260–270) durch:

```yaml
      CREATE TABLE IF NOT EXISTS coaching.sessions (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand         TEXT NOT NULL DEFAULT 'mentolder',
        client_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
        client_name   TEXT,
        mode          TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live','prep')),
        title         TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','paused','completed','abandoned')),
        created_by    TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at  TIMESTAMPTZ,
        archived_at   TIMESTAMPTZ
      );
```

- [ ] **Schritt 2: Neue Tabellen nach `idx_session_steps_session` im init-Block einfügen (nach Zeile 294)**

```yaml
      CREATE TABLE IF NOT EXISTS coaching.session_audit_log (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id  UUID NOT NULL REFERENCES coaching.sessions(id) ON DELETE CASCADE,
        event_type  TEXT NOT NULL
                      CHECK (event_type IN
                        ('status_change','field_change','ai_request','notes_change')),
        actor       TEXT NOT NULL,
        step_number INT,
        payload     JSONB NOT NULL DEFAULT '{}',
        changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_session
        ON coaching.session_audit_log(session_id, changed_at DESC);

      CREATE TABLE IF NOT EXISTS coaching.ki_config (
        id           SERIAL PRIMARY KEY,
        brand        TEXT NOT NULL,
        provider     TEXT NOT NULL
                       CHECK (provider IN ('claude','openai','mistral','lumo')),
        is_active    BOOLEAN NOT NULL DEFAULT false,
        model_name   TEXT,
        display_name TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (brand, provider)
      );
      INSERT INTO coaching.ki_config (brand, provider, is_active, model_name, display_name)
      VALUES
        ('mentolder',  'claude',  true,  'claude-haiku-4-5-20251001','Claude (Anthropic)'),
        ('mentolder',  'openai',  false, 'gpt-4o-mini',              'ChatGPT (OpenAI)'),
        ('mentolder',  'mistral', false, 'mistral-small-latest',     'Mistral'),
        ('mentolder',  'lumo',    false, null,                       'Lumo'),
        ('korczewski', 'claude',  true,  'claude-haiku-4-5-20251001','Claude (Anthropic)'),
        ('korczewski', 'openai',  false, 'gpt-4o-mini',              'ChatGPT (OpenAI)'),
        ('korczewski', 'mistral', false, 'mistral-small-latest',     'Mistral'),
        ('korczewski', 'lumo',    false, null,                       'Lumo')
      ON CONFLICT (brand, provider) DO NOTHING;

      CREATE TABLE IF NOT EXISTS coaching.step_templates (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand            TEXT NOT NULL,
        step_number      INT NOT NULL,
        step_name        TEXT NOT NULL,
        phase            TEXT NOT NULL,
        system_prompt    TEXT NOT NULL,
        user_prompt_tpl  TEXT NOT NULL,
        input_schema     JSONB NOT NULL DEFAULT '[]',
        keywords         TEXT[] NOT NULL DEFAULT '{}',
        is_active        BOOLEAN NOT NULL DEFAULT true,
        sort_order       INT NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (brand, step_number)
      );
```

- [ ] **Schritt 3: Identische Änderungen im ensure-Block (Zeile 846–880) durchführen**

Gleiche Ersetzungen wie Schritte 1–2, aber im ensure-Block (ca. Zeile 846–880).

- [ ] **Schritt 4: Manifest validieren**

```bash
task workspace:validate
```

Erwartet: keine Fehler

- [ ] **Schritt 5: Commit**

```bash
git add k3d/website-schema.yaml
git commit -m "feat(db): extend coaching schema — audit_log, ki_config, step_templates, archived_at, paused"
```

---

## Task 2: coaching-session-db.ts erweitern

**Files:**
- Modify: `website/src/lib/coaching-session-db.ts`
- Modify: `website/src/lib/coaching-session-db.test.ts`

- [ ] **Schritt 1: Typen in `coaching-session-db.ts` anpassen**

Ersetze die `Session`-Interface-Definition (Zeile 3–14):

```typescript
export interface Session {
  id: string;
  brand: string;
  clientId: string | null;
  clientName: string | null;
  mode: 'live' | 'prep';
  title: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  archivedAt: Date | null;
  steps: SessionStep[];
}

export interface AuditEntry {
  id: string;
  sessionId: string;
  eventType: 'status_change' | 'field_change' | 'ai_request' | 'notes_change';
  actor: string;
  stepNumber: number | null;
  payload: Record<string, unknown>;
  changedAt: Date;
}

export interface ListSessionsOpts {
  q?: string;
  status?: string[];
  archived?: boolean;
  sort?: 'title' | 'client_name' | 'created_at' | 'status';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ListSessionsResult {
  sessions: Session[];
  total: number;
  page: number;
  pageSize: number;
}
```

- [ ] **Schritt 2: `rowToSession` anpassen**

Ersetze die `rowToSession`-Funktion (Zeile 50–63):

```typescript
function rowToSession(row: Record<string, unknown>, steps: SessionStep[] = []): Session {
  return {
    id: row.id as string,
    brand: row.brand as string,
    clientId: (row.client_id as string | null) ?? null,
    clientName: (row.client_name as string | null) ?? null,
    mode: row.mode as 'live' | 'prep',
    title: row.title as string,
    status: row.status as Session['status'],
    createdBy: row.created_by as string,
    createdAt: row.created_at as Date,
    completedAt: (row.completed_at as Date | null) ?? null,
    archivedAt: (row.archived_at as Date | null) ?? null,
    steps,
  };
}
```

- [ ] **Schritt 3: `listSessions` durch paginierte Version ersetzen**

Ersetze `listSessions` (Zeile 100–109):

```typescript
export async function listSessions(
  pool: Pool,
  brand: string,
  opts: ListSessionsOpts = {},
): Promise<ListSessionsResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const showArchived = opts.archived ?? false;

  const sortColMap: Record<string, string> = {
    title: 's.title',
    client_name: 's.client_name',
    status: 's.status',
    created_at: 's.created_at',
  };
  const sortCol = sortColMap[opts.sort ?? 'created_at'] ?? 's.created_at';
  const sortDir = opts.order === 'asc' ? 'ASC' : 'DESC';

  const params: unknown[] = [brand, showArchived, opts.q ? `%${opts.q}%` : null, pageSize, offset];
  const statusFilter = (opts.status ?? []).length > 0 ? opts.status! : null;

  const r = await pool.query(
    `SELECT s.*, COUNT(*) OVER() AS total_count
     FROM coaching.sessions s
     WHERE s.brand = $1
       AND ($2 OR s.archived_at IS NULL)
       AND ($3::text IS NULL OR s.title ILIKE $3 OR s.client_name ILIKE $3)
       AND ($6::text[] IS NULL OR s.status = ANY($6))
     ORDER BY ${sortCol} ${sortDir}
     LIMIT $4 OFFSET $5`,
    [...params, statusFilter],
  );

  const total = r.rows[0] ? Number(r.rows[0].total_count) : 0;
  return { sessions: r.rows.map(row => rowToSession(row)), total, page, pageSize };
}
```

- [ ] **Schritt 4: Neue Funktionen anhängen**

Füge am Ende der Datei (nach `completeSession`) hinzu:

```typescript
export async function appendAuditLog(
  pool: Pool,
  entry: Omit<AuditEntry, 'id' | 'changedAt'>,
): Promise<void> {
  await pool.query(
    `INSERT INTO coaching.session_audit_log
       (session_id, event_type, actor, step_number, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [entry.sessionId, entry.eventType, entry.actor, entry.stepNumber ?? null, entry.payload],
  );
}

export async function updateSessionStatus(
  pool: Pool,
  id: string,
  newStatus: Session['status'],
  actor: string,
): Promise<Session | null> {
  const current = await pool.query(
    `SELECT status FROM coaching.sessions WHERE id = $1`,
    [id],
  );
  if (!current.rows[0]) return null;
  const fromStatus = current.rows[0].status as string;
  if (fromStatus === 'completed' && newStatus === 'active') return null;

  const r = await pool.query(
    `UPDATE coaching.sessions SET status = $2 WHERE id = $1 RETURNING *`,
    [id, newStatus],
  );
  await appendAuditLog(pool, {
    sessionId: id,
    eventType: 'status_change',
    actor,
    stepNumber: null,
    payload: { from: fromStatus, to: newStatus },
  });
  return rowToSession(r.rows[0]);
}

export async function updateSessionFields(
  pool: Pool,
  id: string,
  fields: Partial<{ title: string; clientId: string | null; clientName: string | null }>,
  actor: string,
): Promise<Session | null> {
  const current = await pool.query(`SELECT * FROM coaching.sessions WHERE id = $1`, [id]);
  if (!current.rows[0]) return null;
  const row = current.rows[0];

  const sets: string[] = [];
  const vals: unknown[] = [id];
  const changedFields: { field: string; from: unknown; to: unknown }[] = [];

  if (fields.title !== undefined && fields.title !== row.title) {
    vals.push(fields.title);
    sets.push(`title = $${vals.length}`);
    changedFields.push({ field: 'title', from: row.title, to: fields.title });
  }
  if (fields.clientId !== undefined && fields.clientId !== row.client_id) {
    vals.push(fields.clientId);
    sets.push(`client_id = $${vals.length}`);
    changedFields.push({ field: 'client_id', from: row.client_id, to: fields.clientId });
  }
  if (fields.clientName !== undefined && fields.clientName !== row.client_name) {
    vals.push(fields.clientName);
    sets.push(`client_name = $${vals.length}`);
    changedFields.push({ field: 'client_name', from: row.client_name, to: fields.clientName });
  }
  if (sets.length === 0) return rowToSession(row);

  const r = await pool.query(
    `UPDATE coaching.sessions SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    vals,
  );
  for (const f of changedFields) {
    await appendAuditLog(pool, {
      sessionId: id, eventType: 'field_change', actor, stepNumber: null, payload: f,
    });
  }
  return rowToSession(r.rows[0]);
}

export async function archiveSession(pool: Pool, id: string, actor: string): Promise<void> {
  await pool.query(
    `UPDATE coaching.sessions SET archived_at = now() WHERE id = $1`,
    [id],
  );
  await appendAuditLog(pool, {
    sessionId: id, eventType: 'status_change', actor, stepNumber: null,
    payload: { action: 'archived' },
  });
}

export async function unarchiveSession(pool: Pool, id: string, actor: string): Promise<void> {
  await pool.query(
    `UPDATE coaching.sessions SET archived_at = null WHERE id = $1`,
    [id],
  );
  await appendAuditLog(pool, {
    sessionId: id, eventType: 'status_change', actor, stepNumber: null,
    payload: { action: 'unarchived' },
  });
}

export async function getAuditLog(pool: Pool, sessionId: string, limit = 50): Promise<AuditEntry[]> {
  const r = await pool.query(
    `SELECT * FROM coaching.session_audit_log WHERE session_id = $1
     ORDER BY changed_at DESC LIMIT $2`,
    [sessionId, limit],
  );
  return r.rows.map(row => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    eventType: row.event_type as AuditEntry['eventType'],
    actor: row.actor as string,
    stepNumber: (row.step_number as number | null) ?? null,
    payload: row.payload as Record<string, unknown>,
    changedAt: row.changed_at as Date,
  }));
}
```

- [ ] **Schritt 5: Tests erweitern — neues Schema in `beforeAll`**

In `coaching-session-db.test.ts`, ergänze im `db.public.none(...)` Block das Schema:

```typescript
// nach "UNIQUE (session_id, step_number)" in der sessions-Schema-Definition:
    client_name   TEXT,
    archived_at   TIMESTAMPTZ,
// status CHECK erweitern:
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active','paused','completed','abandoned')),
```

Und füge nach dem bestehenden session_steps-Block hinzu:

```typescript
    CREATE TABLE coaching.session_audit_log (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id  UUID NOT NULL REFERENCES coaching.sessions(id) ON DELETE CASCADE,
      event_type  TEXT NOT NULL,
      actor       TEXT NOT NULL,
      step_number INT,
      payload     JSONB NOT NULL DEFAULT '{}',
      changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
```

- [ ] **Schritt 6: Neue Tests schreiben**

Füge neue `describe`-Blöcke in `coaching-session-db.test.ts` hinzu:

```typescript
describe('updateSessionStatus', () => {
  it('changes status and writes audit log', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'T', mode: 'live', createdBy: 'coach',
    });
    const updated = await updateSessionStatus(pool, s.id, 'paused', 'coach');
    expect(updated?.status).toBe('paused');
    const log = await getAuditLog(pool, s.id);
    expect(log[0].eventType).toBe('status_change');
    expect(log[0].payload).toMatchObject({ from: 'active', to: 'paused' });
  });

  it('blocks completed → active transition', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'T', mode: 'live', createdBy: 'coach',
    });
    await completeSession(pool, s.id, 'report');
    const result = await updateSessionStatus(pool, s.id, 'active', 'coach');
    expect(result).toBeNull();
  });
});

describe('archiveSession / unarchiveSession', () => {
  it('sets and clears archived_at', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'T', mode: 'live', createdBy: 'coach',
    });
    await archiveSession(pool, s.id, 'coach');
    const fetched = await getSession(pool, s.id);
    expect(fetched?.archivedAt).not.toBeNull();
    await unarchiveSession(pool, s.id, 'coach');
    const fetched2 = await getSession(pool, s.id);
    expect(fetched2?.archivedAt).toBeNull();
  });
});

describe('listSessions paginiert', () => {
  it('filtert archivierte Sessions standardmäßig aus', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Archiviert', mode: 'live', createdBy: 'coach',
    });
    await archiveSession(pool, s.id, 'coach');
    const result = await listSessions(pool, 'mentolder', {});
    expect(result.sessions.find(x => x.id === s.id)).toBeUndefined();
  });

  it('zeigt archivierte Sessions wenn archived=true', async () => {
    const result = await listSessions(pool, 'mentolder', { archived: true });
    expect(result.sessions.some(x => x.archivedAt !== null)).toBe(true);
  });
});
```

- [ ] **Schritt 7: Tests ausführen**

```bash
cd website && npx vitest run src/lib/coaching-session-db.test.ts
```

Erwartet: alle Tests grün

- [ ] **Schritt 8: Commit**

```bash
git add website/src/lib/coaching-session-db.ts website/src/lib/coaching-session-db.test.ts
git commit -m "feat(coaching): extend session-db — paginierung, status, archiv, audit-log"
```

---

## Task 3: coaching-ki-config-db.ts erstellen

**Files:**
- Create: `website/src/lib/coaching-ki-config-db.ts`
- Create: `website/src/lib/coaching-ki-config-db.test.ts`

- [ ] **Schritt 1: Test zuerst schreiben**

Erstelle `website/src/lib/coaching-ki-config-db.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { listKiProviders, getActiveProvider, setActiveProvider } from './coaching-ki-config-db';

let pool: Pool;

beforeAll(async () => {
  const db = newDb();
  db.public.none(`
    CREATE TABLE coaching_ki_config (
      id SERIAL PRIMARY KEY,
      brand TEXT NOT NULL,
      provider TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT false,
      model_name TEXT,
      display_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (brand, provider)
    );
    INSERT INTO coaching_ki_config (brand, provider, is_active, model_name, display_name)
    VALUES
      ('mentolder', 'claude',  true,  'claude-haiku', 'Claude'),
      ('mentolder', 'openai',  false, 'gpt-4o-mini',  'ChatGPT'),
      ('mentolder', 'mistral', false, null,            'Mistral'),
      ('mentolder', 'lumo',    false, null,            'Lumo');
  `);
  pool = db.adapters.createPgPool() as unknown as Pool;
});

describe('listKiProviders', () => {
  it('returns all 4 providers for brand', async () => {
    const providers = await listKiProviders(pool, 'mentolder');
    expect(providers).toHaveLength(4);
  });
});

describe('getActiveProvider', () => {
  it('returns the active provider', async () => {
    const p = await getActiveProvider(pool, 'mentolder');
    expect(p?.provider).toBe('claude');
    expect(p?.isActive).toBe(true);
  });
});

describe('setActiveProvider', () => {
  it('switches active provider atomically', async () => {
    await setActiveProvider(pool, 'mentolder', 'openai');
    const active = await getActiveProvider(pool, 'mentolder');
    expect(active?.provider).toBe('openai');
    const all = await listKiProviders(pool, 'mentolder');
    const active_count = all.filter(p => p.isActive).length;
    expect(active_count).toBe(1);
    // Reset
    await setActiveProvider(pool, 'mentolder', 'claude');
  });
});
```

- [ ] **Schritt 2: Tests ausführen — erwartet FAIL**

```bash
cd website && npx vitest run src/lib/coaching-ki-config-db.test.ts
```

Erwartet: FAIL (Modul nicht gefunden)

- [ ] **Schritt 3: Implementierung erstellen**

Erstelle `website/src/lib/coaching-ki-config-db.ts`:

```typescript
import type { Pool } from 'pg';

export interface KiConfig {
  id: number;
  brand: string;
  provider: 'claude' | 'openai' | 'mistral' | 'lumo';
  isActive: boolean;
  modelName: string | null;
  displayName: string;
  createdAt: Date;
}

function rowToKiConfig(row: Record<string, unknown>): KiConfig {
  return {
    id: row.id as number,
    brand: row.brand as string,
    provider: row.provider as KiConfig['provider'],
    isActive: row.is_active as boolean,
    modelName: (row.model_name as string | null) ?? null,
    displayName: row.display_name as string,
    createdAt: row.created_at as Date,
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

export async function setActiveProvider(
  pool: Pool,
  brand: string,
  provider: string,
): Promise<void> {
  await pool.query('BEGIN');
  try {
    await pool.query(
      `UPDATE coaching.ki_config SET is_active = false WHERE brand = $1`,
      [brand],
    );
    await pool.query(
      `UPDATE coaching.ki_config SET is_active = true WHERE brand = $1 AND provider = $2`,
      [brand, provider],
    );
    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}
```

- [ ] **Schritt 4: Tests ausführen — erwartet PASS**

```bash
cd website && npx vitest run src/lib/coaching-ki-config-db.test.ts
```

Erwartet: alle Tests grün (Hinweis: pg-mem nutzt kein Schema-Präfix, daher `coaching_ki_config` ohne Schema in Tests)

- [ ] **Schritt 5: Commit**

```bash
git add website/src/lib/coaching-ki-config-db.ts website/src/lib/coaching-ki-config-db.test.ts
git commit -m "feat(coaching): add ki-config-db module"
```

---

## Task 4: coaching-templates-db.ts erstellen

**Files:**
- Create: `website/src/lib/coaching-templates-db.ts`
- Create: `website/src/lib/coaching-templates-db.test.ts`

- [ ] **Schritt 1: Test zuerst schreiben**

Erstelle `website/src/lib/coaching-templates-db.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  listStepTemplates,
  getStepTemplate,
  upsertStepTemplate,
  deleteStepTemplate,
} from './coaching-templates-db';

let pool: Pool;

beforeAll(async () => {
  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  db.public.none(`
    CREATE TABLE coaching_step_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand TEXT NOT NULL,
      step_number INT NOT NULL,
      step_name TEXT NOT NULL,
      phase TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      user_prompt_tpl TEXT NOT NULL,
      input_schema JSONB NOT NULL DEFAULT '[]',
      keywords TEXT[] NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (brand, step_number)
    );
  `);
  pool = db.adapters.createPgPool() as unknown as Pool;
});

describe('upsertStepTemplate + listStepTemplates', () => {
  it('creates and lists a template', async () => {
    await upsertStepTemplate(pool, {
      brand: 'mentolder',
      stepNumber: 1,
      stepName: 'Erstanamnese',
      phase: 'problem_ziel',
      systemPrompt: 'System prompt',
      userPromptTpl: 'User template {anlass}',
      inputSchema: [{ key: 'anlass', label: 'Anlass', required: true }],
      keywords: ['anamnese'],
      isActive: true,
      sortOrder: 0,
    });
    const list = await listStepTemplates(pool, 'mentolder');
    expect(list).toHaveLength(1);
    expect(list[0].stepName).toBe('Erstanamnese');
  });

  it('updates existing template on conflict', async () => {
    await upsertStepTemplate(pool, {
      brand: 'mentolder',
      stepNumber: 1,
      stepName: 'Erstanamnese Updated',
      phase: 'problem_ziel',
      systemPrompt: 'Updated system',
      userPromptTpl: 'Updated tpl',
      inputSchema: [],
      keywords: [],
      isActive: true,
      sortOrder: 0,
    });
    const t = await getStepTemplate(pool, 'mentolder', 1);
    expect(t?.stepName).toBe('Erstanamnese Updated');
  });
});

describe('deleteStepTemplate', () => {
  it('removes a template by id', async () => {
    const list = await listStepTemplates(pool, 'mentolder');
    await deleteStepTemplate(pool, list[0].id);
    const after = await listStepTemplates(pool, 'mentolder');
    expect(after).toHaveLength(0);
  });
});
```

- [ ] **Schritt 2: Tests ausführen — erwartet FAIL**

```bash
cd website && npx vitest run src/lib/coaching-templates-db.test.ts
```

- [ ] **Schritt 3: Implementierung erstellen**

Erstelle `website/src/lib/coaching-templates-db.ts`:

```typescript
import type { Pool } from 'pg';

export interface StepTemplate {
  id: string;
  brand: string;
  stepNumber: number;
  stepName: string;
  phase: string;
  systemPrompt: string;
  userPromptTpl: string;
  inputSchema: Array<{ key: string; label: string; required: boolean; multiline?: boolean }>;
  keywords: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface UpsertTemplateArgs {
  brand: string;
  stepNumber: number;
  stepName: string;
  phase: string;
  systemPrompt: string;
  userPromptTpl: string;
  inputSchema: StepTemplate['inputSchema'];
  keywords: string[];
  isActive: boolean;
  sortOrder: number;
}

function rowToTemplate(row: Record<string, unknown>): StepTemplate {
  return {
    id: row.id as string,
    brand: row.brand as string,
    stepNumber: row.step_number as number,
    stepName: row.step_name as string,
    phase: row.phase as string,
    systemPrompt: row.system_prompt as string,
    userPromptTpl: row.user_prompt_tpl as string,
    inputSchema: row.input_schema as StepTemplate['inputSchema'],
    keywords: row.keywords as string[],
    isActive: row.is_active as boolean,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as Date,
  };
}

export async function listStepTemplates(pool: Pool, brand: string): Promise<StepTemplate[]> {
  const r = await pool.query(
    `SELECT * FROM coaching.step_templates WHERE brand = $1 ORDER BY sort_order, step_number`,
    [brand],
  );
  return r.rows.map(rowToTemplate);
}

export async function getStepTemplate(
  pool: Pool,
  brand: string,
  stepNumber: number,
): Promise<StepTemplate | null> {
  const r = await pool.query(
    `SELECT * FROM coaching.step_templates WHERE brand = $1 AND step_number = $2 AND is_active = true`,
    [brand, stepNumber],
  );
  return r.rows[0] ? rowToTemplate(r.rows[0]) : null;
}

export async function upsertStepTemplate(
  pool: Pool,
  args: UpsertTemplateArgs,
): Promise<StepTemplate> {
  const r = await pool.query(
    `INSERT INTO coaching.step_templates
       (brand, step_number, step_name, phase, system_prompt, user_prompt_tpl,
        input_schema, keywords, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (brand, step_number) DO UPDATE SET
       step_name       = EXCLUDED.step_name,
       phase           = EXCLUDED.phase,
       system_prompt   = EXCLUDED.system_prompt,
       user_prompt_tpl = EXCLUDED.user_prompt_tpl,
       input_schema    = EXCLUDED.input_schema,
       keywords        = EXCLUDED.keywords,
       is_active       = EXCLUDED.is_active,
       sort_order      = EXCLUDED.sort_order
     RETURNING *`,
    [
      args.brand, args.stepNumber, args.stepName, args.phase,
      args.systemPrompt, args.userPromptTpl,
      JSON.stringify(args.inputSchema), args.keywords,
      args.isActive, args.sortOrder,
    ],
  );
  return rowToTemplate(r.rows[0]);
}

export async function deleteStepTemplate(pool: Pool, id: string): Promise<void> {
  await pool.query(`DELETE FROM coaching.step_templates WHERE id = $1`, [id]);
}

export function buildPromptFromTemplate(
  tpl: StepTemplate,
  inputs: Record<string, string>,
): string {
  return tpl.userPromptTpl.replace(/\{(\w+)\}/g, (_, k) => inputs[k] ?? '—');
}
```

- [ ] **Schritt 4: Tests ausführen — erwartet PASS**

```bash
cd website && npx vitest run src/lib/coaching-templates-db.test.ts
```

- [ ] **Schritt 5: Commit**

```bash
git add website/src/lib/coaching-templates-db.ts website/src/lib/coaching-templates-db.test.ts
git commit -m "feat(coaching): add step-templates-db module"
```

---

## Task 5: API — Sessions-Liste + Session-Felder aktualisieren

**Files:**
- Modify: `website/src/pages/api/admin/coaching/sessions/index.ts`
- Modify: `website/src/pages/api/admin/coaching/sessions/[id]/index.ts`

- [ ] **Schritt 1: `sessions/index.ts` GET aktualisieren**

Ersetze den gesamten Inhalt:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createSession, listSessions } from '../../../../../lib/coaching-session-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const brand = process.env.BRAND || 'mentolder';
  const q = url.searchParams.get('q') ?? undefined;
  const sort = (url.searchParams.get('sort') ?? undefined) as
    'title' | 'client_name' | 'created_at' | 'status' | undefined;
  const order = (url.searchParams.get('order') ?? undefined) as 'asc' | 'desc' | undefined;
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
  const archived = url.searchParams.get('archived') === 'true';
  const statusParam = url.searchParams.getAll('status');

  const result = await listSessions(pool, brand, { q, sort, order, page, pageSize, archived, status: statusParam });
  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  let body: { title: string; clientId?: string | null; clientName?: string | null; mode?: 'live' | 'prep' };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  if (!body.title?.trim()) {
    return new Response(JSON.stringify({ error: 'title required' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const created = await createSession(pool, {
    brand, title: body.title, createdBy: session.preferred_username,
    clientId: body.clientId ?? null, mode: body.mode ?? 'live',
  });
  return new Response(JSON.stringify({ session: created }), { status: 201, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 2: `[id]/index.ts` um PATCH erweitern**

Ersetze den gesamten Inhalt:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import {
  getSession as getCoachingSession,
  updateSessionFields,
} from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const s = await getCoachingSession(pool, params.id as string);
  if (!s) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ session: s }), { headers: { 'content-type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  let body: { title?: string; clientId?: string | null; clientName?: string | null };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const updated = await updateSessionFields(pool, params.id as string, body, session.preferred_username);
  if (!updated) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ session: updated }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 3: Commit**

```bash
git add website/src/pages/api/admin/coaching/sessions/index.ts \
        website/src/pages/api/admin/coaching/sessions/[id]/index.ts
git commit -m "feat(api): sessions paginierung + PATCH session-felder"
```

---

## Task 6: API — Status, Archiv, Audit-Log

**Files:**
- Create: `website/src/pages/api/admin/coaching/sessions/[id]/status.ts`
- Create: `website/src/pages/api/admin/coaching/sessions/[id]/archive.ts`
- Create: `website/src/pages/api/admin/coaching/sessions/[id]/unarchive.ts`
- Create: `website/src/pages/api/admin/coaching/sessions/[id]/audit.ts`

- [ ] **Schritt 1: `status.ts` erstellen**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { updateSessionStatus } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  let body: { status: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const allowed = ['active', 'paused', 'completed', 'abandoned'];
  if (!allowed.includes(body.status)) {
    return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const updated = await updateSessionStatus(
    pool, params.id as string, body.status as 'active' | 'paused' | 'completed' | 'abandoned',
    session.preferred_username,
  );
  if (!updated) return new Response(JSON.stringify({ error: 'Not found or transition not allowed' }), { status: 422, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ session: updated }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 2: `archive.ts` erstellen**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { archiveSession } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await archiveSession(pool, params.id as string, session.preferred_username);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 3: `unarchive.ts` erstellen**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { unarchiveSession } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await unarchiveSession(pool, params.id as string, session.preferred_username);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 4: `audit.ts` erstellen**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getAuditLog } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const log = await getAuditLog(pool, params.id as string, limit);
  return new Response(JSON.stringify({ log }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 5: Commit**

```bash
git add website/src/pages/api/admin/coaching/sessions/[id]/status.ts \
        website/src/pages/api/admin/coaching/sessions/[id]/archive.ts \
        website/src/pages/api/admin/coaching/sessions/[id]/unarchive.ts \
        website/src/pages/api/admin/coaching/sessions/[id]/audit.ts
git commit -m "feat(api): session status/archiv/audit-log endpunkte"
```

---

## Task 7: API — KI-Config

**Files:**
- Create: `website/src/pages/api/admin/coaching/ki-config/index.ts`
- Create: `website/src/pages/api/admin/coaching/ki-config/active.ts`

- [ ] **Schritt 1: `ki-config/index.ts` erstellen**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listKiProviders } from '../../../../../lib/coaching-ki-config-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const providers = await listKiProviders(pool, brand);
  return new Response(JSON.stringify({ providers }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 2: `ki-config/active.ts` erstellen**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { setActiveProvider } from '../../../../../lib/coaching-ki-config-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  let body: { provider: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const allowed = ['claude', 'openai', 'mistral', 'lumo'];
  if (!allowed.includes(body.provider)) {
    return new Response(JSON.stringify({ error: 'Invalid provider' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const brand = process.env.BRAND || 'mentolder';
  await setActiveProvider(pool, brand, body.provider);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 3: Commit**

```bash
git add website/src/pages/api/admin/coaching/ki-config/
git commit -m "feat(api): ki-config endpunkte"
```

---

## Task 8: API — Step-Templates

**Files:**
- Create: `website/src/pages/api/admin/coaching/step-templates/index.ts`
- Create: `website/src/pages/api/admin/coaching/step-templates/[id].ts`

- [ ] **Schritt 1: `step-templates/index.ts` erstellen**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listStepTemplates, upsertStepTemplate } from '../../../../../lib/coaching-templates-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const templates = await listStepTemplates(pool, brand);
  return new Response(JSON.stringify({ templates }), { headers: { 'content-type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  let body: Parameters<typeof upsertStepTemplate>[1];
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const t = await upsertStepTemplate(pool, { ...body, brand });
  return new Response(JSON.stringify({ template: t }), { status: 201, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 2: `step-templates/[id].ts` erstellen**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { upsertStepTemplate, deleteStepTemplate, listStepTemplates } from '../../../../../lib/coaching-templates-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  let body: Parameters<typeof upsertStepTemplate>[1];
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const t = await upsertStepTemplate(pool, { ...body, brand });
  return new Response(JSON.stringify({ template: t }), { headers: { 'content-type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const templates = await listStepTemplates(pool, brand);
  const target = templates.find(t => t.id === params.id);
  if (!target) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  const activeForStep = templates.filter(t => t.stepNumber === target.stepNumber && t.isActive);
  if (activeForStep.length <= 1 && target.isActive) {
    return new Response(JSON.stringify({ error: 'Letztes aktives Template für diesen Schritt kann nicht gelöscht werden' }), { status: 409, headers: { 'content-type': 'application/json' } });
  }
  await deleteStepTemplate(pool, params.id as string);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 3: Commit**

```bash
git add website/src/pages/api/admin/coaching/step-templates/
git commit -m "feat(api): step-templates CRUD endpunkte"
```

---

## Task 9: generate.ts — Provider-aware + Template-aware + Audit

**Files:**
- Modify: `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts`

- [ ] **Schritt 1: generate.ts ersetzen**

```typescript
import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../../../../lib/auth';
import { upsertStep, appendAuditLog } from '../../../../../../../../lib/coaching-session-db';
import { getActiveProvider } from '../../../../../../../../lib/coaching-ki-config-db';
import { getStepTemplate, buildPromptFromTemplate } from '../../../../../../../../lib/coaching-templates-db';
import { getStepDef, buildUserPrompt } from '../../../../../../../../lib/coaching-session-prompts';
import { pool } from '../../../../../../../../lib/website-db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const sessionId = params.id as string;
  const stepNumber = parseInt(params.n as string, 10);
  if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 10) {
    return new Response(JSON.stringify({ error: 'Invalid step number' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  let body: { coachInputs: Record<string, string> };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const brand = process.env.BRAND || 'mentolder';
  const activeProvider = await getActiveProvider(pool, brand);
  const providerName = activeProvider?.provider ?? 'claude';

  // Prompt aus DB-Template (Fallback auf TS-Konstanten)
  const dbTemplate = await getStepTemplate(pool, brand, stepNumber);
  let systemPrompt: string;
  let userPrompt: string;
  let stepName: string;
  let phase: string;

  if (dbTemplate) {
    systemPrompt = dbTemplate.systemPrompt;
    userPrompt = buildPromptFromTemplate(dbTemplate, body.coachInputs);
    stepName = dbTemplate.stepName;
    phase = dbTemplate.phase;
  } else {
    const def = getStepDef(stepNumber);
    systemPrompt = def.systemPrompt;
    userPrompt = buildUserPrompt(def, body.coachInputs);
    stepName = def.stepName;
    phase = def.phase;
  }

  const startMs = Date.now();
  let aiResponse: string;

  try {
    if (providerName === 'claude') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' }), { status: 503, headers: { 'content-type': 'application/json' } });
      const client = new Anthropic({ apiKey });
      const model = activeProvider?.modelName ?? process.env.COACHING_SESSION_MODEL ?? 'claude-haiku-4-5-20251001';
      const msg = await client.messages.create({
        model, max_tokens: 600, system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      aiResponse = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    } else if (providerName === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: 'OPENAI_API_KEY nicht konfiguriert' }), { status: 503, headers: { 'content-type': 'application/json' } });
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
      const model = activeProvider?.modelName ?? 'gpt-4o-mini';
      const resp = await client.chat.completions.create({
        model, max_tokens: 600,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      });
      aiResponse = resp.choices[0]?.message.content ?? '';
    } else if (providerName === 'mistral') {
      const apiKey = process.env.MISTRAL_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: 'MISTRAL_API_KEY nicht konfiguriert' }), { status: 503, headers: { 'content-type': 'application/json' } });
      const { Mistral } = await import('@mistralai/mistralai');
      const client = new Mistral({ apiKey });
      const model = activeProvider?.modelName ?? 'mistral-small-latest';
      const resp = await client.chat.complete({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      });
      aiResponse = (resp.choices?.[0]?.message.content as string) ?? '';
    } else {
      return new Response(JSON.stringify({ error: `Provider '${providerName}' noch nicht implementiert` }), { status: 503, headers: { 'content-type': 'application/json' } });
    }
  } catch (err) {
    console.error('[coaching/generate]', err);
    return new Response(JSON.stringify({ error: 'KI-Anfrage fehlgeschlagen' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  const durationMs = Date.now() - startMs;

  const step = await upsertStep(pool, {
    sessionId, stepNumber, stepName, phase,
    coachInputs: body.coachInputs, aiPrompt: userPrompt, aiResponse, status: 'generated',
  });

  await appendAuditLog(pool, {
    sessionId, eventType: 'ai_request', actor: session.preferred_username,
    stepNumber,
    payload: { provider: providerName, model: activeProvider?.modelName ?? '?', prompt: userPrompt, response: aiResponse, duration_ms: durationMs },
  });

  return new Response(JSON.stringify({ step }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 2: Abhängigkeiten installieren (falls nötig)**

```bash
cd website && grep -q '"openai"' package.json || npm install openai @mistralai/mistralai
```

- [ ] **Schritt 3: Commit**

```bash
git add website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts
git commit -m "feat(coaching): generate-api provider-aware (claude/openai/mistral) + audit-log"
```

---

## Task 10: SessionsOverview.svelte

**Files:**
- Create: `website/src/components/admin/coaching/SessionsOverview.svelte`

- [x] **Schritt 1: Komponente erstellen**

```svelte
<script lang="ts">
  import type { Session, ListSessionsResult } from '../../../lib/coaching-session-db';

  let {
    initialResult,
  }: { initialResult: ListSessionsResult } = $props();

  let sessions = $state<Session[]>(initialResult.sessions);
  let total = $state(initialResult.total);
  let page = $state(initialResult.page);
  const pageSize = initialResult.pageSize;

  let q = $state('');
  let sort = $state<string>('created_at');
  let order = $state<'asc' | 'desc'>('desc');
  let statusFilter = $state<string[]>([]);
  let showArchived = $state(false);
  let loading = $state(false);

  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  const STATUS_OPTIONS = [
    { value: 'active',    label: 'Läuft',         cls: 'badge-active' },
    { value: 'paused',    label: 'Pause',          cls: 'badge-paused' },
    { value: 'completed', label: 'Abgeschlossen',  cls: 'badge-completed' },
    { value: 'abandoned', label: 'Abgebrochen',    cls: 'badge-abandoned' },
  ];

  function badgeCls(status: string) {
    return STATUS_OPTIONS.find(s => s.value === status)?.cls ?? 'badge-abandoned';
  }
  function statusLabel(status: string) {
    return STATUS_OPTIONS.find(s => s.value === status)?.label ?? status;
  }

  async function load(p = page) {
    loading = true;
    const params = new URLSearchParams({
      q, sort, order, page: String(p), pageSize: String(pageSize),
      archived: String(showArchived),
    });
    statusFilter.forEach(s => params.append('status', s));
    const res = await fetch(`/api/admin/coaching/sessions?${params}`);
    const data: ListSessionsResult = await res.json();
    sessions = data.sessions;
    total = data.total;
    page = data.page;
    loading = false;
  }

  function onSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => load(1), 300);
  }

  function toggleSort(col: string) {
    if (sort === col) {
      order = order === 'asc' ? 'desc' : 'asc';
    } else {
      sort = col;
      order = 'asc';
    }
    load(1);
  }

  function toggleStatus(val: string) {
    if (statusFilter.includes(val)) {
      statusFilter = statusFilter.filter(s => s !== val);
    } else {
      statusFilter = [...statusFilter, val];
    }
    load(1);
  }

  async function changeStatus(id: string, newStatus: string) {
    await fetch(`/api/admin/coaching/sessions/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await load();
  }

  let confirmArchiveId = $state<string | null>(null);

  async function doArchive(id: string) {
    await fetch(`/api/admin/coaching/sessions/${id}/archive`, { method: 'POST' });
    confirmArchiveId = null;
    await load();
  }

  async function doUnarchive(id: string) {
    await fetch(`/api/admin/coaching/sessions/${id}/unarchive`, { method: 'POST' });
    await load();
  }

  function fmtDate(d: Date | string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const totalPages = $derived(Math.ceil(total / pageSize));
</script>

<div class="overview">
  <!-- Toolbar -->
  <div class="toolbar">
    <input
      class="search-input"
      type="text"
      placeholder="Titel oder Klient suchen…"
      bind:value={q}
      oninput={onSearch}
    />
    <a href="/admin/coaching/sessions/new" class="btn-primary">+ Neue Session</a>
  </div>

  <!-- Status-Filter -->
  <div class="filter-row">
    {#each STATUS_OPTIONS as opt}
      <button
        class="filter-btn {statusFilter.includes(opt.value) ? 'active' : ''}"
        onclick={() => toggleStatus(opt.value)}
      >{opt.label}</button>
    {/each}
    <label class="archive-toggle">
      <input type="checkbox" bind:checked={showArchived} onchange={() => load(1)} />
      Archivierte anzeigen
    </label>
  </div>

  <!-- Tabelle -->
  {#if loading}
    <div class="loading">Laden…</div>
  {:else if sessions.length === 0}
    <div class="empty">Keine Sessions gefunden.</div>
  {:else}
    <table class="table">
      <thead>
        <tr>
          <th><button class="sort-btn" onclick={() => toggleSort('title')}>Titel {sort==='title' ? (order==='asc'?'↑':'↓') : ''}</button></th>
          <th><button class="sort-btn" onclick={() => toggleSort('client_name')}>Klient {sort==='client_name' ? (order==='asc'?'↑':'↓') : ''}</button></th>
          <th><button class="sort-btn" onclick={() => toggleSort('created_at')}>Datum {sort==='created_at' ? (order==='asc'?'↑':'↓') : ''}</button></th>
          <th><button class="sort-btn" onclick={() => toggleSort('status')}>Status {sort==='status' ? (order==='asc'?'↑':'↓') : ''}</button></th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each sessions as s (s.id)}
          <tr class={s.archivedAt ? 'archived-row' : ''}>
            <td><a href={`/admin/coaching/sessions/${s.id}`}>{s.title}</a></td>
            <td>{s.clientName ?? s.clientId ?? '—'}</td>
            <td>{fmtDate(s.createdAt)}</td>
            <td>
              {#if !s.archivedAt}
                <select
                  class="status-select {badgeCls(s.status)}"
                  value={s.status}
                  onchange={(e) => changeStatus(s.id, (e.target as HTMLSelectElement).value)}
                >
                  {#each STATUS_OPTIONS as opt}
                    <option value={opt.value} disabled={s.status === 'completed' && opt.value === 'active'}>
                      {opt.label}
                    </option>
                  {/each}
                </select>
              {:else}
                <span class="badge badge-abandoned">Archiviert</span>
              {/if}
            </td>
            <td class="actions">
              <a href={`/admin/coaching/sessions/${s.id}`} class="btn-sm">Öffnen</a>
              {#if s.archivedAt}
                <button class="btn-sm" onclick={() => doUnarchive(s.id)} title="Archivierung aufheben">↩</button>
              {:else if confirmArchiveId === s.id}
                <button class="btn-sm btn-danger" onclick={() => doArchive(s.id)}>Sicher?</button>
                <button class="btn-sm" onclick={() => confirmArchiveId = null}>Abbruch</button>
              {:else}
                <button class="btn-sm" onclick={() => confirmArchiveId = s.id} title="Archivieren">📦</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <!-- Paginierung -->
    {#if totalPages > 1}
      <div class="pagination">
        {#each Array.from({length: totalPages}, (_, i) => i + 1) as p}
          <button class="page-btn {p === page ? 'active' : ''}" onclick={() => load(p)}>{p}</button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .overview { max-width: 1000px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .search-input { flex: 1; padding: 0.5rem 0.75rem; background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.9rem; outline: none; }
  .search-input:focus { border-color: var(--gold,#c9a55c); }
  .btn-primary { padding: 0.5rem 1.2rem; background: var(--gold,#c9a55c); color: #111; font-weight: 700; border-radius: 6px; text-decoration: none; font-size: 0.85rem; white-space: nowrap; }
  .filter-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
  .filter-btn { padding: 0.3rem 0.75rem; border: 1px solid var(--line,#444); border-radius: 20px; background: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.8rem; }
  .filter-btn.active { border-color: var(--gold,#c9a55c); color: var(--gold,#c9a55c); }
  .archive-toggle { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--text-muted,#888); cursor: pointer; margin-left: auto; }
  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line,#333); font-size: 0.82rem; color: var(--text-muted,#888); }
  .table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line,#222); font-size: 0.9rem; }
  .table a { color: var(--gold,#c9a55c); text-decoration: none; }
  .sort-btn { background: none; border: none; color: inherit; cursor: pointer; font-size: inherit; padding: 0; }
  .status-select { border: 1px solid var(--line,#444); border-radius: 4px; background: var(--bg-2,#1a1a1a); color: var(--text-light,#f0f0f0); font-size: 0.8rem; padding: 0.2rem 0.4rem; cursor: pointer; }
  .badge { font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; }
  .badge-active, .status-select.badge-active { color: #60a5fa; }
  .badge-paused, .status-select.badge-paused { color: #f59e0b; }
  .badge-completed, .status-select.badge-completed { color: #4ade80; }
  .badge-abandoned, .status-select.badge-abandoned { color: #94a3b8; }
  .archived-row { opacity: 0.5; }
  .actions { display: flex; gap: 0.4rem; align-items: center; }
  .btn-sm { padding: 0.3rem 0.7rem; border: 1px solid var(--line,#444); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted,#888); text-decoration: none; background: none; cursor: pointer; }
  .btn-danger { border-color: #ef4444; color: #ef4444; }
  .pagination { display: flex; gap: 0.4rem; margin-top: 1rem; justify-content: center; }
  .page-btn { padding: 0.3rem 0.6rem; border: 1px solid var(--line,#444); border-radius: 4px; background: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.82rem; }
  .page-btn.active { border-color: var(--gold,#c9a55c); color: var(--gold,#c9a55c); }
  .loading, .empty { text-align: center; color: var(--text-muted,#888); padding: 2rem; }
</style>
```

- [x] **Schritt 2: Commit**

```bash
git add website/src/components/admin/coaching/SessionsOverview.svelte
git commit -m "feat(ui): SessionsOverview — suche, sortierung, status-dropdown, archiv"
```

---

## Task 11: sessions/index.astro aktualisieren

**Files:**
- Modify: `website/src/pages/admin/coaching/sessions/index.astro`

- [x] **Schritt 1: index.astro ersetzen**

```astro
---
import AdminLayout from '../../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../../lib/auth';
import { listSessions } from '../../../../lib/coaching-session-db';
import { pool } from '../../../../lib/website-db';
import SessionsOverview from '../../../../components/admin/coaching/SessionsOverview.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const brand = process.env.BRAND || 'mentolder';
let initialResult = { sessions: [], total: 0, page: 1, pageSize: 20 };
try {
  initialResult = await listSessions(pool, brand, { page: 1, pageSize: 20 });
} catch { /* coaching schema may not exist yet */ }
---

<AdminLayout title="Coaching-Sessions">
  <div style="padding: 1rem 0;">
    <nav style="font-size:0.78rem;color:var(--text-muted,#888);margin-bottom:0.4rem;padding:0 1.5rem;">
      <a href="/admin" style="color:var(--text-muted,#888);text-decoration:none;">Admin</a>
      <span style="margin:0 0.4rem;">›</span>
      Sessions
    </nav>
    <h1 style="font-size:1.8rem;font-weight:700;color:var(--text-light,#f0f0f0);margin:0 0 1.5rem;padding:0 1.5rem;">Coaching-Sessions</h1>
    <SessionsOverview client:load {initialResult} />
  </div>
</AdminLayout>
```

- [x] **Schritt 2: Commit**

```bash
git add website/src/pages/admin/coaching/sessions/index.astro
git commit -m "feat(ui): sessions/index.astro auf SessionsOverview umstellen"
```

---

## Task 12: Session-Detail — client_name + Audit-Log

**Files:**
- Modify: `website/src/pages/admin/coaching/sessions/[id].astro`

- [x] **Schritt 1: Audit-Log-Import und Datenladen hinzufügen**

Ergänze im Frontmatter (nach `import { pool }...`):

```typescript
import { getAuditLog } from '../../../../lib/coaching-session-db';
// ...
let auditLog: Awaited<ReturnType<typeof getAuditLog>> = [];
try { auditLog = await getAuditLog(pool, sessionId); } catch {}
```

(Variablenname `sessionId` — nutze `id` aus `Astro.params` wie zuvor.)

- [x] **Schritt 2: client_name-Feld im PATCH-Handler ergänzen**

Im `POST`-Handler nach `customerName` und `customerEmail`:

```typescript
if (action === 'update-meta') {
  const clientName = form.get('clientName')?.toString().trim() ?? '';
  const title = form.get('title')?.toString().trim() ?? '';
  // PATCH /api/admin/coaching/sessions/[id]
  const res = await fetch(
    `${Astro.url.origin}/api/admin/coaching/sessions/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: Astro.request.headers.get('cookie') ?? '' },
      body: JSON.stringify({ clientName, title }),
    }
  );
  if (res.ok) saveOk = true; else saveError = 'Fehler beim Speichern';
}
```

- [x] **Schritt 3: Formular für client_name + Audit-Log-Sektion hinzufügen**

Füge am Ende des `<div class="grid ...">` folgende Sektionen hinzu:

```astro
<!-- Klient-Name direkt editierbar -->
<div class="bg-dark-light rounded-xl p-5 border border-dark-lighter">
  <h2 class="text-sm font-semibold text-light mb-4">Klient bearbeiten</h2>
  <form method="POST" class="space-y-3">
    <input type="hidden" name="_action" value="update-meta" />
    <div>
      <label class="block text-xs text-muted mb-1">Klienten-Name</label>
      <input
        type="text" name="clientName"
        value={session.clientName ?? ''}
        class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
      />
    </div>
    <button type="submit" class="w-full py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors">
      Speichern
    </button>
  </form>
</div>

<!-- Audit-Log -->
{auditLog.length > 0 && (
  <div class="lg:col-span-3 bg-dark-light rounded-xl p-5 border border-dark-lighter">
    <h2 class="text-sm font-semibold text-light mb-4">Verlaufsprotokoll</h2>
    <ul class="space-y-2 text-sm">
      {auditLog.map(e => (
        <li class="flex items-start gap-3 text-muted">
          <span class="shrink-0 mt-0.5">
            {e.eventType === 'status_change' ? '🔄' :
             e.eventType === 'field_change'  ? '✏️' :
             e.eventType === 'ai_request'    ? '🤖' : '📝'}
          </span>
          <div class="flex-1 min-w-0">
            <span class="text-light">
              {e.eventType === 'status_change' && `Status: ${(e.payload as any).from ?? ''} → ${(e.payload as any).to ?? (e.payload as any).action ?? ''}`}
              {e.eventType === 'field_change'  && `Feld ${(e.payload as any).field}: "${(e.payload as any).from}" → "${(e.payload as any).to}"`}
              {e.eventType === 'ai_request'    && `KI-Anfrage Schritt ${e.stepNumber} (${(e.payload as any).provider}, ${(e.payload as any).duration_ms}ms)`}
              {e.eventType === 'notes_change'  && `Notiz Schritt ${e.stepNumber} geändert`}
            </span>
            <span class="ml-2 text-xs">{new Date(e.changedAt).toLocaleString('de-DE')} · {e.actor}</span>
          </div>
        </li>
      ))}
    </ul>
  </div>
)}
```

- [x] **Schritt 4: Commit**

```bash
git add website/src/pages/admin/coaching/sessions/[id].astro
git commit -m "feat(ui): session-detail — client_name edit + audit-log timeline"
```

---

## Task 13: CoachingSettings.svelte + settings.astro

**Files:**
- Create: `website/src/components/admin/coaching/CoachingSettings.svelte`
- Create: `website/src/pages/admin/coaching/settings.astro`

- [x] **Schritt 1: CoachingSettings.svelte erstellen**

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

  const ENV_KEY_MAP: Record<string, string> = {
    claude:  'ANTHROPIC_API_KEY',
    openai:  'OPENAI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    lumo:    'LUMO_API_KEY',
  };

  async function activateProvider(provider: string) {
    savingProvider = provider;
    await fetch('/api/admin/coaching/ki-config/active', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    const res = await fetch('/api/admin/coaching/ki-config');
    const data = await res.json();
    providers = data.providers;
    savingProvider = null;
  }

  function startEdit(t: StepTemplate) {
    editingTemplate = t;
    editFields = {
      stepName: t.stepName,
      systemPrompt: t.systemPrompt,
      userPromptTpl: t.userPromptTpl,
      keywords: t.keywords.join(', '),
    };
  }

  async function saveTemplate() {
    if (!editingTemplate) return;
    await fetch(`/api/admin/coaching/step-templates/${editingTemplate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stepNumber: editingTemplate.stepNumber,
        stepName: editFields.stepName,
        phase: editingTemplate.phase,
        systemPrompt: editFields.systemPrompt,
        userPromptTpl: editFields.userPromptTpl,
        inputSchema: editingTemplate.inputSchema,
        keywords: editFields.keywords.split(',').map(s => s.trim()).filter(Boolean),
        isActive: true,
        sortOrder: editingTemplate.sortOrder,
      }),
    });
    const res = await fetch('/api/admin/coaching/step-templates');
    const data = await res.json();
    templates = data.templates;
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

<div class="settings">
  <!-- Tabs -->
  <div class="tabs">
    <button class="tab {activeTab === 'ki' ? 'active' : ''}" onclick={() => activeTab = 'ki'}>KI-Provider</button>
    <button class="tab {activeTab === 'templates' ? 'active' : ''}" onclick={() => activeTab = 'templates'}>Prompt-Templates</button>
  </div>

  {#if activeTab === 'ki'}
    <div class="ki-grid">
      {#each providers as p}
        <div class="provider-card {p.isActive ? 'active' : ''}">
          <div class="provider-name">{p.displayName}</div>
          <div class="provider-model">{p.modelName ?? 'kein Modell'}</div>
          <div class="provider-key">
            {ENV_KEY_MAP[p.provider] ? `${ENV_KEY_MAP[p.provider]}` : '—'}
          </div>
          {#if p.isActive}
            <span class="active-badge">● Aktiv</span>
          {:else}
            <button
              class="btn-activate"
              onclick={() => activateProvider(p.provider)}
              disabled={savingProvider === p.provider}
            >
              {savingProvider === p.provider ? '…' : 'Aktivieren'}
            </button>
          {/if}
        </div>
      {/each}
    </div>

  {:else}
    <div class="templates-list">
      {#if editingTemplate}
        <div class="edit-modal">
          <h3>Schritt {editingTemplate.stepNumber}: bearbeiten</h3>
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
  .settings { max-width: 900px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--line,#333); }
  .tab { padding: 0.5rem 1rem; background: none; border: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.9rem; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab.active { color: var(--gold,#c9a55c); border-bottom-color: var(--gold,#c9a55c); }
  .ki-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
  .provider-card { padding: 1.2rem; border: 1px solid var(--line,#333); border-radius: 8px; background: var(--bg-2,#1a1a1a); display: flex; flex-direction: column; gap: 0.4rem; }
  .provider-card.active { border-color: var(--gold,#c9a55c); }
  .provider-name { font-weight: 700; color: var(--text-light,#f0f0f0); }
  .provider-model { font-size: 0.78rem; color: var(--text-muted,#888); }
  .provider-key { font-size: 0.72rem; color: var(--text-muted,#666); font-family: monospace; }
  .active-badge { color: var(--gold,#c9a55c); font-size: 0.82rem; font-weight: 600; }
  .btn-activate { margin-top: 0.4rem; padding: 0.4rem 0.8rem; background: var(--gold,#c9a55c); color: #111; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.82rem; }
  .btn-activate:disabled { opacity: 0.5; cursor: not-allowed; }
  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line,#333); font-size: 0.82rem; color: var(--text-muted,#888); }
  .table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line,#222); font-size: 0.88rem; }
  .btn-sm { padding: 0.3rem 0.7rem; border: 1px solid var(--line,#444); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted,#888); background: none; cursor: pointer; }
  .btn-danger { border-color: #ef4444; color: #ef4444; }
  .btn-primary { padding: 0.5rem 1.2rem; background: var(--gold,#c9a55c); color: #111; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.85rem; }
  .edit-modal { background: var(--bg-2,#1a1a1a); border: 1px solid var(--gold,#c9a55c); border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
  .edit-modal label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; color: var(--text-muted,#888); }
  .edit-modal input, .edit-modal textarea { padding: 0.5rem 0.75rem; background: var(--bg-dark,#111); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.88rem; outline: none; resize: vertical; }
  .edit-actions { display: flex; gap: 0.5rem; }
</style>
```

- [x] **Schritt 2: settings.astro erstellen**

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../lib/auth';
import { listKiProviders } from '../../../lib/coaching-ki-config-db';
import { listStepTemplates } from '../../../lib/coaching-templates-db';
import { pool } from '../../../lib/website-db';
import CoachingSettings from '../../../components/admin/coaching/CoachingSettings.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const brand = process.env.BRAND || 'mentolder';
let initialProviders = [];
let initialTemplates = [];
try {
  initialProviders = await listKiProviders(pool, brand);
  initialTemplates = await listStepTemplates(pool, brand);
} catch {}
---

<AdminLayout title="Coaching-Einstellungen">
  <div style="padding: 1rem 0;">
    <nav style="font-size:0.78rem;color:var(--text-muted,#888);margin-bottom:0.4rem;padding:0 1.5rem;">
      <a href="/admin" style="color:var(--text-muted,#888);text-decoration:none;">Admin</a>
      <span style="margin:0 0.4rem;">›</span>
      <a href="/admin/coaching/sessions" style="color:var(--text-muted,#888);text-decoration:none;">Coaching</a>
      <span style="margin:0 0.4rem;">›</span>
      Einstellungen
    </nav>
    <h1 style="font-size:1.8rem;font-weight:700;color:var(--text-light,#f0f0f0);margin:0 0 1.5rem;padding:0 1.5rem;">Coaching-Einstellungen</h1>
    <CoachingSettings client:load {initialProviders} {initialTemplates} />
  </div>
</AdminLayout>
```

- [x] **Schritt 3: Link in sessions/index.astro hinzufügen**

In `SessionsOverview.svelte` ergänze nach dem "+ Neue Session"-Button:

```svelte
<a href="/admin/coaching/settings" class="btn-sm">⚙ Einstellungen</a>
```

- [x] **Schritt 4: Alle Tests ausführen**

```bash
cd website && npx vitest run
```

Erwartet: alle Tests grün

- [x] **Schritt 5: Manifest validieren**

```bash
task workspace:validate
```

- [x] **Schritt 6: Commit**

```bash
git add website/src/components/admin/coaching/CoachingSettings.svelte \
        website/src/pages/admin/coaching/settings.astro \
        website/src/components/admin/coaching/SessionsOverview.svelte
git commit -m "feat(ui): CoachingSettings — KI-provider auswahl + prompt-template editor"
```

---

## Self-Review

**Spec-Abdeckung:**
- ✅ Status-Schalter (pause, abgeschlossen) per Dropdown in Übersicht → Task 10
- ✅ Archiv per Soft-Delete (archived_at) mit Toggle → Tasks 1, 6, 10
- ✅ Suche + Sortierung server-seitig → Tasks 2, 5, 10
- ✅ Session abschließen → bestehendes `completeSession` + neuer Status-Dropdown
- ✅ Klientenzuordnung (client_name) editierbar → Tasks 1, 2, 12
- ✅ Audit-Trail (alle 4 Event-Typen) → Tasks 2, 6, 9, 12
- ✅ KI-Provider-Auswahl (Claude/OpenAI/Mistral/Lumo) → Tasks 3, 7, 9, 13
- ✅ Prompt-Templates in DB + editierbar → Tasks 4, 8, 13
- ✅ completed → active blockiert → Task 2 (`updateSessionStatus`)

**Typ-Konsistenz:**
- `listSessions` gibt `ListSessionsResult` zurück (Tasks 2, 5, 10, 11) ✅
- `appendAuditLog` nimmt `Omit<AuditEntry, 'id' | 'changedAt'>` (Tasks 2, 9) ✅
- `buildPromptFromTemplate` in `coaching-templates-db.ts` wird in `generate.ts` importiert ✅
- `getActiveProvider` kommt aus `coaching-ki-config-db.ts`, nicht aus session-db ✅
