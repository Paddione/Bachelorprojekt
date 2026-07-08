---
title: "coaching-sessions-admin-ux — Implementation Plan"
ticket_id: T001638
domains: [website, database]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# coaching-sessions-admin-ux — Implementation Plan

_Ticket: T001638_

> **For agentic workers:** Use `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Implement tasks in order; each ends
> with an independently testable deliverable.

**Goal:** Vier UX-/Hygiene-Lücken der Coaching-Sessions-Funktion schließen:
einheitliches Adminmenü, Popout-Fenster, konsistentes "Session"-Wording und
Testdaten-Bereinigung inklusive Purge-Funktion.

**Architecture:** Astro/Svelte-Frontend-Änderungen plus eine additive
PostgreSQL-Spalte. Der Popout nutzt einen puren Helper (`window.open`-Kapselung)
und eine chrome-lose Route, die dieselbe `SessionWizard`-Komponente rendert wie
die eingebettete Detailseite — keine GUI-Duplikation. Die Testdaten-Hygiene
folgt dem T001453-Muster (`is_test_data`-Flag + flag-basierte Purge-Funktion).

**Tech Stack:** Astro 5, Svelte 5, TypeScript, PostgreSQL 16, BATS, Vitest (pg-mem).

## Global Constraints

- S1-Zeilenbudgets pro Datei einhalten (Tabelle unten). `helpContent.ts` hat
  Budget 0 (baseline 923) — die Wording-Änderung MUSS netto zeilenneutral sein.
- Keine Brand-Domain-Literale (`*.mentolder.de` / `*.korczewski.de`) in Code —
  Hostnamen kommen aus `process.env` / ConfigMap (S3).
- `popout.ts` bleibt ein pures Modul ohne Rück-Import auf DB-/API-Schichten (S2).
- Keine Erhöhung der `any`-Anzahl in `website/src` (CQ02) — alle neuen Symbole typisiert.
- Spaltenliste `coaching.sessions` vor der Migration live gegen `shared-db`
  verifizieren (intel.json `risks[]`, warn) — als Step in Task 4 enthalten.

## File Structure

Budgets = wirksame S1-Schwelle − Ist-Zeilen (verifiziert per `wc -l`; alle
bestehenden Dateien sind nicht-baselined außer `helpContent.ts`).

| File | LOC | S1 budget |
|------|-----|-----------|
| `website/src/components/admin/AdminSidebarNav.astro` | 180 | 220 |
| `website/src/pages/admin.astro` | 187 | 213 |
| `website/src/lib/helpContent.ts` | 923 | 0 |
| `website/src/lib/coaching-session-db.ts` | 467 | 133 |

Weitere betroffene Dateien (mit `[id]`-Segment / neu → nicht S1-claim-geprüft):

- `website/src/pages/admin/coaching/sessions/[id].astro` — LOC 247, Budget 153
  (Popout-Steuerung ergänzen).
- `website/src/pages/api/admin/inbox/[id]/action.ts` — LOC 263, Budget 337 (Wording).
- `website/src/components/admin/coaching/SessionWizard.svelte` — LOC 367, Budget
  133 — NICHT ändern (der Popout-Button gehört in `[id].astro`, nicht in den Wizard).
- `website/src/pages/admin/coaching/sessions/[id]/popout.astro` — neu, Limit 400.
- `website/src/lib/popout.ts` — neu, Limit 600.
- `scripts/migrations/2026-07-08-coaching-is-test-data.sql` — neu (Migration).
- `scripts/one-shot/purge-fn-v6.sql` — neu (Purge-Funktion v6, basiert auf v5).
- `tests/spec/coaching-sessions-polish-guide.bats` — neu (BATS-Struktur-Assertions).
- `website/src/lib/coaching-session-db.test.ts` — erweitern (Vitest `isTestData`).

Delta-Specs (bereits geschrieben, nur zur Referenz):
`openspec/changes/coaching-sessions-admin-ux/specs/coaching-sessions-polish-guide.md`,
`openspec/changes/coaching-sessions-admin-ux/specs/admin-nav-accordion.md`.

---

### Task 1: Adminmenü-Vereinheitlichung

**Files:**
- Create: `tests/spec/coaching-sessions-polish-guide.bats`
- Modify: `website/src/components/admin/AdminSidebarNav.astro`
- Modify: `website/src/pages/admin.astro:66`

**Interfaces:**
- Consumes: `NavItem` interface — `{ href: string; label: string; icon: string; matches?: string[]; badge?: number; external?: boolean }` (in `AdminSidebarNav.astro`; `icon` is a string key into `admin-icons`, e.g. `'clipboard'`).
- Produces: sidebar route `/admin/coaching/sessions` addressable via a dedicated "Sessions" item; dashboard tile label `'Sessions'`.

- [x] **Step 1: Write the failing BATS test.** Create `tests/spec/coaching-sessions-polish-guide.bats`:

```bash
#!/usr/bin/env bats
# tests/spec/coaching-sessions-polish-guide.bats
# SSOT: openspec/specs/coaching-sessions-polish-guide.md + admin-nav-accordion.md
# Structural assertions for the coaching-sessions-admin-ux change (T001638).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  WEB="$REPO_ROOT/website/src"
}

@test "sidebar has a Sessions nav item in Geschäft section" {
  run grep -qF "{ href: '/admin/coaching/sessions', label: 'Sessions'" "$WEB/components/admin/AdminSidebarNav.astro"
  [ "$status" -eq 0 ]
}

@test "Studio nav item no longer matches the sessions path" {
  run grep -qF "matches: ['/admin/coaching/studio', '/admin/fragebogen']" "$WEB/components/admin/AdminSidebarNav.astro"
  [ "$status" -eq 0 ]
}

@test "dashboard tile label reads Sessions not Sitzungen" {
  run grep -qF "label: 'Sessions'" "$WEB/pages/admin.astro"
  [ "$status" -eq 0 ]
  run grep -qF "label: 'Sitzungen'" "$WEB/pages/admin.astro"
  [ "$status" -ne 0 ]
}
```

- [x] **Step 2: Run the test to verify it fails.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/coaching-sessions-polish-guide.bats
# expected: FAIL — sidebar item, studio matches, and dashboard label not yet changed
```

- [x] **Step 3: Add the Sessions nav item and repoint Studio matches.** In
      `AdminSidebarNav.astro`, in the `Geschäft` section `items` array, add the
      new item after the `Studio` entry and drop `/admin/coaching/sessions`
      from Studio's `matches`:

```astro
      { href: '/admin/coaching/studio',     label: 'Studio',     icon: 'clipboard', matches: ['/admin/coaching/studio', '/admin/fragebogen'] },
      { href: '/admin/coaching/sessions',   label: 'Sessions',   icon: 'clipboard', matches: ['/admin/coaching/sessions'] },
```

- [x] **Step 4: Rename the dashboard tile.** In `admin.astro:66`, change the
      coaching tile label from `'Sitzungen'` to `'Sessions'` (href stays
      `/admin/coaching/sessions`):

```astro
  { href: '/admin/coaching/sessions',        label: 'Sessions',    icon: icons.clipboard, color: 'var(--brass)' },
```

- [x] **Step 5: Run the test to verify it passes.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/coaching-sessions-polish-guide.bats
# expected: PASS for the three menu assertions
```

- [x] **Step 6: Commit.**

```bash
git add tests/spec/coaching-sessions-polish-guide.bats website/src/components/admin/AdminSidebarNav.astro website/src/pages/admin.astro
git commit -m "feat(admin): unify coaching sessions nav entry and dashboard tile"
```

---

### Task 2: Popout-GUI

**Files:**
- Create: `website/src/lib/popout.ts`
- Create: `website/src/pages/admin/coaching/sessions/[id]/popout.astro`
- Modify: `website/src/pages/admin/coaching/sessions/[id].astro`
- Modify: `tests/spec/coaching-sessions-polish-guide.bats` (append assertions)

**Interfaces:**
- Consumes: `SessionWizard.svelte` props `{ sessionId: string; initialSession: Session; providerName: string }`; auth helpers `getSession`, `getLoginUrl`, `isAdmin` from `lib/auth`; `getSession` from `lib/coaching-session-db`; `listKiProviders` from `lib/coaching-ki-config-db`; `pool` from `lib/website-db`.
- Produces: `openPopout(url: string, name: string, opts?: PopoutOptions): Window | null` (pure DOM helper).

**Design note (Popout-Sicherheit, Trade-off):** `window.open` mit dem
String-Feature `noopener` liefert per Spezifikation immer `null` und würde die
Popup-Blocker-Erkennung sowie das Fokussieren eines bereits offenen Fensters
unmöglich machen. Deshalb wird der Opener stattdessen nach dem Öffnen via
`win.opener = null` getrennt (noopener-äquivalente Absicherung), der
Fensterhandle aber behalten — so bleibt `null` ein eindeutiges
Popup-Blocker-Signal für den Same-Tab-Fallback.

- [x] **Step 1: Write the failing BATS assertions.** Append to
      `tests/spec/coaching-sessions-polish-guide.bats`:

```bash
@test "popout helper exports openPopout" {
  run grep -qE "export function openPopout" "$WEB/lib/popout.ts"
  [ "$status" -eq 0 ]
}

@test "popout route exists and renders SessionWizard" {
  [ -f "$WEB/pages/admin/coaching/sessions/[id]/popout.astro" ]
  run grep -qF "SessionWizard" "$WEB/pages/admin/coaching/sessions/[id]/popout.astro"
  [ "$status" -eq 0 ]
}

@test "session detail page wires a popout control" {
  run grep -qF "openPopout" "$WEB/pages/admin/coaching/sessions/[id].astro"
  [ "$status" -eq 0 ]
}
```

- [x] **Step 2: Run to verify the new assertions fail.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/coaching-sessions-polish-guide.bats
# expected: FAIL — popout helper, route, and control do not exist yet
```

- [x] **Step 3: Create the pure popout helper.** Write `website/src/lib/popout.ts`:

```typescript
export interface PopoutOptions {
  width?: number;
  height?: number;
}

/**
 * Open `url` in a named popup window, then sever the opener reference
 * (noopener-equivalent security while keeping the window handle). Focuses an
 * already-open window of the same name. If the popup blocker suppresses the
 * window (`window.open` returns null), fall back to same-tab navigation.
 */
export function openPopout(url: string, name: string, opts: PopoutOptions = {}): Window | null {
  const width = opts.width ?? 1100;
  const height = opts.height ?? 800;
  const win = window.open(url, name, `popup,width=${width},height=${height}`);
  if (win) {
    win.opener = null;
    win.focus();
    return win;
  }
  window.location.assign(url);
  return null;
}
```

- [x] **Step 4: Create the chrome-less popout route.** Write
      `website/src/pages/admin/coaching/sessions/[id]/popout.astro` (same guard
      and data load as `[id].astro`, but no `AdminLayout`):

```astro
---
import SessionWizard from '../../../../../components/admin/coaching/SessionWizard.svelte';
import { getSession as getAuthSession, getLoginUrl, isAdmin } from '../../../../../lib/auth';
import { getSession as getCoachingSession } from '../../../../../lib/coaching-session-db';
import { listKiProviders } from '../../../../../lib/coaching-ki-config-db';
import { pool } from '../../../../../lib/website-db';

const authSession = await getAuthSession(Astro.request.headers.get('cookie'));
if (!authSession) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(authSession)) return Astro.redirect('/admin');

const brand = process.env.BRAND || 'mentolder';
const id = Astro.params.id as string;
let coachingSession = null;
try { coachingSession = await getCoachingSession(pool, id); } catch { /* ignore */ }
if (!coachingSession) return Astro.redirect('/admin/coaching/sessions');

let kiProviders: { id: number; displayName: string; provider: string; isActive: boolean }[] = [];
try { kiProviders = await listKiProviders(pool, brand); } catch { /* ignore */ }

const providerName = kiProviders.find(p => p.id === coachingSession.kiConfigId)?.provider
  ?? kiProviders.find(p => p.isActive)?.provider ?? 'claude';
---

<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Session: {coachingSession.title}</title>
  </head>
  <body class="popout-body">
    <main class="popout-main">
      <SessionWizard
        sessionId={id}
        initialSession={coachingSession}
        providerName={providerName}
        client:load
      />
    </main>
  </body>
</html>

<style is:global>
  :root { color-scheme: dark; }
  body.popout-body { margin: 0; background: var(--bg-dark, #111); color: var(--text-light, #f0f0f0); font-family: system-ui, sans-serif; }
  .popout-main { max-width: 800px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
</style>
```

- [x] **Step 5: Wire the Popout control into the detail page.** In
      `[id].astro`, add the link inside the `.crumbs` nav (after the breadcrumb
      trail, still within the `<nav class="crumbs">`):

```astro
      <a id="popout-link" href={`/admin/coaching/sessions/${id}/popout`} class="popout-link">Popout ↗</a>
```

      Then, at the top of the existing `<script>` block, import the helper and
      bind the click handler (progressive enhancement — the plain link still
      works without JS):

```typescript
  import { openPopout } from '../../../../lib/popout';

  document.getElementById('popout-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const sid = window.location.pathname.split('/').at(-1);
    openPopout(`/admin/coaching/sessions/${sid}/popout`, 'coaching-session-popout');
  });
```

- [x] **Step 6: Run the assertions to verify they pass.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/coaching-sessions-polish-guide.bats
# expected: PASS for the popout assertions
```

- [x] **Step 7: Commit.**

```bash
git add website/src/lib/popout.ts "website/src/pages/admin/coaching/sessions/[id]/popout.astro" "website/src/pages/admin/coaching/sessions/[id].astro" tests/spec/coaching-sessions-polish-guide.bats
git commit -m "feat(coaching): add session popout window and reusable openPopout helper"
```

<!-- vitest: kein neuer Vitest-Test nötig für popout.ts — window.open/DOM ist Browser-Verhalten und wird strukturell per BATS + E2E abgedeckt; pg-mem/vitest kann window nicht sinnvoll mocken -->

---

### Task 3: Wording "Sessions" statt "Sitzungen" (Coaching-Kontext)

**Files:**
- Modify: `website/src/lib/helpContent.ts:138`
- Modify: `website/src/pages/api/admin/inbox/[id]/action.ts:154`
- Modify: `tests/spec/coaching-sessions-polish-guide.bats` (append assertions)

**Interfaces:**
- Consumes: nothing new.
- Produces: coaching help copy `Coaching-Sessions`; Brett auto-post copy `für diese Session:`.

- [x] **Step 1: Write the failing BATS assertions.** Append to
      `tests/spec/coaching-sessions-polish-guide.bats`:

```bash
@test "coaching help content uses Coaching-Sessions" {
  run grep -qF "Coaching-Sessions" "$WEB/lib/helpContent.ts"
  [ "$status" -eq 0 ]
  run grep -qF "Coaching-Sitzungen" "$WEB/lib/helpContent.ts"
  [ "$status" -ne 0 ]
}

@test "brett auto-post message uses 'für diese Session'" {
  run grep -qF "für diese Session:" "$WEB/pages/api/admin/inbox/[id]/action.ts"
  [ "$status" -eq 0 ]
}
```

- [x] **Step 2: Run to verify the new assertions fail.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/coaching-sessions-polish-guide.bats
# expected: FAIL — the two strings still read "Sitzung(en)"
```

- [x] **Step 3: Rename the coaching help string (line-neutral).** In
      `helpContent.ts:138` replace the single word — no line added or removed
      (Budget 0):

```typescript
      description: 'Verwalte deine Coaching-Sessions — buche neue Termine oder sage bestehende ab.',
```

- [x] **Step 4: Rename the Brett auto-post string.** In `action.ts:154`:

```typescript
            await sendChatMessage(room.token, `🎯 Systemisches Brett für diese Session: ${url}`);
```

- [x] **Step 5: Run the assertions to verify they pass.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/coaching-sessions-polish-guide.bats
# expected: PASS for the wording assertions
```

- [x] **Step 6: Commit.**

```bash
git add website/src/lib/helpContent.ts "website/src/pages/api/admin/inbox/[id]/action.ts" tests/spec/coaching-sessions-polish-guide.bats
git commit -m "feat(coaching): use 'Session' wording in coaching-facing copy"
```

<!-- vitest: kein neuer Vitest-Test nötig — reiner String-Ersatz ohne Logikänderung; per BATS abgedeckt -->

---

### Task 4: Testdaten-Hygiene (Spalte, createSession, Purge v6)

**Files:**
- Create: `scripts/migrations/2026-07-08-coaching-is-test-data.sql`
- Create: `scripts/one-shot/purge-fn-v6.sql`
- Modify: `website/src/lib/coaching-session-db.ts`
- Modify: `website/src/lib/coaching-session-db.test.ts`
- Modify: `tests/spec/coaching-sessions-polish-guide.bats` (append assertions)

**Interfaces:**
- Consumes: `createSession(pool: Pool, args: CreateSessionArgs): Promise<Session>` and interface `CreateSessionArgs`.
- Produces: `CreateSessionArgs` gains optional `isTestData?: boolean` (default `false`); `coaching.sessions.is_test_data boolean NOT NULL DEFAULT false`; `tickets.fn_purge_test_data()` sweeps flagged `coaching.session_steps` then `coaching.sessions`.

- [x] **Step 1: Verify the live column list before writing the migration.**
      intel.json derived the `coaching.sessions` columns from code mapping, not
      `information_schema` — confirm no `is_test_data` exists yet on the live DB
      (read-only, via mcp-postgres or kubectl-psql):

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'coaching' AND table_name = 'sessions'
 ORDER BY ordinal_position;
```

      Expected columns: `id, brand, client_id, client_name, project_id,
      ki_config_id, mode, title, status, created_by, created_at, completed_at,
      archived_at` — and NO `is_test_data`.

- [x] **Step 2: Write the failing Vitest.** In `coaching-session-db.test.ts`,
      first add the column to the pg-mem `coaching.sessions` DDL so the new
      INSERT is valid — append this line inside that `CREATE TABLE`, after
      `archived_at TIMESTAMPTZ`:

```typescript
      is_test_data BOOLEAN NOT NULL DEFAULT false,
```

      Then add the passthrough test block after the existing `createSession`
      describe:

```typescript
describe('createSession isTestData', () => {
  it('persists isTestData=true', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Testdaten', createdBy: 'coach1', mode: 'live', isTestData: true,
    });
    const r = await pool.query('SELECT is_test_data FROM coaching.sessions WHERE id = $1', [s.id]);
    expect(r.rows[0].is_test_data).toBe(true);
  });

  it('defaults isTestData to false', async () => {
    const s = await createSession(pool, {
      brand: 'mentolder', title: 'Echtdaten', createdBy: 'coach1', mode: 'live',
    });
    const r = await pool.query('SELECT is_test_data FROM coaching.sessions WHERE id = $1', [s.id]);
    expect(r.rows[0].is_test_data).toBe(false);
  });
});
```

- [x] **Step 3: Run the Vitest to verify it fails.**

```bash
cd website && pnpm vitest run src/lib/coaching-session-db.test.ts
# expected: FAIL — createSession does not yet accept or persist isTestData
```

- [x] **Step 4: Thread `isTestData` through `createSession`.** In
      `coaching-session-db.ts`, extend `CreateSessionArgs` with the optional flag:

```typescript
interface CreateSessionArgs {
  brand: string;
  clientId?: string | null;
  clientName?: string | null;
  projectId?: string | null;
  kiConfigId?: number | null;
  mode: 'live' | 'prep';
  title: string;
  createdBy: string;
  isTestData?: boolean;
}
```

      And add the column + parameter to the INSERT:

```typescript
export async function createSession(pool: Pool, args: CreateSessionArgs): Promise<Session> {
  const r = await pool.query(
    `INSERT INTO coaching.sessions
       (brand, client_id, client_name, project_id, ki_config_id, mode, title, created_by, is_test_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      args.brand, args.clientId ?? null, args.clientName ?? null,
      args.projectId ?? null, args.kiConfigId ?? null,
      args.mode, args.title, args.createdBy, args.isTestData ?? false,
    ],
  );
  return rowToSession(r.rows[0]);
}
```

- [x] **Step 5: Run the Vitest to verify it passes.**

```bash
cd website && pnpm vitest run src/lib/coaching-session-db.test.ts
# expected: PASS
```

- [x] **Step 6: Write the additive migration.** Create
      `scripts/migrations/2026-07-08-coaching-is-test-data.sql`:

```sql
-- 2026-07-08-coaching-is-test-data.sql
-- Additive test-data flag for coaching sessions (T001638). Idempotent.
-- Apply to BOTH brand DBs (mentolder + korczewski) AND dev clusters before
-- deploying the website build that references the new column in createSession.
-- session_steps cascade via session_id → no own column needed.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE coaching.sessions
  ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
COMMIT;
```

- [x] **Step 7: Write the failing BATS assertions.** Append to
      `tests/spec/coaching-sessions-polish-guide.bats`:

```bash
@test "migration adds is_test_data to coaching.sessions" {
  run grep -qF "ADD COLUMN IF NOT EXISTS is_test_data" "$REPO_ROOT/scripts/migrations/2026-07-08-coaching-is-test-data.sql"
  [ "$status" -eq 0 ]
}

@test "createSession threads is_test_data into the INSERT" {
  run grep -qF "is_test_data" "$WEB/lib/coaching-session-db.ts"
  [ "$status" -eq 0 ]
}

@test "purge-fn-v6 sweeps coaching test-data sessions and steps" {
  run grep -qF "coaching.session_steps" "$REPO_ROOT/scripts/one-shot/purge-fn-v6.sql"
  [ "$status" -eq 0 ]
  run grep -qF "DELETE FROM coaching.sessions WHERE is_test_data" "$REPO_ROOT/scripts/one-shot/purge-fn-v6.sql"
  [ "$status" -eq 0 ]
}
```

- [x] **Step 8: Run to verify the purge assertion fails.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/coaching-sessions-polish-guide.bats
# expected: FAIL — scripts/one-shot/purge-fn-v6.sql does not exist yet
```

- [x] **Step 9: Create purge-fn-v6 from v5.** Copy
      `scripts/one-shot/purge-fn-v5.sql` to `scripts/one-shot/purge-fn-v6.sql`,
      update the header banner and the `COMMENT ON FUNCTION` text to v6/T001638,
      and insert a new coaching sweep block immediately after the `11d) Meetings
      sweep` block and before `12) Customer allowlist sweep`:

```sql
  ----------------------------------------------------------------------------
  -- 11e) ── Coaching sessions sweep (NEW in v6 / T001638). ──────────────────
  --     coaching.sessions.is_test_data flags seed/E2E-created sessions.
  --     Delete child steps first (explicit, for an auditable count), then
  --     the parent sessions.
  ----------------------------------------------------------------------------
  DELETE FROM coaching.session_steps
   USING coaching.sessions s
   WHERE session_id = s.id AND s.is_test_data;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('coaching_session_steps', cnt);

  DELETE FROM coaching.sessions WHERE is_test_data;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  result := result || jsonb_build_object('coaching_sessions', cnt);
```

- [x] **Step 10: Run the BATS suite to verify it passes.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/coaching-sessions-polish-guide.bats
# expected: PASS for all assertions
```

- [x] **Step 11: Commit.**

```bash
git add scripts/migrations/2026-07-08-coaching-is-test-data.sql scripts/one-shot/purge-fn-v6.sql website/src/lib/coaching-session-db.ts website/src/lib/coaching-session-db.test.ts tests/spec/coaching-sessions-polish-guide.bats
git commit -m "feat(db): add coaching is_test_data flag and purge-fn v6 sweep"
```

_Hinweis zu Seed-/E2E-Pfaden: grep-verifiziert ruft heute nur der Admin-API-Handler
`website/src/pages/api/admin/coaching/sessions/index.ts` `createSession` auf (echte
Nutzeranlage → Default `false` korrekt). Es existiert derzeit kein Seed-/E2E-Pfad,
der Coaching-Sessions anlegt; das `isTestData`-Feld steht bereit, sobald ein solcher
Pfad hinzukommt — kein bestehender Call-Site ist jetzt zu ändern._

---

### Task 5: Einmalige, geprüfte Prod-Bereinigung (manueller Deploy-Schritt)

**Files:** keine (Operator-Runbook; nicht automatisiert im Code).

Vorbedingung: Migration aus Task 4 ist auf beiden Brand-DBs UND den Dev-Clustern
angewandt, und die Purge-Funktion v6 ist eingespielt. DDL/Writes laufen über den
kubectl-psql-Pfad (mcp-postgres ist read-only). Für jede Brand-DB
(`-n workspace` mentolder, `-n workspace-korczewski` korczewski) einzeln ausführen.

- [ ] **Step 1: Purge-Funktion v6 auf beiden Brands einspielen.**

```bash
# mentolder
kubectl --context fleet -n workspace exec -i deploy/shared-db -- \
  psql -U postgres -d website < scripts/one-shot/purge-fn-v6.sql
# korczewski
kubectl --context fleet -n workspace-korczewski exec -i deploy/shared-db -- \
  psql -U postgres -d website < scripts/one-shot/purge-fn-v6.sql
```

- [ ] **Step 2: Kandidatenliste read-only auflisten (kein Blind-Delete).**
      Erst die vermuteten Testdaten sichten (Titel-/Client-/Datum-Muster);
      Ergebnis dem Betreiber vorlegen:

```bash
kubectl --context fleet -n workspace exec -i deploy/shared-db -- \
  psql -U postgres -d website -c "
    SELECT id, brand, title, client_name, created_by, created_at
      FROM coaching.sessions
     WHERE is_test_data = false
       AND (title ILIKE '%test%' OR title ILIKE '%e2e%' OR client_name ILIKE '%[TEST]%')
     ORDER BY created_at;"
```

- [ ] **Step 3: Nach Sichtung nur die bestätigten IDs markieren, dann v6 laufen
      lassen.** Ersetze `<id-1>,<id-2>` durch die vom Betreiber freigegebenen
      UUIDs (auditbar über die Purge-Funktion statt Blind-`DELETE`):

```bash
kubectl --context fleet -n workspace exec -i deploy/shared-db -- \
  psql -U postgres -d website -c "
    UPDATE coaching.sessions SET is_test_data = true
     WHERE id IN ('<id-1>','<id-2>');
    SELECT tickets.fn_purge_test_data();"
```

- [ ] **Step 4: Verifizieren, dass nur Testdaten entfernt wurden.**

```bash
kubectl --context fleet -n workspace exec -i deploy/shared-db -- \
  psql -U postgres -d website -c "SELECT count(*) FROM coaching.sessions WHERE is_test_data = true;"
# expected: 0 (alle geflaggten Zeilen wurden gepurged)
```

      Schritte 1-4 analog mit `-n workspace-korczewski` für die korczewski-DB.

---

### Task 6: Final verification

**Files:** keine Produktivänderung — nur Gates und generierte Artefakte.

- [ ] **Step 1: Test-Inventar regenerieren und mitcommitten** (neue BATS-Datei
      angelegt → CI-Inventar-Check schlägt sonst fehl):

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

- [ ] **Step 2: Die drei verpflichtenden CI-Gates ausführen.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

      Erwartung: `task test:changed` grün (Vitest `coaching-session-db.test.ts`
      + BATS `coaching-sessions-polish-guide.bats` + quality). `freshness:check`
      grün (S1-S4-Ratchet: keine Datei über ihrer wirksamen Schwelle,
      `helpContent.ts` zeilenneutral, keine neuen `any`, keine Baseline-Wachstum).

- [ ] **Step 3: Regenerierte Artefakte committen (falls `freshness:regenerate`
      Änderungen erzeugt hat).**

```bash
git add -A
git commit -m "chore: regenerate freshness artifacts for coaching-sessions-admin-ux"
```
