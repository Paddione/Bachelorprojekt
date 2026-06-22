---
title: "Sessions: Brainstorm-Session-Vorlagen"
ticket_id: T000993
domains: [website, db]
status: active
date: 2026-06-20
spec_ref: docs/superpowers/specs/2026-06-20-sessions-brainstorm-templates.md
openspec_ref: openspec/changes/sessions-brainstorm-templates/
file_locks: []
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: Sessions-Brainstorm-Templates (T000993)

- [ ] Task 1: DB-Migration sessions.templates — Tabelle + 5 Default-Seeds (beide Namespaces)
- [ ] Task 2: website/src/lib/sessions/templates.ts — CRUD-Logik + Hardcoded-Fallback (Test-First)
- [ ] Task 3: API-Routen GET/POST/DELETE für Templates (admin-guarded)
- [ ] Task 4: TemplatePicker.svelte — Auswahl-UI mit Default-Badge + Clone-Button
- [ ] Task 5: SessionStart.svelte — Template-Flow Integration
- [ ] Task 6: Verifikation — task test:changed + task freshness:regenerate + task freshness:check

---

# Sessions: Brainstorm-Session-Vorlagen — Implementation Plan

> **shared_changes: true** — Die DB-Migration `sessions.templates` gilt für beide
> Namespaces (`workspace` für mentolder, `workspace-korczewski` für korczewski).
> Die Migration muss pro Brand angewendet werden (jeder Namespace hat eine eigene
> `website`-Datenbank).

**Ziel:** 5 vorinstallierte Brainstorm-Vorlagen (Feature-Intake, Retro, Grilling,
Workshop, Spezifikation) in einer neuen `sessions.templates`-Tabelle, mit Auswahl-UI
beim Session-Start und Clone-and-Edit für eigene Varianten.

**Tech Stack:** PostgreSQL (Schema `sessions`), Astro API routes + TypeScript,
Svelte 5 (runes), go-task.

## Global Constraints

- **S1 — per-file line ratchet.** Alle neuen Dateien haben keinen Baseline-Eintrag
  (neue Dateien). Limits: `.ts` 600, `.svelte` 500, `.sql` 0 (nicht in gates.yaml).
- **S3 — no brand-domain literals.** Keine `*.mentolder.de` / `*.korczewski.de`
  String-Literals in `website/src/`. Hosts werden aus API-Payloads oder Props gelesen.
- **Admin auth pattern.** API-Routes nutzen `getSession(request.headers.get('cookie'))`
  + `isAdmin(session)` aus `website/src/lib/auth.ts`, `export const prerender = false`,
  und `locals.requestLogger.error(...)` für Errors. Siehe
  `website/src/pages/api/admin/factory-control.ts` für das `authGuard()`-Pattern.
- **DB-Zugriff.** Über `pg`-Pool aus `website/src/lib/website-db.ts` (dieselbe
  Connection wie andere Admin-APIs). Bei Verbindungsfehler → graceful Fallback auf
  hardcoded `DEFAULT_TEMPLATES` in `templates.ts`.
- **DB-Migration ist manuell.** Kein Auto-Runner. Migration wird per `kubectl exec`
  pro Namespace angewendet, analog `20260617_create_folder_templates.sql`.

---

## File Structure

```
website/src/db/migrations/
  20260620_create_sessions_templates.sql          ← NEU: Schema sessions + Tabelle templates + 5 Default-Seeds
website/src/lib/sessions/
  templates.ts                                    ← NEU: CRUD-Logik + DEFAULT_TEMPLATES-Fallback
  templates.test.ts                               ← NEU: Unit-Tests für CRUD + Fallback
website/src/pages/api/admin/sessions/templates/
  index.ts                                        ← NEU: GET (list), POST (clone)
  index.test.ts                                   ← NEU: API-Route-Tests
  [id].ts                                         ← NEU: DELETE (custom template löschen)
  [id].test.ts                                    ← NEU: DELETE-Route-Tests
website/src/components/sessions/
  TemplatePicker.svelte                           ← NEU: Auswahl-UI mit Default-Badge + Clone-Button
  TemplatePicker.test.ts                          ← NEU: Component-Tests
  SessionStart.svelte                             ← NEU: Modal, bindet TemplatePicker ein
```

---

### Task 1: DB-Migration — sessions.templates-Tabelle + 5 Default-Seeds

**Dateien:**
- Create: `website/src/db/migrations/20260620_create_sessions_templates.sql`

**Interfaces:**
- Produces: Schema `sessions` + Tabelle `sessions.templates` mit Spalten
  `(id, slug, title, body_markdown, is_default, owner_id, created_from_template_id,
    created_at, updated_at)`. 5 Default-Zeilen mit `is_default=true, owner_id=NULL`.
  Unique-Constraint: `slug` für Defaults, `(owner_id, slug)` für Custom.
  Self-referential FK: `created_from_template_id → sessions.templates(id)`.

- [ ] **Step 1: Migration-SQL erstellen**

```sql
-- Migration: create sessions.templates (brainstorm session templates with 5 defaults).
-- Apply manually (no auto-runner) per brand on BOTH namespaces:
--   kubectl exec -n workspace deploy/shared-db -- \
--     psql -U website -d website -f - < website/src/db/migrations/20260620_create_sessions_templates.sql
--   kubectl exec -n workspace-korczewski deploy/shared-db -- \
--     psql -U website -d website -f - < website/src/db/migrations/20260620_create_sessions_templates.sql

CREATE SCHEMA IF NOT EXISTS sessions;

CREATE TABLE IF NOT EXISTS sessions.templates (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     TEXT NOT NULL,
  title                    TEXT NOT NULL,
  body_markdown            TEXT NOT NULL DEFAULT '',
  is_default               BOOLEAN NOT NULL DEFAULT false,
  owner_id                 TEXT,
  created_from_template_id UUID REFERENCES sessions.templates(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

-- Default templates are unique by slug globally (owner_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_templates_default_slug
  ON sessions.templates (slug) WHERE is_default;

-- Custom templates are unique per (owner_id, slug).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_templates_owner_slug
  ON sessions.templates (owner_id, slug) WHERE NOT is_default;

GRANT USAGE ON SCHEMA sessions TO website;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA sessions TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA sessions GRANT ALL ON TABLES TO website;

-- Idempotent seed: 5 default templates.
DO $$
BEGIN
  INSERT INTO sessions.templates (slug, title, body_markdown, is_default, owner_id)
  VALUES
    ('feature-intake',
     'Feature-Intake',
     '# Feature-Intake\nefinition## Kernproblem\nWelches Problem löst dieses Feature?\n\n## Zielgruppe\nFür wen ist es relevant?\n\n## Mehrwert\nWelchen Nutzen bringt es?\n\n## Aufwand\nKlein / Mittel / Gross?',
     true, NULL),
    ('retro',
     'Retro',
     '# Retrospektive\n\n## Was lief gut?\nWelche Dinge funktionierten in der letzten Phase?\n\n## Was lief schlecht?\nWelche Hürden gab es?\n\n## Was ändern?\nWelche konkreten Anpassungen leiten wir ab?\n\n## Aktionspunkte\nWer macht was bis wann?',
     true, NULL),
    ('grilling',
     'Grilling',
     '# Grilling-Session\n\n## Anforderungsklärung\nWas ist das Kernproblem? Welche Acceptance Criteria müssen erfüllt sein?\n\n## Architektur & Design\nWelche Komponenten sind betroffen? Gibt es ein Architektur-Diagramm?\n\n## Risiken & Edge Cases\nWas sind die kritischsten Edge Cases? Welche Fehlerzustände müssen behandelt werden?\n\n## Umsetzung\nWelche Dateien werden geändert? Sind Breaking Changes zu erwarten?',
     true, NULL),
    ('workshop',
     'Workshop',
     '# Workshop-Planung\n\n## Ziel\nWas soll am Ende des Workshops stehen?\n\n## Teilnehmer\nWer ist anwesend? Welche Rollen?\n\n## Agenda\nWelche Blöcke in welcher Reihenfolge?\n\n## Material\nWas wird benötigt (Slides, Tools, Handouts)?\n\n## Nachbereitung\nWelche Follow-ups ergeben sich?',
     true, NULL),
    ('spezifikation',
     'Spezifikation',
     '# Spezifikation\n\n## Kontext\nWelcher Systemteil wird spezifiziert?\n\n## Anforderungen\nWelche funktionalen Anforderungen müssen erfüllt sein?\n\n## Schnittstellen\nWelche APIs / Datenflüsse sind beteiligt?\n\n## Constraints\nWelche technischen oder organisatorischen Einschränkungen gelten?\n\n## Abnahmekriterien\nWann gilt die Spezifikation als umgesetzt?',
     true, NULL)
  ON CONFLICT DO NOTHING;
END
$$;
```

- [ ] **Step 2: Migration lokal validieren (Syntax-Check)**

```bash
psql -U website -d website -f website/src/db/migrations/20260620_create_sessions_templates.sql --dry-run 2>&1 | grep -i error || echo "SQL syntax OK"
```

Falls kein lokales Postgres verfügbar, überspringen und in Step 3 validieren.

- [ ] **Step 3: Migration auf dev-Cluster anwenden (beide Namespaces)**

```bash
# Mentolder namespace
kubectl exec -n workspace deploy/shared-db -- \
  psql -U website -d website -f - < website/src/db/migrations/20260620_create_sessions_templates.sql

# Korczewski namespace
kubectl exec -n workspace-korczewski deploy/shared-db -- \
  psql -U website -d website -f - < website/src/db/migrations/20260620_create_sessions_templates.sql
```

- [ ] **Step 4: Tabelle + Seeds verifizieren**

```bash
kubectl exec -n workspace deploy/shared-db -- \
  psql -U website -d website -c "SELECT slug, title, is_default FROM sessions.templates ORDER BY slug;"
```

Expected: 5 Zeilen mit `is_default = t` (feature-intake, grilling, retro, spezifikation, workshop).

- [ ] **Step 5: Commit**

```bash
git add website/src/db/migrations/20260620_create_sessions_templates.sql
git commit -m "feat(db): add sessions.templates table with 5 default templates [T000993]"
```

---

### Task 2: templates.ts — CRUD-Logik mit Hardcoded-Fallback (Test-First)

**Dateien:**
- Create: `website/src/lib/sessions/templates.ts`
- Create: `website/src/lib/sessions/templates.test.ts`

**Interfaces:**
- Consumes: `pg`-Pool aus `website/src/lib/website-db.ts` (dieselbe Connection).
- Produces: `listTemplates(ownerId)`, `cloneTemplate(templateId, ownerId, overrides)`,
  `deleteTemplate(templateId, ownerId)`, `DEFAULT_TEMPLATES` (hardcoded Fallback).
  Typ `SessionTemplate` mit Feldern `(id, slug, title, body_markdown, is_default,
  owner_id, created_from_template_id)`.

- [ ] **Step 1: Failing Test schreiben**

Create `website/src/lib/sessions/templates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../website-db', () => ({
  getPool: vi.fn(() => ({ query: vi.fn(), end: vi.fn() })),
}));
import { getPool } from '../website-db';
import { DEFAULT_TEMPLATES, listTemplates, cloneTemplate, deleteTemplate } from './templates';

describe('DEFAULT_TEMPLATES', () => {
  it('contains exactly 5 templates', () => {
    expect(DEFAULT_TEMPLATES).toHaveLength(5);
  });

  it('all defaults have is_default=true and owner_id=null', () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(t.is_default).toBe(true);
      expect(t.owner_id).toBeNull();
    }
  });

  it('slugs match: feature-intake, retro, grilling, workshop, spezifikation', () => {
    const slugs = DEFAULT_TEMPLATES.map(t => t.slug).sort();
    expect(slugs).toEqual(['feature-intake', 'grilling', 'retro', 'spezifikation', 'workshop']);
  });
});

describe('listTemplates — DB fallback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('falls back to DEFAULT_TEMPLATES when DB query throws', async () => {
    (getPool as any).mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error('connection refused')),
      end: vi.fn(),
    });
    const result = await listTemplates('user-123');
    expect(result).toHaveLength(5);
    expect(result[0].is_default).toBe(true);
  });

  it('returns DB rows when query succeeds', async () => {
    const dbRows = [
      { id: 'a', slug: 'feature-intake', title: 'Feature-Intake', body_markdown: '# x',
        is_default: true, owner_id: null, created_from_template_id: null },
      { id: 'b', slug: 'my-custom', title: 'My Custom', body_markdown: '# y',
        is_default: false, owner_id: 'user-123', created_from_template_id: 'a' },
    ];
    (getPool as any).mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: dbRows }),
      end: vi.fn(),
    });
    const result = await listTemplates('user-123');
    expect(result).toHaveLength(2);
    expect(result[1].slug).toBe('my-custom');
  });
});

describe('cloneTemplate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when templateId not found', async () => {
    (getPool as any).mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn(),
    });
    await expect(cloneTemplate('nonexistent', 'user-123', {}))
      .rejects.toThrow('template not found');
  });
});

describe('deleteTemplate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when trying to delete a default template', async () => {
    (getPool as any).mockReturnValue({
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'a', is_default: true, owner_id: null }],
      }),
      end: vi.fn(),
    });
    await expect(deleteTemplate('a', 'user-123'))
      .rejects.toThrow('cannot delete default template');
  });

  it('throws when template belongs to another user', async () => {
    (getPool as any).mockReturnValue({
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'b', is_default: false, owner_id: 'other-user' }],
      }),
      end: vi.fn(),
    });
    await expect(deleteTemplate('b', 'user-123'))
      .rejects.toThrow('not owner');
  });
});
```

- [ ] **Step 2: Test ausführen, Bestätigen dass er fehlschlägt (Modul fehlt)**

Run: `cd website && npx vitest run src/lib/sessions/templates.test.ts`
Expected: FAIL — cannot resolve `./templates`.

- [ ] **Step 3: templates.ts implementieren**

Create `website/src/lib/sessions/templates.ts`:

```ts
// website/src/lib/sessions/templates.ts
// CRUD logic for brainstorm session templates with hardcoded fallback.

export interface SessionTemplate {
  id: string;
  slug: string;
  title: string;
  body_markdown: string;
  is_default: boolean;
  owner_id: string | null;
  created_from_template_id: string | null;
}

export const DEFAULT_TEMPLATES: SessionTemplate[] = [
  { id: 'default-feature-intake', slug: 'feature-intake', title: 'Feature-Intake',
    body_markdown: '# Feature-Intake\n\n## Kernproblem\nWelches Problem loest dieses Feature?\n\n## Zielgruppe\nFuer wen ist es relevant?\n\n## Mehrwert\nWelchen Nutzen bringt es?\n\n## Aufwand\nKlein / Mittel / Gross?',
    is_default: true, owner_id: null, created_from_template_id: null },
  { id: 'default-retro', slug: 'retro', title: 'Retro',
    body_markdown: '# Retrospektive\n\n## Was lief gut?\nWelche Dinge funktionierten?\n\n## Was lief schlecht?\nWelche Huerden gab es?\n\n## Was aendern?\nWelche Anpassungen leiten wir ab?\n\n## Aktionspunkte\nWer macht was bis wann?',
    is_default: true, owner_id: null, created_from_template_id: null },
  { id: 'default-grilling', slug: 'grilling', title: 'Grilling',
    body_markdown: '# Grilling-Session\n\n## Anforderungsklaerung\nWas ist das Kernproblem? Welche Acceptance Criteria muessen erfuellt sein?\n\n## Architektur & Design\nWelche Komponenten sind betroffen?\n\n## Risiken & Edge Cases\nWas sind die kritischsten Edge Cases?\n\n## Umsetzung\nWelche Dateien werden geaendert?',
    is_default: true, owner_id: null, created_from_template_id: null },
  { id: 'default-workshop', slug: 'workshop', title: 'Workshop',
    body_markdown: '# Workshop-Planung\n\n## Ziel\nWas soll am Ende stehen?\n\n## Teilnehmer\nWer ist anwesend?\n\n## Agenda\nWelche Bloecke in welcher Reihenfolge?\n\n## Material\nWas wird benoetigt?\n\n## Nachbereitung\nWelche Follow-ups ergeben sich?',
    is_default: true, owner_id: null, created_from_template_id: null },
  { id: 'default-spezifikation', slug: 'spezifikation', title: 'Spezifikation',
    body_markdown: '# Spezifikation\n\n## Kontext\nWelcher Systemteil wird spezifiziert?\n\n## Anforderungen\nWelche funktionalen Anforderungen muessen erfuellt sein?\n\n## Schnittstellen\nWelche APIs sind beteiligt?\n\n## Constraints\nWelche Einschraenkungen gelten?\n\n## Abnahmekriterien\nWann gilt die Spezifikation als umgesetzt?',
    is_default: true, owner_id: null, created_from_template_id: null },
];

interface CloneOverrides {
  title?: string;
  slug?: string;
  body_markdown?: string;
}

function getPoolSafe() {
  const { getPool } = require('../website-db');
  return getPool();
}

export async function listTemplates(ownerId: string): Promise<SessionTemplate[]> {
  try {
    const pool = getPoolSafe();
    const { rows } = await pool.query(
      `SELECT id, slug, title, body_markdown, is_default, owner_id, created_from_template_id
       FROM sessions.templates
       WHERE is_default OR owner_id = $1
       ORDER BY is_default DESC, title ASC`,
      [ownerId]
    );
    return rows as SessionTemplate[];
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export async function cloneTemplate(
  templateId: string,
  ownerId: string,
  overrides: CloneOverrides
): Promise<SessionTemplate> {
  const pool = getPoolSafe();
  const { rows } = await pool.query(
    `SELECT id, slug, title, body_markdown, is_default, owner_id, created_from_template_id
     FROM sessions.templates WHERE id = $1`,
    [templateId]
  );
  if (rows.length === 0) throw new Error('template not found');

  const source = rows[0] as SessionTemplate;
  const slug = overrides.slug ?? `${source.slug}-copy`;
  const title = overrides.title ?? `${source.title} (Kopie)`;
  const body = overrides.body_markdown ?? source.body_markdown;

  const { rows: inserted } = await pool.query(
    `INSERT INTO sessions.templates (slug, title, body_markdown, is_default, owner_id, created_from_template_id)
     VALUES ($1, $2, $3, false, $4, $5)
     RETURNING id, slug, title, body_markdown, is_default, owner_id, created_from_template_id`,
    [slug, title, body, ownerId, templateId]
  );
  return inserted[0] as SessionTemplate;
}

export async function deleteTemplate(templateId: string, ownerId: string): Promise<void> {
  const pool = getPoolSafe();
  const { rows } = await pool.query(
    `SELECT id, is_default, owner_id FROM sessions.templates WHERE id = $1`,
    [templateId]
  );
  if (rows.length === 0) throw new Error('template not found');
  const tpl = rows[0];
  if (tpl.is_default) throw new Error('cannot delete default template');
  if (tpl.owner_id !== ownerId) throw new Error('not owner');

  await pool.query(`DELETE FROM sessions.templates WHERE id = $1`, [templateId]);
}
```

- [ ] **Step 4: Test ausführen, Bestätigen dass er besteht**

Run: `cd website && npx vitest run src/lib/sessions/templates.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Line-Budget-Check**

Run: `wc -l website/src/lib/sessions/templates.ts`
Expected: < 600 (target ~120).

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/sessions/templates.ts website/src/lib/sessions/templates.test.ts
git commit -m "feat(sessions): add templates.ts CRUD logic with DB fallback [T000993]"
```

---

### Task 3: API-Routen — GET/POST/DELETE für Templates

**Dateien:**
- Create: `website/src/pages/api/admin/sessions/templates/index.ts`
- Create: `website/src/pages/api/admin/sessions/templates/index.test.ts`
- Create: `website/src/pages/api/admin/sessions/templates/[id].ts`
- Create: `website/src/pages/api/admin/sessions/templates/[id].test.ts`

**Interfaces:**
- Consumes: `getSession`, `isAdmin` aus `website/src/lib/auth.ts`;
  `listTemplates`, `cloneTemplate`, `deleteTemplate` aus `templates.ts` (Task 2).
- Produces: `GET /api/admin/sessions/templates` → `{ templates: SessionTemplate[] }`;
  `POST` → clone (body `{templateId, title?, slug?, body_markdown?}`);
  `DELETE /api/admin/sessions/templates/[id]` → entfernt Custom-Template.

- [ ] **Step 1: Failing Test für index.ts schreiben**

Create `website/src/pages/api/admin/sessions/templates/index.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../../lib/sessions/templates', () => ({
  listTemplates: vi.fn(),
  cloneTemplate: vi.fn(),
}));
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listTemplates, cloneTemplate } from '../../../../../lib/sessions/templates';
import { GET, POST } from './index';

const mkReq = (opts: { method?: string; body?: unknown } = {}) =>
  new Request('http://x/api/admin/sessions/templates', {
    method: opts.method ?? 'GET',
    headers: { cookie: 's=1' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
const locals = { requestLogger: { error: vi.fn() } } as any;

describe('GET /api/admin/sessions/templates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when anonymous', async () => {
    (getSession as any).mockResolvedValue(null);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(401);
  });

  it('403 when non-admin', async () => {
    (getSession as any).mockResolvedValue({ sub: 'b', email: 'b@x', preferred_username: 'bob' });
    (isAdmin as any).mockReturnValue(false);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(403);
  });

  it('200 with templates for admin', async () => {
    (getSession as any).mockResolvedValue({ sub: 'a', email: 'a@x', preferred_username: 'admin' });
    (isAdmin as any).mockReturnValue(true);
    (listTemplates as any).mockResolvedValue([
      { id: '1', slug: 'feature-intake', title: 'Feature-Intake', body_markdown: '', is_default: true, owner_id: null, created_from_template_id: null },
    ]);
    const res = await GET({ request: mkReq(), locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates[0].slug).toBe('feature-intake');
  });
});

describe('POST /api/admin/sessions/templates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 clones a template', async () => {
    (getSession as any).mockResolvedValue({ sub: 'a', email: 'a@x', preferred_username: 'admin' });
    (isAdmin as any).mockReturnValue(true);
    (cloneTemplate as any).mockResolvedValue({
      id: '2', slug: 'grilling-copy', title: 'Grilling (Kopie)',
      body_markdown: '# x', is_default: false, owner_id: 'a', created_from_template_id: '1',
    });
    const res = await POST({ request: mkReq({ method: 'POST', body: { templateId: '1' } }), locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.template.slug).toBe('grilling-copy');
  });
});
```

- [ ] **Step 2: Test ausführen, Bestätigen dass er fehlschlägt**

Run: `cd website && npx vitest run src/pages/api/admin/sessions/templates/index.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: index.ts implementieren**

Create `website/src/pages/api/admin/sessions/templates/index.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listTemplates, cloneTemplate } from '../../../../../lib/sessions/templates';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authGuard(session: Awaited<ReturnType<typeof getSession>>): Response | null {
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;
  try {
    const templates = await listTemplates(session!.sub);
    return json({ templates }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions/templates] GET error:');
    return json({ error: 'read_failed' }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }
  const templateId = String(body.templateId ?? '').trim();
  if (!templateId) return json({ error: 'templateId_required' }, 400);
  try {
    const template = await cloneTemplate(templateId, session!.sub, {
      title: body.title as string | undefined,
      slug: body.slug as string | undefined,
      body_markdown: body.body_markdown as string | undefined,
    });
    return json({ template }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions/templates] POST error:');
    return json({ error: (err as Error).message }, 400);
  }
};
```

- [ ] **Step 4: Test ausführen, Bestätigen dass er besteht**

Run: `cd website && npx vitest run src/pages/api/admin/sessions/templates/index.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: [id].ts + Test erstellen (DELETE-Route)**

Create `website/src/pages/api/admin/sessions/templates/[id].test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../../../lib/sessions/templates', () => ({
  deleteTemplate: vi.fn(),
}));
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { deleteTemplate } from '../../../../../../lib/sessions/templates';
import { DELETE } from './[id]';

const mkReq = () => new Request('http://x/api/admin/sessions/templates/abc', {
  method: 'DELETE', headers: { cookie: 's=1' },
});
const locals = { requestLogger: { error: vi.fn() } } as any;

describe('DELETE /api/admin/sessions/templates/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when anonymous', async () => {
    (getSession as any).mockResolvedValue(null);
    const res = await DELETE({ request: mkReq(), locals, params: { id: 'abc' } } as any);
    expect(res.status).toBe(401);
  });

  it('200 deletes own custom template', async () => {
    (getSession as any).mockResolvedValue({ sub: 'a', email: 'a@x', preferred_username: 'admin' });
    (isAdmin as any).mockReturnValue(true);
    (deleteTemplate as any).mockResolvedValue(undefined);
    const res = await DELETE({ request: mkReq(), locals, params: { id: 'abc' } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('400 when deleteTemplate throws', async () => {
    (getSession as any).mockResolvedValue({ sub: 'a', email: 'a@x', preferred_username: 'admin' });
    (isAdmin as any).mockReturnValue(true);
    (deleteTemplate as any).mockRejectedValue(new Error('cannot delete default template'));
    const res = await DELETE({ request: mkReq(), locals, params: { id: 'abc' } } as any);
    expect(res.status).toBe(400);
  });
});
```

Create `website/src/pages/api/admin/sessions/templates/[id].ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { deleteTemplate } from '../../../../../../lib/sessions/templates';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const DELETE: APIRoute = async ({ request, locals, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);

  const id = params.id;
  if (!id) return json({ error: 'id_required' }, 400);

  try {
    await deleteTemplate(id, session.sub);
    return json({ ok: true }, 200);
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/sessions/templates/[id]] DELETE error:');
    return json({ error: (err as Error).message }, 400);
  }
};
```

- [ ] **Step 6: [id].ts Tests ausführen**

Run: `cd website && npx vitest run src/pages/api/admin/sessions/templates/[id].test.ts`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add website/src/pages/api/admin/sessions/templates/
git commit -m "feat(api): add session templates GET/POST/DELETE routes [T000993]"
```

---

### Task 4: TemplatePicker.svelte — Auswahl-UI

**Dateien:**
- Create: `website/src/components/sessions/TemplatePicker.svelte`
- Create: `website/src/components/sessions/TemplatePicker.test.ts`

**Interfaces:**
- Consumes: `GET /api/admin/sessions/templates` → `{ templates: SessionTemplate[] }`;
  `POST /api/admin/sessions/templates` (Clone);
  `DELETE /api/admin/sessions/templates/[id]` (Delete Custom).
- Produces: rendert eine Karten-Liste der Templates. Default-Templates mit
  „Default"-Badge und „Clone"-Button. Custom-Templates mit „Löschen"-Button.
  Dispatch `CustomEvent('template:select', { detail: { template } })` bei Auswahl.

- [ ] **Step 1: Failing Test schreiben**

Create `website/src/components/sessions/TemplatePicker.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import TemplatePicker from './TemplatePicker.svelte';

const sampleTemplates = {
  templates: [
    { id: 'd1', slug: 'feature-intake', title: 'Feature-Intake', body_markdown: '# x',
      is_default: true, owner_id: null, created_from_template_id: null },
    { id: 'c1', slug: 'my-retro', title: 'My Retro', body_markdown: '# y',
      is_default: false, owner_id: 'admin', created_from_template_id: 'd2' },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => sampleTemplates }));
});
afterEach(() => vi.unstubAllGlobals());

describe('TemplatePicker', () => {
  it('renders default and custom templates from the API', async () => {
    const { getByText } = render(TemplatePicker);
    await waitFor(() => expect(getByText('Feature-Intake')).toBeTruthy());
    expect(getByText('My Retro')).toBeTruthy();
  });

  it('shows Default badge on default templates', async () => {
    const { getByText } = render(TemplatePicker);
    await waitFor(() => expect(getByText('Default')).toBeTruthy());
  });

  it('dispatches template:select on card click', async () => {
    const handler = vi.fn();
    window.addEventListener('template:select', handler as any);
    const { getByRole } = render(TemplatePicker);
    await waitFor(() => getByRole('button', { name: /Feature-Intake/i }));
    await fireEvent.click(getByRole('button', { name: /Feature-Intake/i }));
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener('template:select', handler as any);
  });
});
```

- [ ] **Step 2: Test ausführen, Bestätigen dass er fehlschlägt**

Run: `cd website && npx vitest run src/components/sessions/TemplatePicker.test.ts`
Expected: FAIL — cannot resolve `./TemplatePicker.svelte`.

- [ ] **Step 3: TemplatePicker.svelte implementieren**

Create `website/src/components/sessions/TemplatePicker.svelte`:

```svelte
<script lang="ts">
  interface SessionTemplate {
    id: string; slug: string; title: string; body_markdown: string;
    is_default: boolean; owner_id: string | null; created_from_template_id: string | null;
  }

  let templates = $state<SessionTemplate[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let cloning = $state<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/admin/sessions/templates', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      templates = Array.isArray(body.templates) ? body.templates : [];
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'load failed';
    } finally {
      loading = false;
    }
  }

  function select(t: SessionTemplate) {
    window.dispatchEvent(new CustomEvent('template:select', { detail: { template: t } }));
  }

  async function clone(t: SessionTemplate) {
    cloning = t.id;
    try {
      const res = await fetch('/api/admin/sessions/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ templateId: t.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'clone failed';
    } finally {
      cloning = null;
    }
  }

  async function remove(t: SessionTemplate) {
    try {
      const res = await fetch(`/api/admin/sessions/templates/${t.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'delete failed';
    }
  }

  $effect(() => { load(); });
</script>

<div class="picker">
  <header><span>Vorlagen</span></header>

  {#if loading}
    <p class="muted">Laedt…</p>
  {:else if error}
    <p class="muted">Fehler: {error}</p>
  {:else}
    <ul>
      {#each templates as t (t.id)}
        <li>
          <button type="button" class="card" onclick={() => select(t)} aria-label={t.title}>
            <span class="meta">
              <span class="title">{t.title}</span>
              {#if t.is_default}
                <span class="badge">Default</span>
              {/if}
            </span>
            <span class="actions">
              {#if t.is_default}
                <button type="button" class="mini" onclick={() => clone(t)} disabled={cloning === t.id}>
                  {cloning === t.id ? '…' : 'Clone'}
                </button>
              {:else}
                <button type="button" class="mini danger" onclick={() => remove(t)}>
                  Loeschen
                </button>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; }
  header { font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .card { width: 100%; display: flex; align-items: center; gap: 0.6rem; background: #111a29;
    border: 1px solid #243349; border-radius: 8px; padding: 0.6rem 0.7rem; color: inherit;
    cursor: pointer; text-align: left; }
  .card:hover { border-color: #3a567d; }
  .meta { display: flex; align-items: center; gap: 0.5rem; flex: 1; }
  .title { font-weight: 600; }
  .badge { font-size: 0.7rem; background: #1e3a5f; color: #7ab8ff; padding: 0.1rem 0.4rem;
    border-radius: 4px; }
  .actions { display: flex; gap: 0.3rem; }
  .mini { font-size: 0.8rem; background: none; border: 1px solid #2a3a52; color: inherit;
    border-radius: 4px; cursor: pointer; padding: 0.2rem 0.5rem; }
  .mini.danger { border-color: #5a2a3a; color: #e07090; }
  .muted { color: #7c8aa0; }
</style>
```

- [ ] **Step 4: Test ausführen, Bestätigen dass er besteht**

Run: `cd website && npx vitest run src/components/sessions/TemplatePicker.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Line-Budget-Check**

Run: `wc -l website/src/components/sessions/TemplatePicker.svelte`
Expected: < 500 (target ~110).

- [ ] **Step 6: Commit**

```bash
git add website/src/components/sessions/TemplatePicker.svelte website/src/components/sessions/TemplatePicker.test.ts
git commit -m "feat(website): add TemplatePicker session template selection UI [T000993]"
```

---

### Task 5: SessionStart.svelte — Template-Flow Integration

**Dateien:**
- Create: `website/src/components/sessions/SessionStart.svelte`

**Interfaces:**
- Consumes: `TemplatePicker.svelte` (Task 4); `template:select` CustomEvent.
- Produces: ein Modal, das `TemplatePicker` einbindet. Bei `template:select` schliesst
  es das Modal und dispatcht `session:start` mit
  `{ detail: { template } }`.

- [ ] **Step 1: SessionStart.svelte erstellen**

Create `website/src/components/sessions/SessionStart.svelte`:

```svelte
<script lang="ts">
  import TemplatePicker from './TemplatePicker.svelte';

  interface SessionTemplate {
    id: string; slug: string; title: string; body_markdown: string;
    is_default: boolean; owner_id: string | null; created_from_template_id: string | null;
  }

  let { open = $bindable(false) } = $props<{ open?: boolean }>();

  function onSelect(e: CustomEvent<{ template: SessionTemplate }>) {
    window.dispatchEvent(new CustomEvent('session:start', {
      detail: { template: e.detail.template },
    }));
    open = false;
  }

  function close() { open = false; }
</script>

{#if open}
  <div class="overlay" onclick={close} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Neue Session starten">
      <header>
        <span>Neue Brainstorm-Session</span>
        <button type="button" onclick={close} aria-label="Schliessen">×</button>
      </header>
      <TemplatePicker ontemplate:select={onSelect} />
    </div>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex;
    align-items: center; justify-content: center; z-index: 1000; }
  .modal { background: #0b111c; border: 1px solid #243349; border-radius: 12px;
    max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; }
  header { display: flex; justify-content: space-between; align-items: center;
    padding: 0.75rem 1rem; border-bottom: 1px solid #1e2a3e; font-weight: 600; }
  header button { background: none; border: none; color: inherit; font-size: 1.4rem;
    cursor: pointer; }
</style>
```

- [ ] **Step 2: Build / Type-Check Gate**

Run: `cd website && npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -20`
Expected: keine neuen Errors bezueglich `SessionStart.svelte` oder `TemplatePicker.svelte`.

- [ ] **Step 3: Line-Budget-Check**

Run: `wc -l website/src/components/sessions/SessionStart.svelte`
Expected: < 500 (target ~60).

- [ ] **Step 4: Commit**

```bash
git add website/src/components/sessions/SessionStart.svelte
git commit -m "feat(website): add SessionStart modal integrating TemplatePicker [T000993]"
```

---

### Task 6: Verifikation — Final Gate

**Dateien:** keine (nur Verifikation).

- [ ] **Step 1: Targeted Tests fuer changed domains**

```bash
task test:changed
```

Expected: PASS — fuehrt vitest `--changed` aus (erfasst die neuen API- + Component- +
lib-Tests).

- [ ] **Step 2: Migration auf beiden Namespaces verifizieren (shared_changes)**

```bash
# Mentolder
kubectl exec -n workspace deploy/shared-db -- \
  psql -U website -d website -c "SELECT count(*) FROM sessions.templates WHERE is_default;"

# Korczewski
kubectl exec -n workspace-korczewski deploy/shared-db -- \
  psql -U website -d website -c "SELECT count(*) FROM sessions.templates WHERE is_default;"
```

Expected: jeweils `5` (5 Default-Templates pro Namespace).

- [ ] **Step 3: Freshness-Artifakte regenerieren**

```bash
task freshness:regenerate
```

Expected: regeneriert `website/src/data/test-inventory.json` (erfasst die neuen Tests)
und andere generierte Artefakte.

- [ ] **Step 4: Freshness + Quality Ratchet**

```bash
task freshness:check
```

Expected: PASS — keine S1 line-limit Regressionen, keine S2 import cycles,
keine S3 brand-domain Literals, keine S4 orphans.

- [ ] **Step 5: Regenerierte Artefakte committen**

```bash
git add website/src/data/test-inventory.json docs/code-quality/ docs/generated/ 2>/dev/null || true
git status --short
git commit -m "chore: regenerate freshness artifacts for sessions-brainstorm-templates [T000993]" || echo "nothing to regenerate"
```

---

## Implementierungsreihenfolge

1. Task 1 (DB-Migration) — muss zuerst laufen, da Tasks 2-4 die Tabelle voraussetzen
2. Task 2 (templates.ts + Tests) — nach Task 1
3. Task 3 (API-Routen) — nach Task 2
4. Task 4 (TemplatePicker) — nach Task 3 (Consumer der API)
5. Task 5 (SessionStart) — nach Task 4 (Consumer des Pickers)
6. Task 6 (Verifikation) — abschliessend

## Self-Review

**Spec coverage** — jeder Spec-Abschnitt mappt auf einen Task:
- DB-Tabelle `sessions.templates` mit 5 Defaults → Task 1
- CRUD-Logik + hardcoded Fallback → Task 2
- Vorlagen-Auswahl-UI → Task 4 (TemplatePicker) + Task 5 (SessionStart Modal)
- Clone-and-Edit → Task 2 (`cloneTemplate`) + Task 3 (POST-Route) + Task 4 (Clone-Button)
- Admin + gekko Auth → Task 3 (`authGuard` mit `isAdmin`)
- Edge Case: Custom-Vorlage loeschen → Task 2 (`deleteTemplate` owner-Check) + Task 3 (DELETE-Route)
- Edge Case: Default-Update laesst Clones unangetastet → Task 1 (separate Zeilen, `created_from_template_id` ist FK, keine Kaskade)
- Fallback bei DB nicht erreichbar → Task 2 (`catch` → `DEFAULT_TEMPLATES`)

**shared_changes:** Die Migration in Task 1 wird explizit auf beiden Namespaces
(`workspace` + `workspace-korczewski`) angewendet und in Task 6 Step 2 auf beiden
verifiziert. Jeder Namespace hat eine unabhaengige `website`-Datenbank.

**Type consistency:** `SessionTemplate` Interface ist identisch in Task 2
(`templates.ts`), Task 3 (API-Routen), Task 4 (TemplatePicker), und Task 5
(SessionStart). Event-Name `template:select` mit `detail: { template }` matcht
zwischen Task 4 (dispatch) und Task 5 (handler).
