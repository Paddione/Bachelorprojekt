---
ticket_id: T000429
title: KI-Coaching Session v2 — Implementierungsplan
domains: []
status: active
pr_number: null
---

# KI-Coaching Session v2 — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coaching-Projektverwaltung pro Klient mit Kundennummer als anonymisierter KI-Kennung, mehrere Sessions pro Projekt, und korrekte Session-Übersicht.

**Architecture:** Neue Tabelle `coaching.projects` (1:1 pro Klient+Brand) mit `customer_number` als KI-Bezeichner. `coaching.sessions` bekommt eine `project_id`-FK. `listSessions` JOINt Projekte für `customer_number`. `generate.ts` injiziert `ki_context` + Kundennummer in KI-Prompts. Neue Admin-Seiten `/admin/coaching/projekte/`.

**Tech Stack:** PostgreSQL, TypeScript, Vitest + pg-mem (Tests), Astro (Seiten), Svelte 5 (Komponenten), Anthropic SDK (bereits vorhanden).

**Spec:** `docs/superpowers/specs/20260517-ki-coaching-session-v2-design.md`

---

## Datei-Map

| Datei | Aktion | Zweck |
|-------|--------|-------|
| `scripts/one-shot/20260517-coaching-projects.sql` | Neu | DB-Migration |
| `website/src/lib/coaching-project-db.ts` | Neu | Projekt-DB-Funktionen |
| `website/src/lib/coaching-project-db.test.ts` | Neu | Tests für coaching-project-db |
| `website/src/lib/coaching-session-db.ts` | Ändern | Session-Interface + JOIN + createSession |
| `website/src/lib/coaching-session-db.test.ts` | Ändern | Schema-Update + neue Testfelder |
| `website/src/pages/api/admin/coaching/sessions/index.ts` | Ändern | POST auto-erstellt Projekt |
| `website/src/pages/api/admin/coaching/projects/index.ts` | Neu | GET/POST Projektliste |
| `website/src/pages/api/admin/coaching/projects/[id].ts` | Neu | GET/PATCH Projektdetail |
| `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` | Ändern | KI-Anonymisierung |
| `website/src/components/admin/coaching/SessionsOverview.svelte` | Ändern | Name + Kundennummer anzeigen |
| `website/src/components/admin/coaching/ProjectsOverview.svelte` | Neu | Projektliste-Komponente |
| `website/src/components/admin/coaching/ProjectDetail.svelte` | Neu | Projektdetail-Komponente |
| `website/src/pages/admin/coaching/projekte/index.astro` | Neu | Projektliste-Seite |
| `website/src/pages/admin/coaching/projekte/[id].astro` | Neu | Projektdetail-Seite |
| `website/src/layouts/AdminLayout.astro` | Ändern | Nav-Eintrag "Projekte" |

---

## Task 1: DB-Migration

**Files:**
- Create: `scripts/one-shot/20260517-coaching-projects.sql`

- [ ] **Schritt 1: SQL-Datei anlegen**

```sql
-- scripts/one-shot/20260517-coaching-projects.sql

-- 1) Projekttabelle
CREATE TABLE IF NOT EXISTS coaching.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           TEXT NOT NULL,
  client_id       UUID REFERENCES customers(id),
  customer_number TEXT NOT NULL,
  display_alias   TEXT,
  ki_context      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coaching_projects_brand_client_idx
  ON coaching.projects (brand, client_id);

-- 2) Neue Spalte in sessions
ALTER TABLE coaching.sessions
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES coaching.projects(id);

-- 3) Backfill: Projekte für bestehende Sessions mit client_id anlegen
INSERT INTO coaching.projects (brand, client_id, customer_number)
SELECT DISTINCT s.brand, s.client_id,
  COALESCE(c.customer_number, s.client_id::text)
FROM coaching.sessions s
JOIN customers c ON c.id = s.client_id
WHERE s.client_id IS NOT NULL
ON CONFLICT (brand, client_id) DO NOTHING;

-- 4) Bestehende Sessions mit project_id verknüpfen
UPDATE coaching.sessions s
SET project_id = p.id
FROM coaching.projects p
WHERE s.client_id = p.client_id
  AND s.brand = p.brand
  AND s.project_id IS NULL;
```

- [ ] **Schritt 2: Migration auf dev-DB anwenden**

```bash
task workspace:psql ENV=dev -- website < scripts/one-shot/20260517-coaching-projects.sql
```

Erwartete Ausgabe: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `INSERT 0 N`, `UPDATE N` (keine ERROR-Zeilen).

- [ ] **Schritt 3: Verifikation**

```bash
task workspace:psql ENV=dev -- website -c "\d coaching.projects"
task workspace:psql ENV=dev -- website -c "SELECT COUNT(*) FROM coaching.projects"
task workspace:psql ENV=dev -- website -c "\d coaching.sessions" | grep project_id
```

- [ ] **Schritt 4: Commit**

```bash
git add scripts/one-shot/20260517-coaching-projects.sql
git commit -m "chore(db): coaching.projects Tabelle + project_id in sessions"
```

---

## Task 2: `coaching-project-db.ts` — neue Lib

**Files:**
- Create: `website/src/lib/coaching-project-db.ts`

- [ ] **Schritt 1: Datei anlegen**

```typescript
// website/src/lib/coaching-project-db.ts
import type { Pool } from 'pg';

export interface CoachingProject {
  id: string;
  brand: string;
  clientId: string | null;
  customerNumber: string;
  displayAlias: string | null;
  kiContext: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  sessionCount?: number;
  lastSessionAt?: Date | null;
}

export interface ListProjectsOpts {
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ListProjectsResult {
  projects: CoachingProject[];
  total: number;
  page: number;
  pageSize: number;
}

function rowToProject(row: Record<string, unknown>): CoachingProject {
  return {
    id: row.id as string,
    brand: row.brand as string,
    clientId: (row.client_id as string | null) ?? null,
    customerNumber: row.customer_number as string,
    displayAlias: (row.display_alias as string | null) ?? null,
    kiContext: (row.ki_context as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    sessionCount: row.session_count != null ? Number(row.session_count) : undefined,
    lastSessionAt: (row.last_session_at as Date | null) ?? null,
  };
}

export async function findOrCreateProject(
  pool: Pool,
  brand: string,
  clientId: string,
): Promise<CoachingProject> {
  const existing = await pool.query(
    `SELECT * FROM coaching.projects WHERE brand = $1 AND client_id = $2`,
    [brand, clientId],
  );
  if (existing.rows[0]) return rowToProject(existing.rows[0]);

  const customer = await pool.query(
    `SELECT customer_number FROM customers WHERE id = $1`,
    [clientId],
  );
  const customerNumber = (customer.rows[0]?.customer_number as string | null) ?? clientId;

  const r = await pool.query(
    `INSERT INTO coaching.projects (brand, client_id, customer_number)
     VALUES ($1, $2, $3)
     ON CONFLICT (brand, client_id) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [brand, clientId, customerNumber],
  );
  return rowToProject(r.rows[0]);
}

export async function getProject(pool: Pool, id: string): Promise<CoachingProject | null> {
  const r = await pool.query(
    `SELECT p.*,
       COUNT(s.id)::int AS session_count,
       MAX(s.created_at) AS last_session_at
     FROM coaching.projects p
     LEFT JOIN coaching.sessions s ON s.project_id = p.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [id],
  );
  return r.rows[0] ? rowToProject(r.rows[0]) : null;
}

export async function listProjects(
  pool: Pool,
  brand: string,
  opts: ListProjectsOpts = {},
): Promise<ListProjectsResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const params: unknown[] = [brand];
  const whereParts = [`p.brand = $1`];
  let p = 2;

  if (opts.q) {
    const pattern = `%${opts.q.replace(/[%_\\]/g, c => `\\${c}`)}%`;
    whereParts.push(`(p.customer_number ILIKE $${p} ESCAPE '\\\\' OR p.display_alias ILIKE $${p} ESCAPE '\\\\')`);
    params.push(pattern);
    p++;
  }

  const where = whereParts.join(' AND ');

  const countR = await pool.query(
    `SELECT COUNT(*)::int AS total FROM coaching.projects p WHERE ${where}`,
    params,
  );
  const total = Number(countR.rows[0]?.total ?? 0);

  const dataParams = [...params, pageSize, offset];
  const r = await pool.query(
    `SELECT p.*,
       COUNT(s.id)::int AS session_count,
       MAX(s.created_at) AS last_session_at
     FROM coaching.projects p
     LEFT JOIN coaching.sessions s ON s.project_id = p.id
     WHERE ${where}
     GROUP BY p.id
     ORDER BY MAX(s.created_at) DESC NULLS LAST, p.created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    dataParams,
  );

  return { projects: r.rows.map(rowToProject), total, page, pageSize };
}

export async function updateProject(
  pool: Pool,
  id: string,
  fields: Partial<{ kiContext: string | null; notes: string | null; displayAlias: string | null }>,
): Promise<CoachingProject | null> {
  const sets: string[] = [`updated_at = now()`];
  const vals: unknown[] = [];
  let i = 1;

  if ('kiContext' in fields) { sets.push(`ki_context = $${i++}`); vals.push(fields.kiContext); }
  if ('notes' in fields)     { sets.push(`notes = $${i++}`);      vals.push(fields.notes); }
  if ('displayAlias' in fields) { sets.push(`display_alias = $${i++}`); vals.push(fields.displayAlias); }

  vals.push(id);
  const r = await pool.query(
    `UPDATE coaching.projects SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return r.rows[0] ? rowToProject(r.rows[0]) : null;
}
```

- [ ] **Schritt 2: TypeScript-Check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep coaching-project
```

Erwartete Ausgabe: leer (keine Fehler).

---

## Task 3: `coaching-project-db.test.ts` — Tests

**Files:**
- Create: `website/src/lib/coaching-project-db.test.ts`

- [ ] **Schritt 1: Testdatei anlegen**

```typescript
// website/src/lib/coaching-project-db.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  findOrCreateProject,
  getProject,
  listProjects,
  updateProject,
} from './coaching-project-db';

let pool: Pool;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    CREATE TABLE customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT,
      customer_number TEXT
    );
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.projects (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand           TEXT NOT NULL,
      client_id       UUID REFERENCES customers(id),
      customer_number TEXT NOT NULL,
      display_alias   TEXT,
      ki_context      TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX coaching_projects_brand_client_idx
      ON coaching.projects (brand, client_id);
    CREATE TABLE coaching.sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand TEXT NOT NULL DEFAULT 'mentolder',
      client_id UUID,
      project_id UUID REFERENCES coaching.projects(id),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      mode TEXT NOT NULL DEFAULT 'live',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      archived_at TIMESTAMPTZ
    );
  `);
  const { Pool: PgMemPool } = db.adapters.createPg();
  pool = new PgMemPool() as unknown as Pool;
});

describe('findOrCreateProject', () => {
  it('legt Projekt an wenn keins existiert', async () => {
    const clientR = await pool.query(
      `INSERT INTO customers (name, customer_number) VALUES ('Müller GmbH', 'K-0001') RETURNING id`,
    );
    const clientId = clientR.rows[0].id as string;
    const p = await findOrCreateProject(pool, 'mentolder', clientId);
    expect(p.id).toMatch(UUID_REGEX);
    expect(p.customerNumber).toBe('K-0001');
    expect(p.clientId).toBe(clientId);
    expect(p.brand).toBe('mentolder');
  });

  it('gibt bestehendes Projekt zurück beim zweiten Aufruf', async () => {
    const clientR = await pool.query(
      `INSERT INTO customers (name, customer_number) VALUES ('Meier AG', 'K-0002') RETURNING id`,
    );
    const clientId = clientR.rows[0].id as string;
    const p1 = await findOrCreateProject(pool, 'mentolder', clientId);
    const p2 = await findOrCreateProject(pool, 'mentolder', clientId);
    expect(p1.id).toBe(p2.id);
  });

  it('fällt auf client_id zurück wenn customer_number fehlt', async () => {
    const clientR = await pool.query(
      `INSERT INTO customers (name) VALUES ('Ohne Nummer') RETURNING id`,
    );
    const clientId = clientR.rows[0].id as string;
    const p = await findOrCreateProject(pool, 'mentolder', clientId);
    expect(p.customerNumber).toBe(clientId);
  });
});

describe('getProject', () => {
  it('gibt null zurück für unbekannte ID', async () => {
    const r = await getProject(pool, '00000000-0000-4000-8000-000000000000');
    expect(r).toBeNull();
  });

  it('gibt Projekt mit session_count zurück', async () => {
    const clientR = await pool.query(
      `INSERT INTO customers (name, customer_number) VALUES ('Schmidt', 'K-0010') RETURNING id`,
    );
    const clientId = clientR.rows[0].id as string;
    const proj = await findOrCreateProject(pool, 'mentolder', clientId);
    await pool.query(
      `INSERT INTO coaching.sessions (brand, client_id, project_id, title, created_by)
       VALUES ('mentolder', $1, $2, 'Session A', 'coach')`,
      [clientId, proj.id],
    );
    const r = await getProject(pool, proj.id);
    expect(r).not.toBeNull();
    expect(r!.sessionCount).toBe(1);
  });
});

describe('listProjects', () => {
  it('gibt ListProjectsResult zurück', async () => {
    const r = await listProjects(pool, 'mentolder');
    expect(r).toHaveProperty('projects');
    expect(r).toHaveProperty('total');
    expect(r).toHaveProperty('page');
    expect(r).toHaveProperty('pageSize');
    expect(Array.isArray(r.projects)).toBe(true);
  });
});

describe('updateProject', () => {
  it('aktualisiert ki_context und notes', async () => {
    const clientR = await pool.query(
      `INSERT INTO customers (name, customer_number) VALUES ('Update-Test', 'K-0020') RETURNING id`,
    );
    const clientId = clientR.rows[0].id as string;
    const proj = await findOrCreateProject(pool, 'mentolder', clientId);
    const updated = await updateProject(pool, proj.id, {
      kiContext: 'Klient K-0020 befindet sich in Phase 2.',
      notes: 'Interne Notiz',
    });
    expect(updated?.kiContext).toBe('Klient K-0020 befindet sich in Phase 2.');
    expect(updated?.notes).toBe('Interne Notiz');
  });

  it('gibt null zurück für unbekannte ID', async () => {
    const r = await updateProject(pool, '00000000-0000-4000-8000-000000000000', { notes: 'x' });
    expect(r).toBeNull();
  });
});
```

- [ ] **Schritt 2: Tests laufen lassen (müssen grün sein)**

```bash
cd website && npx vitest run src/lib/coaching-project-db.test.ts
```

Erwartete Ausgabe: `✓ 7 tests passed`

- [ ] **Schritt 3: Commit**

```bash
git add website/src/lib/coaching-project-db.ts website/src/lib/coaching-project-db.test.ts
git commit -m "feat(coaching): coaching-project-db Lib + Tests"
```

---

## Task 4: `coaching-session-db.ts` aktualisieren

**Files:**
- Modify: `website/src/lib/coaching-session-db.ts`

- [ ] **Schritt 1: `Session`-Interface erweitern**

In `website/src/lib/coaching-session-db.ts`, das `Session`-Interface von:
```typescript
export interface Session {
  id: string;
  brand: string;
  clientId: string | null;
  clientName: string | null;
  kiConfigId: number | null;
  mode: 'live' | 'prep';
  title: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  archivedAt: Date | null;
  steps: SessionStep[];
}
```

zu:
```typescript
export interface Session {
  id: string;
  brand: string;
  clientId: string | null;
  clientName: string | null;
  customerNumber: string | null;
  projectId: string | null;
  kiConfigId: number | null;
  mode: 'live' | 'prep';
  title: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  archivedAt: Date | null;
  steps: SessionStep[];
}
```

- [ ] **Schritt 2: `CreateSessionArgs` erweitern**

```typescript
export interface CreateSessionArgs {
  brand: string;
  clientId?: string | null;
  clientName?: string | null;
  projectId?: string | null;
  kiConfigId?: number | null;
  mode: 'live' | 'prep';
  title: string;
  createdBy: string;
}
```

- [ ] **Schritt 3: `rowToSession` erweitern**

```typescript
function rowToSession(row: Record<string, unknown>, steps: SessionStep[] = []): Session {
  return {
    id: row.id as string,
    brand: row.brand as string,
    clientId: (row.client_id as string | null) ?? null,
    clientName: (row.client_name as string | null) ?? null,
    customerNumber: (row.project_customer_number as string | null) ?? null,
    projectId: (row.project_id as string | null) ?? null,
    kiConfigId: (row.ki_config_id as number | null) ?? null,
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

- [ ] **Schritt 4: `createSession` aktualisieren**

```typescript
export async function createSession(pool: Pool, args: CreateSessionArgs): Promise<Session> {
  const r = await pool.query(
    `INSERT INTO coaching.sessions
       (brand, client_id, client_name, project_id, ki_config_id, mode, title, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      args.brand, args.clientId ?? null, args.clientName ?? null,
      args.projectId ?? null, args.kiConfigId ?? null,
      args.mode, args.title, args.createdBy,
    ],
  );
  return rowToSession(r.rows[0]);
}
```

- [ ] **Schritt 5: `listSessions` — JOIN auf coaching.projects**

Den Data-Query in `listSessions` von:
```typescript
  const r = await pool.query(
    `SELECT s.*
     FROM coaching.sessions s
     WHERE ${whereClause}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    dataParams,
  );
```

zu:
```typescript
  const r = await pool.query(
    `SELECT s.*, p.customer_number AS project_customer_number
     FROM coaching.sessions s
     LEFT JOIN coaching.projects p ON p.id = s.project_id
     WHERE ${whereClause}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    dataParams,
  );
```

- [ ] **Schritt 6: TypeScript-Check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -E "coaching-session|coaching-project"
```

Erwartete Ausgabe: leer (keine Fehler).

---

## Task 5: `coaching-session-db.test.ts` — Schema + Tests aktualisieren

**Files:**
- Modify: `website/src/lib/coaching-session-db.test.ts`

- [ ] **Schritt 1: Schema in `beforeAll` erweitern**

Das `db.public.none(...)` in `beforeAll` erweitern — die `coaching.sessions`-Tabelle bekommt neue Spalten und es kommen zwei neue Tabellen hinzu:

```typescript
  db.public.none(`
    CREATE TABLE customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      customer_number TEXT
    );
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.projects (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand           TEXT NOT NULL,
      client_id       UUID REFERENCES customers(id),
      customer_number TEXT NOT NULL,
      display_alias   TEXT,
      ki_context      TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX coaching_projects_brand_client_idx
      ON coaching.projects (brand, client_id);
    CREATE TABLE coaching.sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand TEXT NOT NULL DEFAULT 'mentolder',
      client_id UUID,
      client_name TEXT,
      project_id UUID REFERENCES coaching.projects(id),
      ki_config_id INT,
      mode TEXT NOT NULL DEFAULT 'live',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned')),
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ
    );
    CREATE TABLE coaching.session_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES coaching.sessions(id) ON DELETE CASCADE,
      step_number INT NOT NULL,
      step_name TEXT NOT NULL,
      phase TEXT NOT NULL,
      coach_inputs JSONB NOT NULL DEFAULT '{}',
      ai_prompt TEXT,
      ai_response TEXT,
      coach_notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      generated_at TIMESTAMPTZ,
      UNIQUE (session_id, step_number)
    );
    CREATE TABLE coaching.session_audit_log (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id  UUID NOT NULL REFERENCES coaching.sessions(id) ON DELETE CASCADE,
      event_type  TEXT NOT NULL,
      actor       TEXT NOT NULL,
      step_number INT,
      payload     JSONB NOT NULL DEFAULT '{}',
      changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
```

- [ ] **Schritt 2: Test für `customerNumber` + `projectId` ergänzen**

Am Ende der Datei, nach dem letzten `describe`-Block, einfügen:

```typescript
describe('Session mit project_id', () => {
  it('speichert und liest projectId + clientName', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Projekt-Test', createdBy: 'coach',
      mode: 'live', clientName: 'Müller, Max', projectId: null,
    });
    expect(s.clientName).toBe('Müller, Max');
    expect(s.projectId).toBeNull();
  });
});
```

- [ ] **Schritt 3: Tests laufen lassen**

```bash
cd website && npx vitest run src/lib/coaching-session-db.test.ts
```

Erwartete Ausgabe: alle bestehenden Tests + neuer Test grün.

- [ ] **Schritt 4: Commit**

```bash
git add website/src/lib/coaching-session-db.ts website/src/lib/coaching-session-db.test.ts
git commit -m "feat(coaching): Session-Interface + projectId/customerNumber + listSessions JOIN"
```

---

## Task 6: Session-POST auto-erstellt Projekt

**Files:**
- Modify: `website/src/pages/api/admin/coaching/sessions/index.ts`

- [ ] **Schritt 1: Import ergänzen**

```typescript
import { findOrCreateProject } from '../../../../../lib/coaching-project-db';
```

- [ ] **Schritt 2: POST-Handler aktualisieren**

Den POST-Handler in `sessions/index.ts` ersetzen — nach `if (!body.title?.trim())` und vor dem `createSession`-Aufruf:

```typescript
  // Klientenname nachschlagen (für client_name in Session)
  let clientName: string | null = null;
  if (body.clientId) {
    try {
      const cr = await pool.query(`SELECT name FROM customers WHERE id = $1`, [body.clientId]);
      clientName = (cr.rows[0]?.name as string | null) ?? null;
    } catch { /* ignore */ }
  }

  // Projekt auto-anlegen oder finden
  let projectId: string | null = null;
  if (body.clientId) {
    try {
      const project = await findOrCreateProject(pool, brand, body.clientId);
      projectId = project.id;
    } catch { /* ignore: projekt-fehler blockieren keine Session */ }
  }

  const created = await createSession(pool, {
    brand, title: body.title, createdBy: session.preferred_username,
    clientId: body.clientId ?? null, clientName, projectId,
    kiConfigId: body.kiConfigId ?? null, mode: body.mode ?? 'live',
  });
```

- [ ] **Schritt 3: TypeScript-Check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "sessions/index"
```

Erwartete Ausgabe: leer.

- [ ] **Schritt 4: Commit**

```bash
git add website/src/pages/api/admin/coaching/sessions/index.ts
git commit -m "feat(coaching): Session-POST legt Projekt automatisch an"
```

---

## Task 7: Projekt-API — zwei neue Endpunkte

**Files:**
- Create: `website/src/pages/api/admin/coaching/projects/index.ts`
- Create: `website/src/pages/api/admin/coaching/projects/[id].ts`

- [ ] **Schritt 1: `projects/index.ts` anlegen**

```typescript
// website/src/pages/api/admin/coaching/projects/index.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listProjects } from '../../../../../lib/coaching-project-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const brand = process.env.BRAND || 'mentolder';
  const q = url.searchParams.get('q') ?? undefined;
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);

  const result = await listProjects(pool, brand, { q, page, pageSize });
  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 2: `projects/[id].ts` anlegen**

```typescript
// website/src/pages/api/admin/coaching/projects/[id].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getProject, updateProject } from '../../../../../lib/coaching-project-db';
import { listSessions } from '../../../../../lib/coaching-session-db';
import { pool } from '../../../../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = params.id as string;
  const brand = process.env.BRAND || 'mentolder';
  const project = await getProject(pool, id);
  if (!project) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });

  const sessionsResult = await listSessions(pool, brand, { pageSize: 100 });
  const sessions = sessionsResult.sessions.filter(s => s.projectId === id);

  return new Response(JSON.stringify({ project, sessions }), { headers: { 'content-type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = params.id as string;
  let body: { kiContext?: string | null; notes?: string | null; displayAlias?: string | null };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const updated = await updateProject(pool, id, {
    ...(body.kiContext !== undefined ? { kiContext: body.kiContext } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.displayAlias !== undefined ? { displayAlias: body.displayAlias } : {}),
  });
  if (!updated) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });

  return new Response(JSON.stringify({ project: updated }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Schritt 3: TypeScript-Check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "projects"
```

Erwartete Ausgabe: leer.

- [ ] **Schritt 4: Commit**

```bash
git add website/src/pages/api/admin/coaching/projects/
git commit -m "feat(coaching): Projekt-API GET/PATCH"
```

---

## Task 8: KI-Anonymisierung in `generate.ts`

**Files:**
- Modify: `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts`

- [ ] **Schritt 1: Import ergänzen**

```typescript
import { getProject } from '../../../../../../../../lib/coaching-project-db';
```

- [ ] **Schritt 2: Projekt laden und Kontext aufbauen**

Nach dem Block `const coachingSession = await getCoachingSession(pool, sessionId);` und vor `const providerName = ...` einfügen:

```typescript
  // Projekt-Kontext und Anonymisierung
  let customerNumber: string | null = null;
  let projectKiContext: string | null = null;
  if (coachingSession?.projectId) {
    try {
      const project = await getProject(pool, coachingSession.projectId);
      customerNumber = project?.customerNumber ?? null;
      projectKiContext = project?.kiContext ?? null;
    } catch { /* Projekt-Fehler blockieren keine KI-Anfrage */ }
  }
```

- [ ] **Schritt 3: System-Prompt und User-Prompt anonymisieren**

Den Block `const effectiveSystem = activeProvider?.systemPrompt || systemPrompt;` ersetzen durch:

```typescript
  let effectiveSystem = activeProvider?.systemPrompt || systemPrompt;
  if (customerNumber) {
    effectiveSystem = effectiveSystem.replace(/\{\{KLIENT_ID\}\}/g, customerNumber);
  }
  if (projectKiContext) {
    effectiveSystem = `${projectKiContext}\n\n${effectiveSystem}`;
  }

  const anonymizedUserPrompt = customerNumber
    ? `Klient ${customerNumber}:\n${userPrompt}`
    : userPrompt;
```

- [ ] **Schritt 4: Anonymisierten Prompt in KI-Calls verwenden**

In allen drei Provider-Blöcken (claude, openai, mistral) `userPrompt` durch `anonymizedUserPrompt` ersetzen:

Für Claude:
```typescript
        messages: [{ role: 'user', content: anonymizedUserPrompt }],
```

Für OpenAI:
```typescript
        messages: [{ role: 'system', content: effectiveSystem }, { role: 'user', content: anonymizedUserPrompt }],
```

Für Mistral:
```typescript
        messages: [{ role: 'system', content: effectiveSystem }, { role: 'user', content: anonymizedUserPrompt }],
```

- [ ] **Schritt 5: Auch `upsertStep` und AuditLog den anonymisierten Prompt übergeben**

Den `upsertStep`-Aufruf:
```typescript
  const step = await upsertStep(pool, {
    sessionId, stepNumber, stepName, phase,
    coachInputs: body.coachInputs, aiPrompt: anonymizedUserPrompt, aiResponse, status: 'generated',
  });
```

- [ ] **Schritt 6: TypeScript-Check**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "generate"
```

Erwartete Ausgabe: leer.

- [ ] **Schritt 7: Commit**

```bash
git add website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts
git commit -m "feat(coaching): KI-Anonymisierung via Kundennummer + ki_context"
```

---

## Task 9: `SessionsOverview.svelte` — Klientenname + Kundennummer

**Files:**
- Modify: `website/src/components/admin/coaching/SessionsOverview.svelte`

- [ ] **Schritt 1: `Session`-Import nutzt bereits aktualisierte Typen — prüfen**

Der Import `import type { Session, ListSessionsResult } from '../../../lib/coaching-session-db';` bleibt unverändert. `Session` hat jetzt `customerNumber`.

- [ ] **Schritt 2: Klient-Spalte in der Tabelle anpassen**

Zeile 166 (aktuell `{s.clientName ?? s.clientId ?? '—'}`) ersetzen durch:

```svelte
{#if s.clientName}
  {s.clientName}{#if s.customerNumber} <span class="customer-number">({s.customerNumber})</span>{/if}
{:else}
  —
{/if}
```

- [ ] **Schritt 3: CSS für Kundennummer ergänzen** (im `<style>`-Block am Ende der Datei):

```css
  .customer-number { font-size: 0.75rem; color: var(--text-muted,#888); }
```

- [ ] **Schritt 4: Commit**

```bash
git add website/src/components/admin/coaching/SessionsOverview.svelte
git commit -m "fix(coaching): Session-Übersicht zeigt Klientenname + Kundennummer"
```

---

## Task 10: `ProjectsOverview.svelte` — neue Komponente

**Files:**
- Create: `website/src/components/admin/coaching/ProjectsOverview.svelte`

- [ ] **Schritt 1: Datei anlegen**

```svelte
<script lang="ts">
  import type { CoachingProject, ListProjectsResult } from '../../../lib/coaching-project-db';

  let { initialResult }: { initialResult: ListProjectsResult } = $props();

  let projects = $state<CoachingProject[]>(initialResult.projects);
  let total = $state(initialResult.total);
  let page = $state(initialResult.page);
  const pageSize = initialResult.pageSize;
  let q = $state('');
  let loading = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  async function load(p = page) {
    loading = true;
    const params = new URLSearchParams({ q, page: String(p), pageSize: String(pageSize) });
    const res = await fetch(`/api/admin/coaching/projects?${params}`);
    const data: ListProjectsResult = await res.json();
    projects = data.projects;
    total = data.total;
    page = data.page;
    loading = false;
  }

  function onSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => load(1), 300);
  }

  function fmtDate(d: Date | string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const totalPages = $derived(Math.ceil(total / pageSize));
</script>

<div class="overview">
  <div class="toolbar">
    <input
      class="search-input"
      type="text"
      placeholder="Kundennummer oder Bezeichnung suchen…"
      bind:value={q}
      oninput={onSearch}
    />
    <a href="/admin/coaching/sessions/new" class="btn-primary">+ Neue Session</a>
  </div>

  {#if loading}
    <div class="loading">Laden…</div>
  {:else if projects.length === 0}
    <div class="empty">Keine Projekte gefunden.</div>
  {:else}
    <table class="table">
      <thead>
        <tr>
          <th>Kundennummer</th>
          <th>Bezeichnung</th>
          <th>Sessions</th>
          <th>Letzter Kontakt</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each projects as p (p.id)}
          <tr>
            <td><span class="kunden-nr">{p.customerNumber}</span></td>
            <td>{p.displayAlias ?? '—'}</td>
            <td>{p.sessionCount ?? 0}</td>
            <td>{fmtDate(p.lastSessionAt)}</td>
            <td class="actions">
              <a href={`/admin/coaching/projekte/${p.id}`} class="btn-sm">Öffnen</a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if totalPages > 1}
      <div class="pagination">
        {#each Array.from({length: totalPages}, (_, i) => i + 1) as pg}
          <button class="page-btn {pg === page ? 'active' : ''}" onclick={() => load(pg)}>{pg}</button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .overview { max-width: 900px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .search-input { flex: 1; padding: 0.5rem 0.75rem; background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.9rem; outline: none; }
  .search-input:focus { border-color: var(--gold,#c9a55c); }
  .btn-primary { padding: 0.5rem 1.2rem; background: var(--gold,#c9a55c); color: #111; font-weight: 700; border-radius: 6px; text-decoration: none; font-size: 0.85rem; white-space: nowrap; }
  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line,#333); font-size: 0.82rem; color: var(--text-muted,#888); }
  .table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line,#222); font-size: 0.9rem; }
  .kunden-nr { font-family: monospace; color: var(--gold,#c9a55c); font-size: 0.88rem; }
  .actions { display: flex; gap: 0.4rem; }
  .btn-sm { padding: 0.3rem 0.7rem; border: 1px solid var(--line,#444); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted,#888); text-decoration: none; background: none; cursor: pointer; }
  .pagination { display: flex; gap: 0.4rem; margin-top: 1rem; justify-content: center; }
  .page-btn { padding: 0.3rem 0.6rem; border: 1px solid var(--line,#444); border-radius: 4px; background: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.82rem; }
  .page-btn.active { border-color: var(--gold,#c9a55c); color: var(--gold,#c9a55c); }
  .loading, .empty { text-align: center; color: var(--text-muted,#888); padding: 2rem; }
</style>
```

---

## Task 11: `ProjectDetail.svelte` — neue Komponente

**Files:**
- Create: `website/src/components/admin/coaching/ProjectDetail.svelte`

- [ ] **Schritt 1: Datei anlegen**

```svelte
<script lang="ts">
  import type { CoachingProject } from '../../../lib/coaching-project-db';
  import type { Session } from '../../../lib/coaching-session-db';

  let {
    project: initialProject,
    sessions: initialSessions,
  }: { project: CoachingProject; sessions: Session[] } = $props();

  let project = $state<CoachingProject>(initialProject);
  let sessions = $state<Session[]>(initialSessions);

  let kiContext = $state(project.kiContext ?? '');
  let notes = $state(project.notes ?? '');
  let displayAlias = $state(project.displayAlias ?? '');

  let savingContext = $state(false);
  let savingNotes = $state(false);
  let msgContext = $state('');
  let msgNotes = $state('');

  async function saveContext() {
    savingContext = true; msgContext = '';
    const res = await fetch(`/api/admin/coaching/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kiContext, displayAlias }),
    });
    if (res.ok) {
      const json = await res.json();
      project = json.project;
      msgContext = 'Gespeichert.';
    } else {
      msgContext = 'Fehler beim Speichern.';
    }
    savingContext = false;
  }

  async function saveNotes() {
    savingNotes = true; msgNotes = '';
    const res = await fetch(`/api/admin/coaching/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    if (res.ok) { msgNotes = 'Gespeichert.'; }
    else { msgNotes = 'Fehler beim Speichern.'; }
    savingNotes = false;
  }

  function fmtDate(d: Date | string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const STATUS_LABELS: Record<string, string> = {
    active: 'Läuft', paused: 'Pause', completed: 'Abgeschlossen', abandoned: 'Abgebrochen',
  };
</script>

<div class="detail">
  <div class="header">
    <div class="header-left">
      <span class="kunden-nr">{project.customerNumber}</span>
      <span class="session-count">{sessions.length} {sessions.length === 1 ? 'Session' : 'Sessions'}</span>
    </div>
    <a href="/admin/coaching/sessions/new" class="btn-primary">+ Neue Session</a>
  </div>

  <!-- KI-Kontext -->
  <section class="card">
    <h2 class="card-title">KI-Kontext <span class="hint">(wird an KI übergeben — nur anonym formulieren)</span></h2>
    <div class="field">
      <label class="label" for="display-alias">Interner Bezeichner (nur für Coach)</label>
      <input id="display-alias" class="input" type="text" bind:value={displayAlias} placeholder="z.B. Firma Müller oder leer lassen" />
    </div>
    <div class="field">
      <label class="label" for="ki-context">Dauerhafter Kontext für die KI</label>
      <textarea id="ki-context" class="textarea" rows={5} bind:value={kiContext}
        placeholder="z.B. Klient befindet sich in einer beruflichen Neuorientierung. Schwerpunkt: Entscheidungsfindung."
      ></textarea>
    </div>
    {#if msgContext}<div class="msg">{msgContext}</div>{/if}
    <button class="btn-save" onclick={saveContext} disabled={savingContext}>
      {savingContext ? 'Speichere…' : 'KI-Kontext speichern'}
    </button>
  </section>

  <!-- Coach-Notizen -->
  <section class="card">
    <h2 class="card-title">Coach-Notizen <span class="hint">(privat — nie an KI übergeben)</span></h2>
    <div class="field">
      <textarea class="textarea" rows={4} bind:value={notes}
        placeholder="Interne Beobachtungen, Hintergrundinformationen, Erinnerungen…"
      ></textarea>
    </div>
    {#if msgNotes}<div class="msg">{msgNotes}</div>{/if}
    <button class="btn-save" onclick={saveNotes} disabled={savingNotes}>
      {savingNotes ? 'Speichere…' : 'Notizen speichern'}
    </button>
  </section>

  <!-- Sessions -->
  <section class="card">
    <h2 class="card-title">Sessions</h2>
    {#if sessions.length === 0}
      <p class="empty">Noch keine Sessions für dieses Projekt.</p>
    {:else}
      <table class="table">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Datum</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each sessions as s (s.id)}
            <tr>
              <td><a href={`/admin/coaching/sessions/${s.id}`}>{s.title}</a></td>
              <td>{fmtDate(s.createdAt)}</td>
              <td><span class="badge badge-{s.status}">{STATUS_LABELS[s.status] ?? s.status}</span></td>
              <td><a href={`/admin/coaching/sessions/${s.id}`} class="btn-sm">Öffnen</a></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>

<style>
  .detail { max-width: 800px; margin: 0 auto; padding: 1rem 1.5rem 3rem; display: flex; flex-direction: column; gap: 1.5rem; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
  .header-left { display: flex; align-items: center; gap: 1rem; }
  .kunden-nr { font-family: monospace; font-size: 1.5rem; font-weight: 700; color: var(--gold,#c9a55c); }
  .session-count { font-size: 0.85rem; color: var(--text-muted,#888); }
  .btn-primary { padding: 0.5rem 1.2rem; background: var(--gold,#c9a55c); color: #111; font-weight: 700; border-radius: 6px; text-decoration: none; font-size: 0.85rem; }
  .card { background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .card-title { font-size: 1rem; font-weight: 700; color: var(--text-light,#f0f0f0); margin: 0; }
  .hint { font-size: 0.75rem; color: var(--text-muted,#888); font-weight: 400; }
  .field { display: flex; flex-direction: column; gap: 0.35rem; }
  .label { font-size: 0.78rem; color: var(--text-muted,#888); }
  .input, .textarea { background: var(--bg,#111); border: 1px solid var(--line,#333); border-radius: 6px; padding: 0.55rem 0.75rem; color: var(--text-light,#f0f0f0); font-size: 0.88rem; outline: none; width: 100%; box-sizing: border-box; }
  .textarea { resize: vertical; font-family: inherit; }
  .input:focus, .textarea:focus { border-color: var(--gold,#c9a55c); }
  .btn-save { align-self: flex-start; padding: 0.45rem 1.1rem; background: var(--gold,#c9a55c); color: #111; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
  .btn-save:disabled { opacity: 0.5; cursor: default; }
  .msg { font-size: 0.82rem; color: var(--gold,#c9a55c); }
  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 0.4rem 0.6rem; font-size: 0.78rem; color: var(--text-muted,#888); border-bottom: 1px solid var(--line,#333); }
  .table td { padding: 0.55rem 0.6rem; font-size: 0.88rem; border-bottom: 1px solid var(--line,#222); }
  .table a { color: var(--gold,#c9a55c); text-decoration: none; }
  .badge { font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; }
  .badge-active { color: #60a5fa; } .badge-paused { color: #f59e0b; }
  .badge-completed { color: #4ade80; } .badge-abandoned { color: #94a3b8; }
  .btn-sm { padding: 0.3rem 0.7rem; border: 1px solid var(--line,#444); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted,#888); text-decoration: none; }
  .empty { color: var(--text-muted,#888); font-size: 0.88rem; }
</style>
```

- [ ] **Schritt 2: Commit** (Tasks 10 + 11 gemeinsam)

```bash
git add website/src/components/admin/coaching/ProjectsOverview.svelte \
        website/src/components/admin/coaching/ProjectDetail.svelte
git commit -m "feat(coaching): ProjectsOverview + ProjectDetail Svelte-Komponenten"
```

---

## Task 12: Neue Astro-Seiten

**Files:**
- Create: `website/src/pages/admin/coaching/projekte/index.astro`
- Create: `website/src/pages/admin/coaching/projekte/[id].astro`

- [ ] **Schritt 1: `projekte/index.astro` anlegen**

```astro
---
import AdminLayout from '../../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../../lib/auth';
import { listProjects } from '../../../../lib/coaching-project-db';
import { pool } from '../../../../lib/website-db';
import ProjectsOverview from '../../../../components/admin/coaching/ProjectsOverview.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const brand = process.env.BRAND || 'mentolder';
let initialResult = { projects: [], total: 0, page: 1, pageSize: 20 };
try {
  initialResult = await listProjects(pool, brand, { page: 1, pageSize: 20 });
} catch { /* coaching schema existiert noch nicht */ }
---

<AdminLayout title="Coaching-Projekte">
  <div style="padding: 1rem 0;">
    <nav style="font-size:0.78rem;color:var(--text-muted,#888);margin-bottom:0.4rem;padding:0 1.5rem;">
      <a href="/admin" style="color:var(--text-muted,#888);text-decoration:none;">Admin</a>
      <span style="margin:0 0.4rem;">›</span>
      Projekte
    </nav>
    <h1 style="font-size:1.8rem;font-weight:700;color:var(--text-light,#f0f0f0);margin:0 0 1.5rem;padding:0 1.5rem;">Coaching-Projekte</h1>
    <ProjectsOverview client:load {initialResult} />
  </div>
</AdminLayout>
```

- [ ] **Schritt 2: `projekte/[id].astro` anlegen**

```astro
---
import AdminLayout from '../../../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../../../lib/auth';
import { getProject } from '../../../../lib/coaching-project-db';
import { listSessions } from '../../../../lib/coaching-session-db';
import { pool } from '../../../../lib/website-db';
import ProjectDetail from '../../../../components/admin/coaching/ProjectDetail.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const { id } = Astro.params;
const brand = process.env.BRAND || 'mentolder';

const project = id ? await getProject(pool, id) : null;
if (!project) return Astro.redirect('/admin/coaching/projekte');

const sessionsResult = await listSessions(pool, brand, { pageSize: 100 });
const sessions = sessionsResult.sessions.filter(s => s.projectId === id);
---

<AdminLayout title={`Projekt ${project.customerNumber}`}>
  <div style="padding: 1rem 0;">
    <nav style="font-size:0.78rem;color:var(--text-muted,#888);margin-bottom:0.4rem;padding:0 1.5rem;">
      <a href="/admin" style="color:var(--text-muted,#888);text-decoration:none;">Admin</a>
      <span style="margin:0 0.4rem;">›</span>
      <a href="/admin/coaching/projekte" style="color:var(--text-muted,#888);text-decoration:none;">Projekte</a>
      <span style="margin:0 0.4rem;">›</span>
      {project.customerNumber}
    </nav>
    <ProjectDetail client:load {project} {sessions} />
  </div>
</AdminLayout>
```

- [ ] **Schritt 3: Commit**

```bash
git add website/src/pages/admin/coaching/projekte/
git commit -m "feat(coaching): Projektliste + Projektdetail Seiten"
```

---

## Task 13: Navigation aktualisieren

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Schritt 1: Coaching-Nav-Block erweitern**

In `AdminLayout.astro` den Coaching-Block (Zeilen 128–137) von:
```typescript
  {
    label: 'Coaching',
    items: [
      { href: '/admin/coaching/sessions',     label: 'Sessions',     icon: 'clipboard',
        matches: ['/admin/coaching/sessions'] },
      { href: '/admin/coaching/sessions/new', label: 'Neue Session', icon: 'plus' },
      { href: '/admin/coaching/settings',     label: 'KI-Einstellungen', icon: 'settings',
        matches: ['/admin/coaching/settings'] },
    ],
  },
```

zu:
```typescript
  {
    label: 'Coaching',
    items: [
      { href: '/admin/coaching/projekte',      label: 'Projekte',         icon: 'folder',
        matches: ['/admin/coaching/projekte'] },
      { href: '/admin/coaching/sessions',      label: 'Sessions',         icon: 'clipboard',
        matches: ['/admin/coaching/sessions'] },
      { href: '/admin/coaching/sessions/new',  label: 'Neue Session',     icon: 'plus' },
      { href: '/admin/coaching/settings',      label: 'KI-Einstellungen', icon: 'settings',
        matches: ['/admin/coaching/settings'] },
    ],
  },
```

- [ ] **Schritt 2: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(coaching): Projekte-Nav-Eintrag in Admin-Sidebar"
```

---

## Task 14: Abschluss-Verifikation + PR

- [ ] **Schritt 1: Unit-Tests laufen lassen**

```bash
cd website && npx vitest run src/lib/coaching-project-db.test.ts src/lib/coaching-session-db.test.ts
```

Erwartete Ausgabe: alle Tests grün, 0 Fehler.

- [ ] **Schritt 2: TypeScript vollständig prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

Erwartete Ausgabe: keine Fehler.

- [ ] **Schritt 3: Offline-Tests**

```bash
task test:unit && task test:manifests
```

Erwartete Ausgabe: alle Tests grün.

- [ ] **Schritt 4: Migration auf prod anwenden (mentolder + korczewski)**

```bash
task workspace:psql ENV=mentolder -- website < scripts/one-shot/20260517-coaching-projects.sql
task workspace:psql ENV=korczewski -- website-korczewski < scripts/one-shot/20260517-coaching-projects.sql
```

- [ ] **Schritt 5: PR öffnen**

```bash
# Skill: commit-commands:commit-push-pr
# Titel: feat(coaching): KI-Projektverwaltung v2 — Kundennummer-Anonymisierung + Projektseiten
```

---

## Ticket

Ticket wird beim Plan-Commit durch `dev-flow-plan` angelegt → `ticket_id` im Frontmatter.
