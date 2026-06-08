---
title: Coaching Demo-Ready
ticket_id: T000534
domains: [website, infra, db, ops, test]
status: active
---

# Coaching Demo-Ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three targeted improvements that make the app demo-ready as a live coaching tool for a non-technical coach: a DB-seeded coaching-step template ("Beziehungsdynamik"), a double-click/badge entry point for the appearance drawer, and a one-time onboarding toast sequence on the Brett board.

**Architecture:** Feature 1 adds a new `brett.coaching_templates` table (SQL migration in `brett/src/server/migrations/`, auto-run on startup), an Express endpoint `GET /api/templates` on the Brett server, and lobby-client logic that prefills the existing coaching-steps textarea from a selected template. Features 2 and 3 are pure Brett-client (TypeScript + Three.js) changes — a new dblclick-on-figure path + floating badge, and a new `onboarding.ts` toast module gated to the `leiter` role.

**Tech Stack:** Node.js + TypeScript, Express, PostgreSQL (`pg` Pool), Three.js, `node:test` via `tsx` (NOT vitest — see Spec Corrections), BATS for server integration.

---

## Spec Corrections (read before starting)

Validation against the live code surfaced five mismatches between the spec and reality. The tasks below follow the **corrected** approach; this section records *why*.

1. **Brett tests use `node:test` (`tsx --test`), NOT vitest.** `brett/package.json` test script is `MOCK_DB=true tsx --test test/*.test.ts`. Brett-client unit tests in this plan are written with `import { test } from 'node:test'` + `node:assert`, placed in `brett/test/`. (The spec said "Vitest"; that is wrong for Brett.)

2. **`templateId` is already taken** — `state.settings.templateId` already means a **figure-snapshot/scenario template** (server fns `handleAdminSetTemplate`, `applyTemplateToRoom`, `loadSnapshotState`; D5/D6/D7). Reusing it for coaching-step text templates would collide. This plan introduces a **separate** field `coachingTemplateId` and fetches by it, leaving the existing `templateId` snapshot flow untouched.

3. **Migrations are not auto-run for the website.** `website/src/db/migrations/*.sql` are applied **manually via psql** (see header comments in existing migrations like `20260607_create_generation_jobs.sql`). The Brett server, however, **does** auto-run `.sql` files from `brett/src/server/migrations/` on startup (`runMigrations()` in `brett/src/server/db.ts`, idempotent via `IF NOT EXISTS`). Because Brett owns this table and has its own `DATABASE_URL` pool, the table is created as a **Brett migration** (`brett/src/server/migrations/002_coaching_templates.sql`) so it is created automatically on Brett startup. The seed runs in the same migration via `INSERT ... ON CONFLICT DO NOTHING`.

4. **There is no Brett-board session-create admin UI.** `website/src/pages/admin/coaching/sessions/new.astro` creates **KI coaching sessions** (client + KI provider), not Brett board sessions. Brett boards are created in-app via the lobby. Therefore the spec's "Website Admin Session-Erstellung: Dropdown" is **out of scope** for this plan (see Out of Scope). The template is selected **in the Brett lobby** instead (Task 4), which is where a coach actually sets up a board. The optional website read-only API endpoint is dropped — the Brett server serves templates directly.

5. **A `dblclick` handler already exists** at `brett/src/client/board-boot.ts:302` — it moves the selected figure to a floor point, or adds a figure if none is selected. The new "dblclick on a figure → open appearance drawer" must be layered onto that handler: if the dblclick lands **on a figure contact** (`pickContact`), open the drawer; otherwise fall through to the existing move/add behavior.

---

## File Structure

**Feature 1 — Demo Template:**
- Create: `brett/src/server/migrations/002_coaching_templates.sql` — table DDL + system seed (idempotent).
- Modify: `brett/src/server/index.ts` — add `GET /api/templates` and `GET /api/templates/:id` Express routes.
- Create: `brett/src/server/coaching-templates.ts` — pure-ish DB accessors (`listCoachingTemplates`, `getCoachingTemplate`).
- Modify: `brett/src/client/lobby-store.ts` — carry `coachingTemplateId` in settings.
- Modify: `brett/src/client/ui/lobby.ts` — prefill the coaching-steps textarea from the template when empty.
- Create: `brett/src/client/lobby-template-fill.ts` — pure helper deciding whether/what to prefill.
- Test: `brett/test/coaching-template-fill.test.ts` (node:test), `tests/integration/brett-templates.bats` (BATS).

**Feature 2 — Appearance entry points:**
- Modify: `brett/src/client/board-boot.ts` — dblclick-on-figure opens drawer; mount badge on selection.
- Create: `brett/src/client/ui/appearance-badge.ts` — floating screen-space badge (HTML overlay + Three.js projection).
- Test: `brett/test/appearance-badge.test.ts` (node:test).

**Feature 3 — Onboarding toasts:**
- Create: `brett/src/client/ui/onboarding.ts` — toast sequence + localStorage gate.
- Modify: `brett/src/client/board-boot.ts` — call `maybeStartOnboarding()` after scene mount, gated to `leiter`.
- Test: `brett/test/onboarding.test.ts` (node:test).

---

## Task 1: Coaching-templates DB migration + seed (Brett)

**Files:**
- Create: `brett/src/server/migrations/002_coaching_templates.sql`
- Reference: `brett/src/server/migrations/001_session_events.sql` (existing pattern), `brett/src/server/db.ts:100-112` (`runMigrations`)

- [ ] **Step 1: Write the migration + seed SQL**

Create `brett/src/server/migrations/002_coaching_templates.sql`. The Brett `DATABASE_URL` connects to the shared website DB, so prefix with the `brett` schema. Use `IF NOT EXISTS` and `ON CONFLICT DO NOTHING` so `runMigrations()` is safe on every startup.

```sql
-- 002_coaching_templates.sql
-- Coaching-step templates surfaced in the Brett lobby. Idempotent: safe to
-- re-run on every server startup (runMigrations in db.ts applies all *.sql).

CREATE SCHEMA IF NOT EXISTS brett;

CREATE TABLE IF NOT EXISTS brett.coaching_templates (
  id          TEXT PRIMARY KEY,
  brand       TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  steps       JSONB NOT NULL,           -- string[]
  is_system   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coaching_templates_brand_active_idx
  ON brett.coaching_templates (brand, is_active);

INSERT INTO brett.coaching_templates (id, brand, name, description, steps, is_system)
VALUES (
  'sys-beziehungsdynamik-familiensystem',
  'mentolder',
  'Beziehungsdynamik — Familiensystem',
  'Geführte Erst-Sitzung: Familiensystem aufstellen und reflektieren.',
  '[
    "Welche Personen gehören zu deinem System? Benenne jede Figur.",
    "Platziere dich selbst. Wo stehst du in diesem System?",
    "Platziere die anderen Personen. Wie nah oder weit sind sie zu dir?",
    "Welche Verbindungen bestehen? Ziehe Linien zwischen den Figuren.",
    "Welche Figur zieht deine Aufmerksamkeit am stärksten an?",
    "Was würde sich verschieben, wenn du eine Position veränderst?",
    "Was nimmst du aus dieser Konstellation mit?"
  ]'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Verify the SQL parses (dry, no DB needed)**

Run: `cd brett && node -e "require('fs').readFileSync('src/server/migrations/002_coaching_templates.sql','utf8'); console.log('readable')"`
Expected: prints `readable` (the real apply is tested in Task 3 BATS / at server startup).

- [ ] **Step 3: Commit**

```bash
git add brett/src/server/migrations/002_coaching_templates.sql
git commit -m "feat(brett): coaching_templates table + Beziehungsdynamik seed [T000534]"
```

---

## Task 2: Brett DB accessors for coaching templates

**Files:**
- Create: `brett/src/server/coaching-templates.ts`
- Reference: `brett/src/server/db.ts` (`getPool()`, `MockPoolLike`)
- Test: `brett/test/coaching-templates-db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `brett/test/coaching-templates-db.test.ts`. Inject a fake pool so the test is offline (`MOCK_DB`-style). Assert the accessors issue the expected query shape and map rows.

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { listCoachingTemplates, getCoachingTemplate } from '../src/server/coaching-templates';

function fakePool(rows: any[]) {
  const calls: { text: string; params?: unknown[] }[] = [];
  return {
    pool: {
      async query(text: string, params?: unknown[]) { calls.push({ text, params }); return { rows }; },
    } as any,
    calls,
  };
}

test('listCoachingTemplates filters by brand + active and maps steps', async () => {
  const { pool, calls } = fakePool([
    { id: 'a', brand: 'mentolder', name: 'N', description: 'D', steps: ['s1', 's2'], is_system: true },
  ]);
  const out = await listCoachingTemplates(pool, 'mentolder');
  assert.match(calls[0].text, /FROM brett\.coaching_templates/);
  assert.match(calls[0].text, /brand = \$1/);
  assert.match(calls[0].text, /is_active = true/);
  assert.deepStrictEqual(calls[0].params, ['mentolder']);
  assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(out[0].steps, ['s1', 's2']);
  assert.strictEqual(out[0].isSystem, true);
});

test('getCoachingTemplate returns null when absent', async () => {
  const { pool } = fakePool([]);
  const out = await getCoachingTemplate(pool, 'missing-id');
  assert.strictEqual(out, null);
});

test('getCoachingTemplate parses steps when returned as JSON string', async () => {
  const { pool } = fakePool([
    { id: 'x', brand: 'mentolder', name: 'N', description: null, steps: '["a","b"]', is_system: false },
  ]);
  const out = await getCoachingTemplate(pool, 'x');
  assert.deepStrictEqual(out!.steps, ['a', 'b']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd brett && npx tsx --test test/coaching-templates-db.test.ts`
Expected: FAIL — `Cannot find module '../src/server/coaching-templates'`.

- [ ] **Step 3: Write the implementation**

Create `brett/src/server/coaching-templates.ts`:

```ts
import type { MockPoolLike } from './db';
import type { Pool } from 'pg';

type AnyPool = Pool | MockPoolLike;

export interface CoachingTemplate {
  id: string;
  brand: string;
  name: string;
  description: string | null;
  steps: string[];
  isSystem: boolean;
}

function parseSteps(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  return [];
}

function rowToTemplate(row: Record<string, unknown>): CoachingTemplate {
  return {
    id: row.id as string,
    brand: row.brand as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    steps: parseSteps(row.steps),
    isSystem: row.is_system === true,
  };
}

export async function listCoachingTemplates(pool: AnyPool, brand: string): Promise<CoachingTemplate[]> {
  const { rows } = await pool.query(
    `SELECT id, brand, name, description, steps, is_system
       FROM brett.coaching_templates
      WHERE brand = $1 AND is_active = true
      ORDER BY is_system DESC, name`,
    [brand],
  );
  return rows.map(rowToTemplate);
}

export async function getCoachingTemplate(pool: AnyPool, id: string): Promise<CoachingTemplate | null> {
  const { rows } = await pool.query(
    `SELECT id, brand, name, description, steps, is_system
       FROM brett.coaching_templates
      WHERE id = $1 AND is_active = true`,
    [id],
  );
  return rows[0] ? rowToTemplate(rows[0]) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd brett && npx tsx --test test/coaching-templates-db.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add brett/src/server/coaching-templates.ts brett/test/coaching-templates-db.test.ts
git commit -m "feat(brett): coaching-template DB accessors + tests [T000534]"
```

---

## Task 3: Express endpoints `GET /api/templates` + `/:id`

**Files:**
- Modify: `brett/src/server/index.ts` (add routes near the other `app.get('/api/...')` handlers, e.g. after the `/api/snapshots` block ~line 234)
- Reference: `brett/src/server/index.ts:82` (`/api/config` shows the BRAND env access pattern), `getPool()` in `db.ts`
- Test: `tests/integration/brett-templates.bats`

- [ ] **Step 1: Write the failing BATS test**

Create `tests/integration/brett-templates.bats`. It validates that the route is wired (offline structural check + a live curl when the server is reachable). Follow the existing BATS style in `tests/` (skip when the server isn't up).

```bash
#!/usr/bin/env bats

# Brett coaching-templates API. Structural assertions run offline; the live
# curl is skipped unless BRETT_BASE_URL points at a running server.

@test "index.ts registers GET /api/templates route" {
  run grep -F "app.get('/api/templates'" brett/src/server/index.ts
  [ "$status" -eq 0 ]
}

@test "index.ts registers GET /api/templates/:id route" {
  run grep -F "app.get('/api/templates/:id'" brett/src/server/index.ts
  [ "$status" -eq 0 ]
}

@test "migration seeds the Beziehungsdynamik system template" {
  run grep -F "sys-beziehungsdynamik-familiensystem" brett/src/server/migrations/002_coaching_templates.sql
  [ "$status" -eq 0 ]
}

@test "live: GET /api/templates returns the seeded template" {
  [ -n "${BRETT_BASE_URL:-}" ] || skip "BRETT_BASE_URL not set"
  run curl -fsS "${BRETT_BASE_URL}/api/templates?brand=mentolder"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "Beziehungsdynamik"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bats tests/integration/brett-templates.bats`
Expected: the two `grep` route tests FAIL (routes not yet added); the migration test PASSES (Task 1); the live test is SKIPPED.

- [ ] **Step 3: Add the routes**

In `brett/src/server/index.ts`, add an import near the top alongside the other server-module imports:

```ts
import { listCoachingTemplates, getCoachingTemplate } from './coaching-templates';
```

Then add the routes after the `/api/snapshots/:id` handler (around line 244). Match the existing `asyncHandler` + `getPool()` pattern; default the brand to the configured `BRAND` env (same source `/api/config` uses):

```ts
// Coaching-step templates surfaced in the lobby. Public read (no admin gate) —
// they contain only generic coaching prompts, no client data.
app.get('/api/templates', asyncHandler(async (req: any, res: any) => {
  const brand = (req.query.brand as string) || process.env.BRAND || 'mentolder';
  const rows = await listCoachingTemplates(getPool() as any, brand);
  res.json(rows);
}));

app.get('/api/templates/:id', asyncHandler(async (req: any, res: any) => {
  const tpl = await getCoachingTemplate(getPool() as any, req.params.id);
  if (!tpl) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(tpl);
}));
```

> Note: confirm `asyncHandler` and `getPool` are already imported in `index.ts` (they are used by the existing `/api/snapshots` handlers). If `getPool` is not imported, add `import { getPool } from './db';` — but first grep, because `index.ts` re-exports db functions and may already pull it in.

- [ ] **Step 4: Run BATS to verify route tests pass**

Run: `bats tests/integration/brett-templates.bats`
Expected: 3 PASS (two route greps + migration), 1 SKIP (live).

- [ ] **Step 5: Typecheck the server**

Run: `cd brett && npx tsc --noEmit -p tsconfig.server.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add brett/src/server/index.ts tests/integration/brett-templates.bats
git commit -m "feat(brett): GET /api/templates endpoints [T000534]"
```

---

## Task 4: Lobby prefill from coaching template

**Files:**
- Create: `brett/src/client/lobby-template-fill.ts` (pure helper)
- Modify: `brett/src/client/lobby-store.ts` (carry `coachingTemplateId` in settings)
- Modify: `brett/src/client/ui/lobby.ts` (fetch + prefill the coaching-steps textarea when empty)
- Reference: `brett/src/client/ui/lobby.ts:138-153` (coaching-editor textarea, `dataset.role = 'coaching-editor'`), `brett/src/client/lobby-coaching.ts` (existing pure helper pattern)
- Test: `brett/test/coaching-template-fill.test.ts`

- [ ] **Step 1: Write the failing test for the pure helper**

Create `brett/test/coaching-template-fill.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { stepsToTextarea, shouldPrefill } from '../src/client/lobby-template-fill';

test('stepsToTextarea joins steps with newlines', () => {
  assert.strictEqual(stepsToTextarea(['a', 'b', 'c']), 'a\nb\nc');
  assert.strictEqual(stepsToTextarea([]), '');
});

test('shouldPrefill is true only when the textarea is empty/whitespace', () => {
  assert.strictEqual(shouldPrefill(''), true);
  assert.strictEqual(shouldPrefill('   \n  '), true);
  assert.strictEqual(shouldPrefill('existing'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd brett && npx tsx --test test/coaching-template-fill.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure helper**

Create `brett/src/client/lobby-template-fill.ts`:

```ts
// Pure helpers for prefilling the lobby coaching-steps textarea from a selected
// coaching template. No DOM/three imports → node/tsx-importable + unit-testable.

export function stepsToTextarea(steps: string[]): string {
  return (steps ?? []).join('\n');
}

/** Only prefill when the coach hasn't typed their own steps yet. */
export function shouldPrefill(currentValue: string): boolean {
  return (currentValue ?? '').trim().length === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd brett && npx tsx --test test/coaching-template-fill.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Carry `coachingTemplateId` in the lobby settings type/store**

In `brett/src/client/lobby-store.ts`, extend the `LobbySettings` type and the `lobby_settings_change` reducer. Find the `LobbySettings` interface (where `templateId?` is declared) and add:

```ts
  coachingTemplateId?: string;
```

In the `case 'lobby_settings_change':` block (around line 77-81), add — right after the existing `templateId` line:

```ts
      if (msg.coachingTemplateId !== undefined) settings.coachingTemplateId = msg.coachingTemplateId;
```

> This keeps the existing snapshot `templateId` field untouched (Spec Correction #2) and adds a parallel, independent field for coaching-step templates.

- [ ] **Step 6: Wire fetch + prefill into the lobby UI**

In `brett/src/client/ui/lobby.ts`, the coaching-editor textarea is created inside the `if (vm.canStart && handlers.onCoachingSteps)` block (around line 138-153), with `editor.dataset.role = 'coaching-editor'`. Immediately after `settingsPanel.append(label, editor, save);`, add a prefill fetch that respects `shouldPrefill`. Import the helpers at the top of the file:

```ts
import { stepsToTextarea, shouldPrefill } from '../lobby-template-fill';
```

Then after the `settingsPanel.append(...)` line add:

```ts
    // Prefill the coaching-steps editor from the selected coaching template,
    // but only if the coach hasn't already typed steps. Best-effort: a failed
    // fetch leaves the editor empty (coach types manually).
    const coachingTemplateId = vm.settings.coachingTemplateId;
    if (coachingTemplateId && shouldPrefill(editor.value)) {
      fetch(`/api/templates/${encodeURIComponent(coachingTemplateId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((tpl) => {
          if (tpl && Array.isArray(tpl.steps) && shouldPrefill(editor.value)) {
            editor.value = stepsToTextarea(tpl.steps);
          }
        })
        .catch(() => { /* leave empty */ });
    }
```

You must also surface `coachingTemplateId` on the lobby view-model. In `brett/src/client/ui/lobby.ts`, the `LobbyViewModel.settings` type (around line 26-28) declares `templateId?`. Add a sibling:

```ts
    coachingTemplateId?: string;
```

And in `buildLobbyViewModel` (the function that builds `settings` from `state.settings`, around line 60-63), add the mapping next to the existing `templateId`:

```ts
      coachingTemplateId: state.settings.coachingTemplateId,
```

- [ ] **Step 7: Typecheck the client**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add brett/src/client/lobby-template-fill.ts brett/test/coaching-template-fill.test.ts \
        brett/src/client/lobby-store.ts brett/src/client/ui/lobby.ts
git commit -m "feat(brett): prefill lobby coaching steps from template [T000534]"
```

---

## Task 5: Appearance badge module (Feature 2 — floating badge)

**Files:**
- Create: `brett/src/client/ui/appearance-badge.ts`
- Test: `brett/test/appearance-badge.test.ts`
- Reference: `brett/src/client/ui/appearance.ts:89` (`openAppearanceDrawer()` is exported, reads `STATE.selectedId`)

The badge is an HTML overlay positioned in screen-space. To keep it testable offline (no real DOM/WebGL), the module exposes a pure projection helper plus a thin DOM mount. Test the pure part with `node:test`; the DOM mount is exercised at runtime.

- [ ] **Step 1: Write the failing test for the pure projection helper**

Create `brett/test/appearance-badge.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { ndcToScreen, badgeVisible } from '../src/client/ui/appearance-badge';

test('ndcToScreen maps NDC [-1,1] to pixel coordinates', () => {
  // Center of NDC maps to center of viewport.
  assert.deepStrictEqual(ndcToScreen(0, 0, 800, 600), { x: 400, y: 300 });
  // Top-right NDC (1,1) maps to (width, 0) — y is flipped.
  assert.deepStrictEqual(ndcToScreen(1, 1, 800, 600), { x: 800, y: 0 });
  // Bottom-left NDC (-1,-1) maps to (0, height).
  assert.deepStrictEqual(ndcToScreen(-1, -1, 800, 600), { x: 0, y: 600 });
});

test('badgeVisible requires a selection and an on-screen, in-front projection', () => {
  assert.strictEqual(badgeVisible('fig-1', 0.5), true);   // selected, in front (z<1)
  assert.strictEqual(badgeVisible(null, 0.5), false);     // no selection
  assert.strictEqual(badgeVisible('fig-1', 1.5), false);  // behind camera (z>1)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd brett && npx tsx --test test/appearance-badge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the badge module**

Create `brett/src/client/ui/appearance-badge.ts`:

```ts
import * as THREE from 'three';
import { STATE } from '../state';
import { openAppearanceDrawer } from './appearance';

export interface ScreenPoint { x: number; y: number; }

/** Map normalized device coords (x,y in [-1,1]) to pixel coords (y flipped). */
export function ndcToScreen(ndcX: number, ndcY: number, width: number, height: number): ScreenPoint {
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (1 - (ndcY * 0.5 + 0.5)) * height,
  };
}

/** Badge shows only for a current selection that projects in front of the camera. */
export function badgeVisible(selectedId: string | null, ndcZ: number): boolean {
  if (!selectedId) return false;
  return ndcZ < 1; // z>=1 means at/behind the far plane / behind camera
}

let badgeEl: HTMLDivElement | null = null;

function ensureBadge(): HTMLDivElement {
  if (badgeEl) return badgeEl;
  const el = document.createElement('div');
  el.id = 'appearance-badge';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', 'Aussehen bearbeiten');
  el.textContent = '🙂 ✏️';
  Object.assign(el.style, {
    position: 'fixed',
    transform: 'translate(-50%, -130%)',
    padding: '4px 8px',
    borderRadius: '999px',
    background: 'rgba(20,22,18,0.85)',
    color: '#e7ead0',
    fontSize: '13px',
    cursor: 'pointer',
    zIndex: '40',
    pointerEvents: 'auto',
    userSelect: 'none',
    display: 'none',
  } as CSSStyleDeclaration);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openAppearanceDrawer();
    hideBadge();
  });
  document.body.appendChild(el);
  badgeEl = el;
  return el;
}

export function hideBadge(): void {
  if (badgeEl) badgeEl.style.display = 'none';
}

/**
 * Reposition (or hide) the badge each frame. Call from the render loop.
 * `getFig` resolves the selected figure's world anchor (e.g. head position).
 */
export function updateBadge(
  camera: THREE.Camera,
  renderer: { domElement: HTMLCanvasElement },
  getAnchor: (figId: string) => THREE.Vector3 | null,
): void {
  const el = ensureBadge();
  const id = STATE.selectedId;
  const drawerOpen = document.getElementById('appearance-drawer')?.classList.contains('open');
  if (!id || drawerOpen) { el.style.display = 'none'; return; }
  const anchor = getAnchor(id);
  if (!anchor) { el.style.display = 'none'; return; }
  const v = anchor.clone().project(camera);
  if (!badgeVisible(id, v.z)) { el.style.display = 'none'; return; }
  const rect = renderer.domElement.getBoundingClientRect();
  const p = ndcToScreen(v.x, v.y, rect.width, rect.height);
  el.style.left = `${rect.left + p.x}px`;
  el.style.top = `${rect.top + p.y}px`;
  el.style.display = 'block';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd brett && npx tsx --test test/appearance-badge.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/appearance-badge.ts brett/test/appearance-badge.test.ts
git commit -m "feat(brett): floating appearance badge module [T000534]"
```

---

## Task 6: Wire dblclick-on-figure + badge into board-boot

**Files:**
- Modify: `brett/src/client/board-boot.ts` (dblclick handler ~line 302; render loop; mount badge)
- Reference: `brett/src/client/board-boot.ts:302-311` (existing dblclick), `brett/src/client/ui/appearance.ts:89` (`openAppearanceDrawer`), `mannequin.pickContact` / `mannequin.pickFloor` usage in board-boot

This task has no new unit test (it is DOM/WebGL wiring already covered by Task 5's pure tests). Verify via typecheck + manual runtime note in the PR.

- [ ] **Step 1: Extend the existing dblclick handler to open the drawer on a figure hit**

In `brett/src/client/board-boot.ts`, the dblclick handler (line 302) currently does `pickFloor` → move/add. Add a `pickContact` check **first** so dblclick on a figure opens the appearance drawer instead. Import the drawer + badge at the top of `board-boot.ts` (next to the existing `import * as appearance from './ui/appearance';`):

```ts
import * as appearanceBadge from './ui/appearance-badge';
```

Replace the dblclick handler body (lines 302-311) with:

```ts
  renderer.domElement.addEventListener('dblclick', (e) => {
    // Feature 2: dblclick on a figure → open the appearance drawer directly.
    const contact = mannequin.pickContact(e);
    if (contact) {
      const fig = STATE.figures.find(f => f.id === contact.userData.figureId);
      if (fig) {
        // Honor existing lock rules: only the holder (or unlocked) may edit.
        const lock = activeLocks.get(fig.id);
        if (lock && lock.userId !== currentUser.userId) return;
        figPanel.selectFigure(fig.id);
        appearance.openAppearanceDrawer();
        appearanceBadge.hideBadge();
      }
      return;
    }
    // No figure hit → existing behavior: move selected figure / add a new one.
    const floorPt = mannequin.pickFloor(e);
    if (!floorPt) return;
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig) {
      easeFigure(fig, floorPt.x, floorPt.z, 300);
    } else {
      figPanel.addFigure({ x: floorPt.x, z: floorPt.z });
    }
  });
```

- [ ] **Step 2: Drive the badge from the render loop**

Find the per-frame tick/render callback in `board-boot.ts` (search for where `renderer.render(` is called or the `requestAnimationFrame` tick). Add a badge update each frame. The anchor resolver returns the selected figure's head world-position (fall back to root if no head mesh):

```ts
    appearanceBadge.updateBadge(camera, renderer, (figId) => {
      const fig = STATE.figures.find(f => f.id === figId);
      if (!fig) return null;
      const v = new THREE.Vector3();
      const src = fig.headMesh ?? fig.root;
      src.getWorldPosition(v);
      v.y += 0.15; // float just above the head
      return v;
    });
```

> If the render loop lives in `scene.ts` rather than `board-boot.ts`, expose a hook: add a `onTick` callback param to the scene tick and pass the badge update from board-boot. Grep for `requestAnimationFrame` / `renderer.render(` to locate the single tick site before editing.

- [ ] **Step 3: Hide the badge when selection clears**

`figPanel.selectFigure(null)` already runs on deselect paths. Add a guard so the badge hides immediately on the existing deselect in `board-boot.ts` (the click handler at line 276 / the `STATE.selectedId = null` sites). After any `figPanel.selectFigure(null)` or `STATE.selectedId = null` you add/touch, the next `updateBadge` frame hides it automatically (it checks `STATE.selectedId`). No extra code needed beyond Step 2 — confirm by reading `updateBadge`'s early return.

- [ ] **Step 4: Typecheck the client**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/board-boot.ts
git commit -m "feat(brett): dblclick figure opens appearance drawer + badge [T000534]"
```

---

## Task 7: Onboarding toast sequence (Feature 3)

**Files:**
- Create: `brett/src/client/ui/onboarding.ts`
- Test: `brett/test/onboarding.test.ts`
- Reference: spec Feature 3 toast copy; localStorage key `brett_onboarding_v1`

The toast logic is testable with a fake `localStorage` + a minimal DOM stub. Brett tests run under `tsx` (node) with no DOM, so the module takes injectable `storage` and `doc` dependencies (defaulting to the real globals at runtime) to stay unit-testable.

- [ ] **Step 1: Write the failing test**

Create `brett/test/onboarding.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { maybeStartOnboarding, ONBOARDING_KEY, TOASTS } from '../src/client/ui/onboarding';

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    _map: m,
  };
}

// Minimal DOM stub: records created elements + appended children.
function fakeDoc() {
  const appended: any[] = [];
  function makeEl(): any {
    return {
      className: '', textContent: '', style: {}, children: [] as any[],
      dataset: {} as Record<string, string>,
      _listeners: {} as Record<string, () => void>,
      setAttribute() {}, appendChild(c: any) { this.children.push(c); },
      addEventListener(ev: string, fn: () => void) { this._listeners[ev] = fn; },
      remove() { this._removed = true; },
      querySelector() { return null; },
    };
  }
  return {
    appended,
    createElement: () => makeEl(),
    body: { appendChild(c: any) { appended.push(c); }, },
    getElementById: () => null,
  };
}

test('TOASTS has the three spec steps with the final confirm label', () => {
  assert.strictEqual(TOASTS.length, 3);
  assert.match(TOASTS[0].title, /Figur hinzufügen/);
  assert.strictEqual(TOASTS[0].button, 'Weiter →');
  assert.strictEqual(TOASTS[2].button, 'Verstanden ✓');
});

test('does nothing when role is not leiter', () => {
  const storage = fakeStorage();
  const doc: any = fakeDoc();
  maybeStartOnboarding({ role: 'klient', storage, doc, delayMs: 0 });
  assert.strictEqual(doc.appended.length, 0);
  assert.strictEqual(storage.getItem(ONBOARDING_KEY), null);
});

test('does nothing when the key is already set', () => {
  const storage = fakeStorage({ [ONBOARDING_KEY]: '1' });
  const doc: any = fakeDoc();
  maybeStartOnboarding({ role: 'leiter', storage, doc, delayMs: 0 });
  assert.strictEqual(doc.appended.length, 0);
});

test('mounts the first toast for a leiter without the key', () => {
  const storage = fakeStorage();
  const doc: any = fakeDoc();
  maybeStartOnboarding({ role: 'leiter', storage, doc, delayMs: 0 });
  assert.strictEqual(doc.appended.length, 1);
});

test('advancing through all toasts sets the localStorage key', () => {
  const storage = fakeStorage();
  const doc: any = fakeDoc();
  maybeStartOnboarding({ role: 'leiter', storage, doc, delayMs: 0 });
  // Click "Weiter/Verstanden" on each mounted toast in turn.
  for (let i = 0; i < TOASTS.length; i++) {
    const toast = doc.appended[doc.appended.length - 1];
    // find the button element among descendants and fire its click listener
    const btn = findButton(toast);
    assert.ok(btn, `toast ${i} has a button`);
    btn._listeners.click();
  }
  assert.strictEqual(storage.getItem(ONBOARDING_KEY), '1');
});

function findButton(el: any): any {
  if (el?.dataset?.role === 'onboarding-next') return el;
  for (const c of el?.children ?? []) {
    const found = findButton(c);
    if (found) return found;
  }
  return null;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd brett && npx tsx --test test/onboarding.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the onboarding module**

Create `brett/src/client/ui/onboarding.ts`:

```ts
// Feature 3 — one-time onboarding toast sequence for the board leader (coach).
// Plain DOM/CSS, no external tour library. Dependency-injected storage + doc so
// it is unit-testable under node:test (no real DOM at test time).

export const ONBOARDING_KEY = 'brett_onboarding_v1';

export interface ToastSpec {
  title: string;
  text: string;
  highlightId?: string; // element to outline (best-effort), optional
  button: string;
}

export const TOASTS: ToastSpec[] = [
  {
    title: 'Figur hinzufügen',
    text: 'Klicke auf das + Icon, um eine Figur ins Brett zu setzen.',
    highlightId: 'fig-panel-btn',
    button: 'Weiter →',
  },
  {
    title: 'Emotion wählen',
    text: 'Doppelklicke eine Figur, um ihr ein Gesicht und Accessory zuzuweisen.',
    button: 'Weiter →',
  },
  {
    title: 'Verbindung ziehen',
    text: 'Halte eine Figur gedrückt und ziehe zu einer anderen, um eine Verbindung zu erstellen.',
    button: 'Verstanden ✓',
  },
];

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; }
interface DocLike {
  createElement(tag: string): any;
  body: { appendChild(el: any): void };
  getElementById(id: string): any;
}

export interface OnboardingDeps {
  role: string | null | undefined;
  storage?: StorageLike;
  doc?: DocLike;
  delayMs?: number;
}

export function maybeStartOnboarding(deps: OnboardingDeps): void {
  const storage = deps.storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  const doc = deps.doc ?? (typeof document !== 'undefined' ? (document as unknown as DocLike) : null);
  if (!storage || !doc) return;
  if (deps.role !== 'leiter') return;
  if (storage.getItem(ONBOARDING_KEY)) return;

  const delay = deps.delayMs ?? 1000;
  const start = () => mountToast(0, storage, doc);
  if (delay > 0 && typeof setTimeout !== 'undefined') setTimeout(start, delay);
  else start();
}

function mountToast(index: number, storage: StorageLike, doc: DocLike): void {
  if (index >= TOASTS.length) return;
  const spec = TOASTS[index];

  const card = doc.createElement('div');
  card.className = 'brett-onboarding-toast';
  card.dataset.role = 'onboarding-toast';
  Object.assign(card.style, {
    position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
    maxWidth: '320px', padding: '14px 16px', borderRadius: '12px',
    background: 'rgba(20,22,18,0.88)', color: '#fff', zIndex: '60',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)', fontSize: '14px', lineHeight: '1.4',
  });

  const h = doc.createElement('div');
  h.style.fontWeight = '600';
  h.style.marginBottom = '6px';
  h.textContent = `${spec.title}  (${index + 1}/${TOASTS.length})`;
  card.appendChild(h);

  const p = doc.createElement('div');
  p.textContent = spec.text;
  p.style.marginBottom = '10px';
  card.appendChild(p);

  const btn = doc.createElement('button');
  btn.dataset.role = 'onboarding-next';
  btn.textContent = spec.button;
  Object.assign(btn.style, {
    background: '#e7ead0', color: '#141612', border: 'none',
    padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
  });
  btn.addEventListener('click', () => {
    card.remove();
    if (index + 1 < TOASTS.length) {
      mountToast(index + 1, storage, doc);
    } else {
      storage.setItem(ONBOARDING_KEY, '1');
    }
  });
  card.appendChild(btn);

  doc.body.appendChild(card);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd brett && npx tsx --test test/onboarding.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/onboarding.ts brett/test/onboarding.test.ts
git commit -m "feat(brett): one-time onboarding toast sequence [T000534]"
```

---

## Task 8: Trigger onboarding from board-boot (leiter only)

**Files:**
- Modify: `brett/src/client/board-boot.ts` (after scene mount; resolve role from lobby roster)
- Reference: `brett/src/client/board-boot.ts:202` (`wsClient.getLobbyState()?.roster?.[currentUser.userId]?.role` is the established role lookup)

- [ ] **Step 1: Import + call `maybeStartOnboarding` after the board is up**

In `brett/src/client/board-boot.ts`, add the import near the other UI imports:

```ts
import { maybeStartOnboarding } from './ui/onboarding';
```

At the end of `bootBoard()` (after the scene + UI are initialized — place it after `appearance.initAppearance();` or the last UI init call), resolve the role the same way the freeze-gate does and start onboarding:

```ts
  // Feature 3: one-time onboarding for the coach (leiter). Delayed so the scene
  // is visible first. No-op if already seen (localStorage) or non-leiter.
  const myRole = wsClient.getLobbyState()?.roster?.[currentUser.userId]?.role;
  maybeStartOnboarding({ role: myRole });
```

> Role from the roster can be `undefined` early if the lobby state hasn't synced. The freeze-gate uses the same lookup and tolerates that; onboarding is best-effort and simply no-ops when role isn't `leiter`. If runtime testing shows the role is consistently late, gate the call behind the same readiness signal the freeze-gate relies on — but do not add a new sync mechanism (YAGNI).

- [ ] **Step 2: Typecheck the client**

Run: `cd brett && npx tsc --noEmit -p tsconfig.client.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add brett/src/client/board-boot.ts
git commit -m "feat(brett): start onboarding for leiter on board boot [T000534]"
```

---

## Task 9: Full verification + deploy notes

**Files:** none (verification only)

- [ ] **Step 1: Run the full Brett test suite**

Run: `cd brett && npm test`
Expected: all `test/*.test.ts` pass, including the 4 new files (`coaching-templates-db`, `coaching-template-fill`, `appearance-badge`, `onboarding`).

- [ ] **Step 2: Run both Brett typecheck targets**

Run: `cd brett && npm run typecheck`
Expected: no errors (client + server).

- [ ] **Step 3: Run the new BATS test**

Run: `bats tests/integration/brett-templates.bats`
Expected: 3 PASS, 1 SKIP (live).

- [ ] **Step 4: Run the repo offline test suite (catches inventory/manifest regressions)**

Run: `task test:all`
Expected: green. If a test-inventory diff is reported, regenerate (`task test:inventory`) and commit the updated `website/src/data/test-inventory.json`.

- [ ] **Step 5: Confirm migration auto-applies (runtime note for the PR)**

The table + seed are created automatically on Brett startup via `runMigrations()` (`brett/src/server/db.ts`). No manual `psql` step is required for Brett. Record in the PR body that the migration is idempotent and runs on the next `task feature:brett` deploy.

- [ ] **Step 6: Commit any remaining changes (e.g. regenerated inventory) and prepare PR**

```bash
git add -A
git commit -m "chore(brett): verification artifacts for coaching demo-ready [T000534]"
```

> Deploy is **not** part of this plan. When ready, the demo brand is deployed via `task feature:brett` (builds + pushes + rolls out on both brands) from a fresh tree off `origin/main`. Verify post-deploy with `kubectl exec` that the seed row exists: `SELECT id,name FROM brett.coaching_templates WHERE brand='mentolder';`.

---

## Self-Review Notes (coverage map)

- **Feature 1 (Demo Template):** Task 1 (table + seed migration), Task 2 (DB accessors), Task 3 (API endpoints + BATS), Task 4 (lobby prefill + Vitest→node:test). Spec's website read-API + admin dropdown are intentionally dropped/deferred (Spec Correction #4, Out of Scope) because no Brett-board session-create admin UI exists and Brett serves templates directly.
- **Feature 2 (Appearance entry points):** Task 5 (badge module + tests), Task 6 (dblclick-on-figure + badge wiring). Existing `appearance-btn` and single-click select are untouched (spec scope-abgrenzung honored). The pre-existing dblclick move/add behavior is preserved as the no-figure-hit fallback (Spec Correction #5).
- **Feature 3 (Onboarding):** Task 7 (module + tests: appears without key, not with key, sets key after final toast), Task 8 (leiter-gated trigger from board-boot). LocalStorage key `brett_onboarding_v1`, 3 toasts with exact spec copy, plain DOM, no tour library.
- **Tests:** Brett unit tests use `node:test` (corrected from spec's "Vitest"). BATS covers the seed + route wiring + live endpoint.

## Out of Scope (from spec + corrections)

- Client-Portal / Klient-Login.
- Session-Export / PDF-Zusammenfassung.
- Mobile-Optimierung.
- Template-Editor in Admin-UI (seed only, no CRUD).
- Website read-through API `GET /api/brett/templates` and an admin **session-create** dropdown — there is no Brett-board session-create admin UI to host it (Spec Correction #4); coaching templates are selected in the Brett lobby. A future `coachingTemplateId` selector in the lobby UI (vs. only honoring a pre-set value) can be added later if needed.
