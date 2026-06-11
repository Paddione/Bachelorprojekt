# Brett: Board als Link teilen (öffentlich, View-only) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Brett board be shared via a public, login-free URL so a recipient can watch the board live (read-only WebSocket stream) while the leader can create and disable links.

**Architecture:** A new PostgreSQL table `brett_share_tokens` persists opaque tokens that map to a `room_token`. A dedicated unauthenticated Express route `/share/:token` serves a separate lightweight client entry (`share.html` + `share.ts`) that never touches the Keycloak flow. The WebSocket layer recognizes a `share_token` query param, marks the connection as a guest (`ws._isGuest`), resolves its role to a new fail-closed `'gast'` role, and rejects every mutation except `request_state_snapshot`. The leader gets a "Teilen" button in the board topbar.

**Tech Stack:** Node.js, TypeScript, Express 5, `ws`, PostgreSQL (`pg`), Vite (multi-entry), Three.js, `node:test` (brett unit tests via `tsx`), Playwright (E2E).

---

## Ground-truth notes (read before starting — the spec made some wrong assumptions)

The spec was written before inspecting the live code. These corrections are baked into the tasks below; do **not** revert to the spec wording where they differ:

1. **Roles are NOT in `rooms.ts`.** There is no `getRoles()` export. Room roles live in the persisted `__roles__` sentinel and are read via `buildStateFromMutations(room)?.roles` (see `permissions.ts:resolveRole`, `ws-handler.ts:gateMutation`). `requireLeiterOrAdmin` must therefore read roles through `phases.buildStateFromMutations`, not `rooms.getRoles`.
2. **`scene.ts` already exports `initScene()`** (zero-arg; it appends its own canvas to `document.body` and calls `setScene(...)`). No scene-module extraction is required — `share.ts` imports `initScene` directly. The spec's "extract `scene.ts`/`state-handler.ts`" step is already done for the scene; the message handler is `onWsMessage` in `ws-client.ts`.
3. **There is a free-board mutation bypass.** `gateMutation` (`ws-handler.ts` ~line 131) returns `true` unconditionally when a room has neither a `sessionCode` nor any roles. A guest connecting to such a board would be able to write. The guest check MUST short-circuit at the very top of `gateMutation`, **before** that bypass.
4. **Brett "unit tests" are `node:test` files in `brett/test/*.test.ts`** run by `npm test` (`MOCK_DB=true tsx --test test/*.test.ts`). There is no BATS harness for brett. The spec's "BATS FA-BRT-41..45" are implemented as `node:test` integration tests in `brett/test/`, using the IDs `FA-BRT-41..45` as the test titles. (`tests/integration/brett-templates.bats` exists but is a different, DB-integration concern; do not add to it.)
5. **E2E lives in `tests/e2e/specs/`** with a Playwright project named `brett-mentolder` (testMatch list in `tests/e2e/playwright.config.ts`). There is no `brett` project nor a `tests/e2e/brett/` directory. The new spec file goes in `tests/e2e/specs/brett-share-link.spec.ts` and is registered in the `brett-mentolder` project's `testMatch` array.
6. **The board topbar uses slot `<div>`s + `mount*` helpers** (`#topbar-invite-slot`, `topbar-invite.ts`). Mirror that exact pattern for the share button: a `topbar-share.ts` with pure testable helpers + a `mountShareButton`, plus a new `#topbar-share-slot` in `public/index.html`.
7. **The auth-redirect middleware only fires for `/` and `/index.html`** (`index.ts:54-60`), so `/share/:token` is naturally outside the Keycloak gate. Place the static-file middleware order in mind: register `/share/:token` and `/api/share/:token` **before** `app.use(express.static(...))` so they are not shadowed.

---

## File Structure

**Create:**
- `brett/src/server/migrations/003_share_tokens.sql` — share-token table + partial index.
- `brett/src/server/share-tokens.ts` — DB helpers: `createShareToken`, `resolveShareToken`, `disableShareToken`, `listShareTokens`. (New module rather than bloating `db.ts`, which is the generic pool/persist module. Keeps share logic cohesive and unit-testable.)
- `brett/public/share.html` — second Vite entry; minimal view-only page.
- `brett/src/client/share.ts` — share client bootstrap (validate token → initScene → connect WS read-only).
- `brett/src/client/ui/topbar-share.ts` — "Teilen" topbar button (pure helpers + `mountShareButton`).
- `brett/test/share-tokens.test.ts` — unit tests for the DB helpers (MockPool-injected).
- `brett/test/share-route.test.ts` — `node:test` integration tests `FA-BRT-41..45` (HTTP routes + WS guest gating + canMutate('gast')).
- `brett/test/topbar-share.test.ts` — pure-helper tests for the share button visibility/URL.
- `tests/e2e/specs/brett-share-link.spec.ts` — Playwright E2E.

**Modify:**
- `brett/src/types/state.ts` — add `'gast'` to `Role`.
- `brett/src/server/permissions.ts` — `canMutate` gast branch; `resolveRole` guest branch.
- `brett/src/server/auth.ts` — `requireLeiterOrAdmin` middleware.
- `brett/src/server/ws-handler.ts` — guest detection in connection handler; guest short-circuit in `gateMutation`.
- `brett/src/server/index.ts` — new HTTP routes; wire `resolveShareToken`/`requireLeiterOrAdmin`; thread `resolveShareToken` into `wsDeps` (or import directly in ws-handler).
- `brett/src/client/ws-client.ts` — thread `share_token` from `location.search` into the `/sync` URL.
- `brett/src/client/board-boot.ts` — mount the share button (guarded by role/admin).
- `brett/public/index.html` — add `#topbar-share-slot`.
- `brett/vite.config.ts` — second `input` entry for `share.html`.
- `tests/e2e/playwright.config.ts` — register the new spec in the `brett-mentolder` project's `testMatch`.

---

## Pre-flight

- [ ] **Step 1: Confirm worktree, branch, spec**

```bash
cd /tmp/wt-T000608-brett-share-link
git branch --show-current        # expect: feature/T000608-brett-share-link
git status --short
test -f docs/superpowers/specs/2026-06-11-brett-share-link-design.md && echo "spec OK"
```
Expected: branch matches, spec file present.

- [ ] **Step 2: Pull latest main into the branch (rebase)**

```bash
cd /tmp/wt-T000608-brett-share-link
git fetch origin
git rebase origin/main || { echo "RESOLVE CONFLICTS THEN: git rebase --continue"; }
```
Expected: clean rebase (worktree is fresh; conflicts unlikely).

- [ ] **Step 3: Install brett deps + verify baseline build/test green**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
npm ci
npm run typecheck
npm test 2>&1 | tail -20
```
Expected: typecheck passes; existing tests pass (this is the baseline — do not start changing code until this is green).

- [ ] **Step 4: Confirm this is dev work only (no cluster touch)**

This plan does not deploy. Brett deploys are out of scope until execution/PR is merged (`task feature:brett` happens post-merge, by the executor). No `kubectl`/cluster context needed for the plan itself. Note for the executor: there is no GitOps reconciler — a merged change is **not** auto-deployed.

---

## Phase A: DB-Migration + Share-Token module

### Task A1: Migration `003_share_tokens.sql`

**Files:**
- Create: `brett/src/server/migrations/003_share_tokens.sql`

- [ ] **Step 1: Write the migration**

```sql
-- brett/src/server/migrations/003_share_tokens.sql
-- Migration: Share-Token-Tabelle für öffentliche View-only-Links (T000608).
-- Idempotent (IF NOT EXISTS) — runMigrations() re-runs it on every startup.

CREATE TABLE IF NOT EXISTS brett_share_tokens (
  token        TEXT         PRIMARY KEY,
  room_token   TEXT         NOT NULL,
  created_by   TEXT,                          -- userId des Erstellers (NULL = admin-tool)
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  disabled_at  TIMESTAMPTZ,                   -- NULL = aktiv; gesetzt = deaktiviert
  expires_at   TIMESTAMPTZ                    -- NULL = kein Ablauf (Phase 1 ungenutzt)
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_room
  ON brett_share_tokens (room_token)
  WHERE disabled_at IS NULL;
```

- [ ] **Step 2: Verify migration loader picks it up**

`db.ts:runMigrations()` reads every `*.sql` in `migrations/` sorted, so `003_*` runs after `001`/`002`. No code change needed. Confirm the filename sorts last:

```bash
ls brett/src/server/migrations/
```
Expected: `001_session_events.sql  002_coaching_templates.sql  003_share_tokens.sql`

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/src/server/migrations/003_share_tokens.sql
git commit -m "feat(brett): add brett_share_tokens migration [T000608]"
```

### Task A2: `share-tokens.ts` DB helpers (TDD)

**Files:**
- Create: `brett/src/server/share-tokens.ts`
- Test: `brett/test/share-tokens.test.ts`

The helpers take the pool via `getPool()` from `db.ts` (already MockPool under `MOCK_DB=true`). To make them unit-testable against a controllable mock, `share-tokens.ts` resolves the pool lazily through `getPool()` at call time.

- [ ] **Step 1: Write the failing test**

```ts
// brett/test/share-tokens.test.ts
// Unit tests for the share-token DB helpers (T000608). MockPool-injected via a
// tiny custom pool so we can assert SQL params + control return rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/server/db';
import {
  createShareToken,
  resolveShareToken,
  disableShareToken,
  listShareTokens,
} from '../src/server/share-tokens';

// A controllable pool: records the last query and returns a scripted result.
function scriptPool(script: { rows?: any[]; rowCount?: number } = {}) {
  const calls: { text: string; params?: unknown[] }[] = [];
  const pool = {
    async query(text: string, params?: unknown[]) {
      calls.push({ text, params });
      return { rows: script.rows ?? [], rowCount: script.rowCount ?? (script.rows?.length ?? 0) };
    },
    async end() {},
    async connect() { return { query: this.query, release() {} }; },
    on() { return this; },
  };
  process.env.MOCK_DB = 'true';
  initDb({ buildStateFromMutations: () => ({ figures: [] }) });
  // share-tokens.ts reads getPool() lazily; override the module pool by monkey-
  // patching getPool's returned object is not possible, so we inject via initDb's
  // MockPool replacement: see implementation note (getPool returns the MockPool).
  // For deterministic assertions we instead pass the pool explicitly:
  return { pool, calls };
}

test('FA-BRT-A2a: createShareToken returns a URL-safe token and inserts it', async () => {
  const { pool, calls } = scriptPool();
  const token = await createShareToken('room-123', 'user-1', pool as any);
  assert.match(token, /^[A-Za-z0-9_-]+$/);          // base64url charset
  assert.ok(token.length >= 20);                     // 18 bytes → 24 chars
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /INSERT INTO brett_share_tokens/);
  assert.deepEqual(calls[0].params, [token, 'room-123', 'user-1']);
});

test('FA-BRT-A2b: resolveShareToken returns roomToken for a valid token', async () => {
  const { pool } = scriptPool({ rows: [{ room_token: 'room-xyz' }] });
  assert.equal(await resolveShareToken('tok', pool as any), 'room-xyz');
});

test('FA-BRT-A2c: resolveShareToken returns null when no active row', async () => {
  const { pool } = scriptPool({ rows: [] });
  assert.equal(await resolveShareToken('tok', pool as any), null);
});

test('FA-BRT-A2d: disableShareToken returns true when a row was updated', async () => {
  const { pool, calls } = scriptPool({ rowCount: 1 });
  assert.equal(await disableShareToken('tok', 'room-1', pool as any), true);
  assert.match(calls[0].text, /UPDATE brett_share_tokens SET disabled_at = now\(\)/);
  assert.deepEqual(calls[0].params, ['tok', 'room-1']);
});

test('FA-BRT-A2e: disableShareToken returns false when nothing matched', async () => {
  const { pool } = scriptPool({ rowCount: 0 });
  assert.equal(await disableShareToken('tok', 'room-1', pool as any), false);
});

test('FA-BRT-A2f: listShareTokens returns active rows', async () => {
  const rows = [{ token: 't1', created_at: new Date(), created_by: 'u1' }];
  const { pool } = scriptPool({ rows });
  assert.deepEqual(await listShareTokens('room-1', pool as any), rows);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/share-tokens.test.ts 2>&1 | tail -20
```
Expected: FAIL — `Cannot find module '../src/server/share-tokens'`.

- [ ] **Step 3: Implement `share-tokens.ts`**

The helpers accept an optional `pool` arg (defaults to `getPool()`) so unit tests inject a scripted pool while production uses the real pool.

```ts
// brett/src/server/share-tokens.ts
// Public view-only share-link tokens (T000608). Persisted in brett_share_tokens
// (migration 003) so links survive restarts. Token = crypto.randomBytes(18) →
// base64url (144 bit entropy, no extra dependency).
import crypto from 'crypto';
import { getPool, type MockPoolLike } from './db';
import type { Pool } from 'pg';

type PoolLike = Pool | MockPoolLike;

/** Create + persist a new share token for a board. Returns the token string. */
export async function createShareToken(
  roomToken: string,
  createdBy?: string,
  pool: PoolLike = getPool(),
): Promise<string> {
  const token = crypto.randomBytes(18).toString('base64url');
  await pool.query(
    `INSERT INTO brett_share_tokens (token, room_token, created_by) VALUES ($1, $2, $3)`,
    [token, roomToken, createdBy ?? null],
  );
  return token;
}

/** Validate a token → its roomToken, or null when invalid/disabled/expired. */
export async function resolveShareToken(
  token: string,
  pool: PoolLike = getPool(),
): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT room_token FROM brett_share_tokens
     WHERE token = $1 AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [token],
  );
  return rows[0]?.room_token ?? null;
}

/** Deactivate a token (sets disabled_at). Returns true iff a row was updated. */
export async function disableShareToken(
  token: string,
  roomToken: string,
  pool: PoolLike = getPool(),
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE brett_share_tokens SET disabled_at = now()
     WHERE token = $1 AND room_token = $2 AND disabled_at IS NULL`,
    [token, roomToken],
  );
  return ((res as any).rowCount ?? 0) > 0;
}

/** List active tokens for a board, newest first. */
export async function listShareTokens(
  roomToken: string,
  pool: PoolLike = getPool(),
): Promise<{ token: string; created_at: Date; created_by: string | null }[]> {
  const { rows } = await pool.query(
    `SELECT token, created_at, created_by FROM brett_share_tokens
     WHERE room_token = $1 AND disabled_at IS NULL ORDER BY created_at DESC`,
    [roomToken],
  );
  return rows as any;
}
```

Note: `db.ts` already exports `MockPoolLike`. If `MockPoolLike.query`'s signature does not return `rowCount`, that is fine — `disableShareToken` reads it defensively via `(res as any).rowCount`.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/share-tokens.test.ts 2>&1 | tail -20
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/src/server/share-tokens.ts brett/test/share-tokens.test.ts
git commit -m "feat(brett): share-token DB helpers + unit tests [T000608]"
```

---

## Phase B: Server-Routen + `requireLeiterOrAdmin`

### Task B1: `requireLeiterOrAdmin` middleware (TDD)

**Files:**
- Modify: `brett/src/server/auth.ts`
- Test: `brett/test/auth.test.ts` (append)

Roles are read via an injected `getRoomRoles` function so the middleware stays unit-testable without spinning up `phases`/`figures`. `index.ts` injects `(room) => phases.buildStateFromMutations(room)?.roles ?? {}`.

- [ ] **Step 1: Write the failing test (append to `brett/test/auth.test.ts`)**

```ts
import { requireLeiterOrAdmin } from '../src/server/auth';

function mockRes() {
  return {
    statusCode: 0,
    body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
}

test('FA-BRT-B1a: requireLeiterOrAdmin allows admin sessions', () => {
  let called = false;
  const req: any = { session: { isAdmin: true }, params: {}, header: () => undefined };
  requireLeiterOrAdmin(() => ({}))(req, mockRes() as any, () => { called = true; });
  assert.equal(called, true);
});

test('FA-BRT-B1b: requireLeiterOrAdmin allows the room leiter', () => {
  let called = false;
  const req: any = { session: { userId: 'u1' }, params: { roomToken: 'r1' }, header: () => undefined };
  const getRoles = (room: string) => (room === 'r1' ? { u1: 'leiter' } : {});
  requireLeiterOrAdmin(getRoles)(req, mockRes() as any, () => { called = true; });
  assert.equal(called, true);
});

test('FA-BRT-B1c: requireLeiterOrAdmin rejects a non-leiter with 403', () => {
  const req: any = { session: { userId: 'u2' }, params: { roomToken: 'r1' }, header: () => undefined };
  const res = mockRes();
  let called = false;
  requireLeiterOrAdmin(() => ({ u1: 'leiter' }))(req, res as any, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'forbidden' });
});

test('FA-BRT-B1d: requireLeiterOrAdmin honors the e2e secret bypass', () => {
  process.env.BRETT_OIDC_SECRET = 'e2e-secret';
  let called = false;
  const req: any = { session: {}, params: { roomToken: 'r1' }, header: (h: string) => (h === 'x-e2e-secret' ? 'e2e-secret' : undefined) };
  requireLeiterOrAdmin(() => ({}))(req, mockRes() as any, () => { called = true; });
  assert.equal(called, true);
  delete process.env.BRETT_OIDC_SECRET;
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/auth.test.ts 2>&1 | tail -20
```
Expected: FAIL — `requireLeiterOrAdmin` not exported.

- [ ] **Step 3: Implement the middleware (append to `brett/src/server/auth.ts`)**

It is a factory: `requireLeiterOrAdmin(getRoomRoles)` returns the Express middleware. This keeps `auth.ts` free of a `phases` import (avoids a cycle: `phases` → `figures`; `auth` is imported by `index.ts` which wires `phases`).

```ts
import type { Role } from '../types/state';

/**
 * Factory for the leiter/admin gate on share-management routes. `getRoomRoles`
 * is injected (index.ts passes phases.buildStateFromMutations(room)?.roles) so
 * this module stays decoupled from the phases/figures graph. Admin (KC realm
 * role) always passes; otherwise the session user must be `leiter` in the
 * room named by req.params.roomToken. E2E secret header bypass mirrors
 * requireAdmin.
 */
export function requireLeiterOrAdmin(
  getRoomRoles: (room: string) => Record<string, Role>,
) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const session = (req as any).session;
    if (session?.isAdmin) return next();
    const roomToken = (req as any).params?.roomToken;
    if (roomToken && session?.userId) {
      const roles = getRoomRoles(roomToken);
      if (roles?.[session.userId] === 'leiter') return next();
    }
    const e2eSecret = process.env.BRETT_OIDC_SECRET;
    if (e2eSecret && req.header('x-e2e-secret') === e2eSecret) return next();
    res.status(403).json({ error: 'forbidden' });
  };
}
```

(`Request`, `Response`, `NextFunction` are already imported at the top of `auth.ts`.)

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/auth.test.ts 2>&1 | tail -20
```
Expected: PASS (all auth tests incl. the 4 new ones).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/src/server/auth.ts brett/test/auth.test.ts
git commit -m "feat(brett): requireLeiterOrAdmin middleware factory [T000608]"
```

### Task B2: HTTP routes in `index.ts`

**Files:**
- Modify: `brett/src/server/index.ts`

Routes must be registered **before** `app.use(express.static(...))` (so `/share/:token` is not shadowed by a static file) but the share-management API routes can go alongside the other `/api/*` routes. Use `asyncHandler` for the async DB lookups.

- [ ] **Step 1: Add imports + the share routes**

Near the other `import * as ...` lines, add:
```ts
import * as shareTokens from './share-tokens';
```

Immediately **after** the `app.use(express.static(staticDir, {...}))` block is too late for `/share/:token` only if a real file `/share/<token>` existed — it never does, so static won't shadow it. But to be safe and explicit, register the public share routes right after `app.get('/healthz', ...)` (line ~81), which is already after static. Place all of the following there:

```ts
// ─── Public share links (T000608) — NO Keycloak gate ──────────────────────────
const SHARE_PUBLIC_DIR = staticDir; // share.html ships next to index.html

// Public view-only page. Deliberately NOT behind boardAuthRedirect.
app.get('/share/:token', asyncHandler(async (req: any, res: any) => {
  const roomToken = await shareTokens.resolveShareToken(req.params.token);
  if (!roomToken) return res.status(404).type('text/plain').send('Link ungültig oder deaktiviert.');
  res.sendFile(path.join(SHARE_PUBLIC_DIR, 'share.html'));
}));

// Public client-bootstrap: validate token → roomToken.
app.get('/api/share/:token', asyncHandler(async (req: any, res: any) => {
  const roomToken = await shareTokens.resolveShareToken(req.params.token);
  if (!roomToken) return res.status(404).json({ error: 'invalid_token' });
  res.json({ valid: true, roomToken });
}));

// Leiter/Admin-only: create a share token.
const roomRoles = (room: string) => permissions /* see below */;
```

For the management routes, build the `requireLeiterOrAdmin` instance once with the role getter, then mount the three routes:

```ts
// Build the leiter/admin gate with the live role getter.
const leiterOrAdmin = auth.requireLeiterOrAdmin(
  (room: string) => (phases.buildStateFromMutations(room)?.roles ?? {}) as Record<string, import('../types/state').Role>,
);

app.post('/api/rooms/:roomToken/share', leiterOrAdmin, asyncHandler(async (req: any, res: any) => {
  const { roomToken } = req.params;
  const userId = req.session?.userId;
  const token = await shareTokens.createShareToken(roomToken, userId);
  const baseUrl = process.env.BRETT_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ token, url: `${baseUrl}/share/${token}` });
}));

app.get('/api/rooms/:roomToken/shares', leiterOrAdmin, asyncHandler(async (req: any, res: any) => {
  const tokens = await shareTokens.listShareTokens(req.params.roomToken);
  res.json({ tokens });
}));

app.delete('/api/rooms/:roomToken/share/:token', leiterOrAdmin, asyncHandler(async (req: any, res: any) => {
  const ok = await shareTokens.disableShareToken(req.params.token, req.params.roomToken);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ disabled: true });
}));
```

Delete the throw-away `const roomRoles = ...` placeholder line — it was only a marker; the real getter is the inline arrow passed to `auth.requireLeiterOrAdmin`.

- [ ] **Step 2: Typecheck**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
npm run typecheck 2>&1 | tail -20
```
Expected: PASS. If `phases` is imported as `* as phases` (it is — `index.ts:13`), `phases.buildStateFromMutations` resolves. `import('../types/state').Role` inline type import avoids a new top-level import.

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/src/server/index.ts
git commit -m "feat(brett): share HTTP routes (public + leiter/admin) [T000608]"
```

---

## Phase C: WS-Integration (gast-Rolle)

### Task C1: Add `'gast'` to the `Role` union

**Files:**
- Modify: `brett/src/types/state.ts:7`

- [ ] **Step 1: Edit the union**

Change line 7 from:
```ts
export type Role = 'leiter' | 'stellvertreter' | 'beobachter';
```
to:
```ts
export type Role = 'leiter' | 'stellvertreter' | 'beobachter' | 'gast';
```

- [ ] **Step 2: Typecheck (expect it to still pass — gast is additive)**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
npm run typecheck 2>&1 | tail -10
```
Expected: PASS. (No `switch` on `Role` is exhaustive-without-default in the codebase; `canMutate` switches on `msgType`, not `role`.)

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/src/types/state.ts
git commit -m "feat(brett): add 'gast' role to Role union [T000608]"
```

### Task C2: `canMutate` gast branch + `resolveRole` guest branch (TDD)

**Files:**
- Modify: `brett/src/server/permissions.ts`
- Test: `brett/test/permissions.test.ts` (append)

- [ ] **Step 1: Write the failing tests (append to `brett/test/permissions.test.ts`)**

```ts
test('FA-BRT-C2a: gast may read (request_state_snapshot) but nothing else', () => {
  // canMutate is imported at the top of permissions.test.ts already.
  assert.equal(canMutate({ msgType: 'request_state_snapshot', role: 'gast', playerId: 'g' }), true);
  for (const t of ['add','move','update','jump','delete','clear','stiffness','snapshot','figure_lock','figure_possess','figure_release','figure_note_set'] as const) {
    assert.equal(canMutate({ msgType: t, role: 'gast', playerId: 'g' }), false, `gast must not ${t}`);
  }
});

test('FA-BRT-C2b: resolveRole returns gast for a guest ws', () => {
  assert.equal(resolveRole({ _isGuest: true }, { u1: 'leiter' }), 'gast');
  assert.equal(resolveRole({ _isGuest: true, _session: { userId: 'u1' } }, { u1: 'leiter' }), 'gast');
});
```

If `resolveRole`/`canMutate` are not already imported in `permissions.test.ts`, add them to the existing import line at the top of that file.

- [ ] **Step 2: Run to verify failure**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/permissions.test.ts 2>&1 | tail -20
```
Expected: FAIL — `FA-BRT-C2b` fails (`resolveRole` returns `beobachter`), and the `gast` reads currently fall through to the final `return false` so `request_state_snapshot` already returns `true` (handled at top) — but the explicit gast guard is still added for clarity and future write-types.

- [ ] **Step 3: Implement the gast branch in `canMutate`**

In `permissions.ts`, **after** the `beobachter` block (after line 94, before the final `return false`), add:

```ts
  // Gäste (public share-link viewers) sind vollständig read-only.
  // request_state_snapshot ist bereits oben (Zeile ~44) für alle Rollen erlaubt;
  // jeder Schreibtyp fällt hier auf Default-Deny.
  if (ctx.role === 'gast') {
    return false;
  }
```

- [ ] **Step 4: Implement the guest branch in `resolveRole`**

Change `resolveRole` (line ~107) to short-circuit on `_isGuest` first:

```ts
export function resolveRole(ws: any, roles: Record<string, Role>): Role {
  if (ws?._isGuest) return 'gast';
  const uid = ws?._session?.userId;
  if (!uid) return 'beobachter';
  return roles?.[uid] ?? 'beobachter';
}
```

- [ ] **Step 5: Run to verify pass**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/permissions.test.ts 2>&1 | tail -20
```
Expected: PASS (existing + 2 new).

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/src/server/permissions.ts brett/test/permissions.test.ts
git commit -m "feat(brett): gast role in canMutate + resolveRole guest short-circuit [T000608]"
```

### Task C3: Guest detection in connection handler + gateMutation short-circuit (TDD)

**Files:**
- Modify: `brett/src/server/ws-handler.ts`
- Test: `brett/test/permissions.test.ts` (append — `gateMutation` lives in ws-handler but is unit-testable)

**Critical:** `gateMutation` has a free-board bypass (returns `true` when a room has no sessionCode and no roles). A guest MUST be denied **before** that bypass, otherwise a guest on a legacy/coaching board could write.

- [ ] **Step 1: Write the failing test (append to `brett/test/permissions.test.ts`)**

```ts
import { gateMutation } from '../src/server/ws-handler';
import { canMutate as realCanMutate, resolveRole as realResolveRole } from '../src/server/permissions';

test('FA-BRT-C3a: gateMutation denies a guest write even on a free board', () => {
  // Free board: no sessionCode, no roles → normally the bypass returns true.
  const deps = {
    buildStateFromMutations: () => ({}),            // no sessionCode, no roles
    figureMaps: new Map(),
    canMutate: realCanMutate,
    resolveRole: realResolveRole,
  };
  const guestWs = { _isGuest: true };
  assert.equal(gateMutation(guestWs, 'room-free', 'move', 'fig1', deps as any), false);
  // …but a guest read is allowed.
  assert.equal(gateMutation(guestWs, 'room-free', 'request_state_snapshot', undefined, deps as any), true);
});

test('FA-BRT-C3b: gateMutation still bypasses for a normal anon on a free board', () => {
  const deps = {
    buildStateFromMutations: () => ({}),
    figureMaps: new Map(),
    canMutate: realCanMutate,
    resolveRole: realResolveRole,
  };
  assert.equal(gateMutation({}, 'room-free', 'move', 'fig1', deps as any), true);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/permissions.test.ts 2>&1 | tail -20
```
Expected: FAIL on `FA-BRT-C3a` (guest `move` currently returns `true` via the free-board bypass).

- [ ] **Step 3: Add the guest short-circuit at the top of `gateMutation`**

In `ws-handler.ts`, inside `gateMutation`, **before** the free-board bypass (`if (!state.sessionCode && ...)` at line ~131), add as the very first statements after computing nothing yet:

```ts
): boolean {
  // T000608: a public share-link guest is hard read-only on ANY board — this
  // MUST precede the free-board bypass below, otherwise a guest on a legacy/
  // role-less board could write.
  if (ws?._isGuest) {
    return msgType === 'request_state_snapshot';
  }
  const state = deps.buildStateFromMutations(room) || {};
  // …existing body unchanged…
```

- [ ] **Step 4: Add share-token resolution in the connection handler**

The connection handler (`attachWsServer`, line ~200) must set `ws._isGuest`/`ws._shareRoom` from the `share_token` query param. The WS server has `req` available. Add `resolveShareToken` to `WsDeps` and the wiring.

In `ws-handler.ts`, extend `WsDeps`:
```ts
  resolveShareToken?: (token: string) => Promise<string | null>;
```

In `attachWsServer`'s `wss.on('connection', (ws, req) => { ... })`, make the callback async and resolve the share token **before** the session wiring runs (so guest state is set before any message can arrive):

```ts
  wss.on('connection', async (ws: any, req: any) => {
    // T000608: detect a public share-link guest from the /sync query string.
    try {
      const wsUrl = new URL(req?.url ?? '/', `http://${req?.headers?.host ?? 'x'}`);
      const shareToken = wsUrl.searchParams.get('share_token');
      if (shareToken && deps.resolveShareToken) {
        const roomToken = await deps.resolveShareToken(shareToken);
        if (!roomToken) { ws.close(4403, 'invalid_share_token'); return; }
        ws._shareRoom = roomToken;
        ws._isGuest = true;
      }
    } catch (err) {
      console.error('[brett] share-token resolve error:', err);
    }
    if (deps.sessionMiddleware && req) {
      // …existing session wiring unchanged…
```

Leave the rest of the connection handler untouched. A guest still sends `{type:'join', room:<roomToken>}` and `request_state_snapshot`; both pass (join is not gated; reads are allowed). Every write hits `gateMutation` → guest short-circuit → denied.

- [ ] **Step 5: Wire `resolveShareToken` into `wsDeps` in `index.ts`**

In `index.ts`, in the `wsDeps` object (line ~429), add:
```ts
  resolveShareToken: shareTokens.resolveShareToken,
```

- [ ] **Step 6: Run unit tests + typecheck**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/permissions.test.ts 2>&1 | tail -10
npm run typecheck 2>&1 | tail -10
```
Expected: PASS for both.

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/src/server/ws-handler.ts brett/src/server/index.ts brett/test/permissions.test.ts
git commit -m "feat(brett): WS guest detection + gateMutation guest short-circuit [T000608]"
```

---

## Phase D: Client (`share.html`, `share.ts`, Vite entry, ws-client threading)

### Task D1: Thread `share_token` into the `/sync` URL (`ws-client.ts`) (TDD)

**Files:**
- Modify: `brett/src/client/ws-client.ts:151-185` (`connectWS`)
- Test: `brett/test/ws-client-share.test.ts` (new — pure URL-builder helper)

`connectWS` reads `room` from `location.search`. For the share viewer, the page URL is `/share/<token>` (no query string), so `share.ts` will instead navigate the in-page state by setting `location.search`? No — simpler and testable: extract the URL-building into a pure helper `buildSyncUrl(search, host, protocol, userId)` that also copies `share_token` from `search`, and have `share.ts` call `connectWS` after putting `?room=<roomToken>&share_token=<token>` into a known place. The robust approach: `share.ts` sets `history.replaceState` to `?room=<roomToken>&share_token=<token>` BEFORE calling `connectWS`, so the existing `location.search` read picks both up. Then `connectWS` only needs to forward `share_token`.

- [ ] **Step 1: Write the failing test**

```ts
// brett/test/ws-client-share.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSyncUrl } from '../src/client/ws-client';

test('FA-BRT-D1a: buildSyncUrl forwards room + playerId', () => {
  const u = buildSyncUrl('?room=r1', 'localhost:3000', 'http:', 'u1');
  assert.equal(u, 'ws://localhost:3000/sync?room=r1&playerId=u1');
});

test('FA-BRT-D1b: buildSyncUrl forwards share_token and omits anon playerId', () => {
  const u = buildSyncUrl('?room=r1&share_token=tok', 'host:3000', 'https:', 'anon');
  assert.equal(u, 'wss://host:3000/sync?room=r1&share_token=tok');
});

test('FA-BRT-D1c: buildSyncUrl defaults room to "default" when absent', () => {
  const u = buildSyncUrl('', 'h', 'http:', 'anon');
  assert.equal(u, 'ws://h/sync?room=default');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/ws-client-share.test.ts 2>&1 | tail -20
```
Expected: FAIL — `buildSyncUrl` not exported.

- [ ] **Step 3: Refactor `connectWS` to use a pure `buildSyncUrl`**

Add the exported helper above `connectWS`:

```ts
/** Pure: build the /sync WebSocket URL from the location parts. Forwards room,
 *  optional share_token (T000608 public viewer), and a non-anon playerId. */
export function buildSyncUrl(search: string, host: string, protocol: string, userId: string): string {
  const src = new URLSearchParams(search);
  const params = new URLSearchParams({ room: src.get('room') || 'default' });
  const shareToken = src.get('share_token');
  if (shareToken) params.set('share_token', shareToken);
  if (userId && userId !== 'anon') params.set('playerId', userId);
  const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${host}/sync?${params.toString()}`;
}
```

Replace the body of `connectWS` that builds `roomFromUrl`/`params`/`new WebSocket(...)` (lines ~164-169) with:

```ts
  const roomFromUrl = new URLSearchParams(location.search).get('room') || 'default';
  const ws = new WebSocket(buildSyncUrl(location.search, location.host, location.protocol, currentUser.userId));
```

Leave the `open`/`close`/`message` handlers and the `send({ type:'join', room: roomFromUrl })` unchanged.

- [ ] **Step 4: Run to verify pass + typecheck**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/ws-client-share.test.ts 2>&1 | tail -10
npm run typecheck 2>&1 | tail -10
```
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/src/client/ws-client.ts brett/test/ws-client-share.test.ts
git commit -m "feat(brett): buildSyncUrl forwards share_token to /sync [T000608]"
```

### Task D2: `share.html` + `share.ts` client

**Files:**
- Create: `brett/public/share.html`
- Create: `brett/src/client/share.ts`

The viewer reuses the existing read-only rendering path. The lightest reliable approach: import `initScene` (already self-mounting) and lazily import `board-boot`'s renderer? `board-boot.bootBoard()` wires the full editor (panels, mannequin editing, export). For a clean view-only page we instead reuse `ws-client`'s `onWsMessage` + the scene + mannequin render path that `board-boot` uses. To avoid duplicating board-boot's large wiring, `share.ts` calls `bootBoard()` — the server already denies all guest writes, and the topbar/edit panels live in `index.html` (absent from `share.html`), so their `getElementById` lookups no-op. This is the YAGNI path: maximal reuse, guest safety enforced server-side.

- [ ] **Step 1: Create `share.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Brett – Board ansehen</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b111c; color: #e7ead0;
      font-family: system-ui, sans-serif; }
    #view-only-badge {
      position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 100;
      background: rgba(200,169,110,0.9); color: #0b111c; font-weight: 600; font-size: 13px;
      padding: 5px 14px; border-radius: 999px; pointer-events: none;
    }
    #share-status {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 15px; color: #aab; text-align: center; max-width: 80vw;
    }
  </style>
</head>
<body>
  <div id="view-only-badge">Nur anzeigen</div>
  <div id="share-status">Lädt …</div>
  <script type="module" src="/src/client/share.ts"></script>
</body>
</html>
```

(In dev, Vite serves `/src/client/share.ts` directly; the prod build rewrites this to the hashed asset — see Task D3. `index.html` uses the same `type="module" src="/src/client/main.ts"` convention; verify by `grep main.ts brett/public/index.html` and mirror it exactly.)

- [ ] **Step 2: Verify the index.html module-src convention and match it**

```bash
grep -n "type=\"module\"" brett/public/index.html
```
Expected: shows how `main.ts` is referenced (e.g. `/src/client/main.ts`). Make `share.html`'s `<script>` use the identical scheme.

- [ ] **Step 3: Create `share.ts`**

```ts
// brett/src/client/share.ts — public, login-free, view-only board viewer (T000608).
// Validates the share token, rewrites the URL so the existing ws-client picks up
// room + share_token, then boots the (server-enforced read-only) board.
import { injectTheme } from './ui/theme';
import { currentUser } from './state';

async function main(): Promise<void> {
  injectTheme();
  const status = document.getElementById('share-status');
  // /share/<token> → token is the last path segment.
  const token = location.pathname.split('/').filter(Boolean).at(-1) ?? '';

  let roomToken: string;
  try {
    const resp = await fetch(`/api/share/${encodeURIComponent(token)}`);
    if (!resp.ok) throw new Error('invalid');
    ({ roomToken } = await resp.json());
  } catch {
    if (status) status.textContent = 'Dieser Link ist nicht mehr gültig.';
    return;
  }

  if (status) status.remove();
  // Guests are anonymous — never thread a playerId.
  currentUser.userId = 'anon';
  currentUser.name = 'Gast';

  // Put room + share_token into the query string so connectWS()/buildSyncUrl()
  // forward both into the /sync handshake (the page path stays /share/<token>).
  const params = new URLSearchParams({ room: roomToken, share_token: token });
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);

  // Boot the existing board renderer. All editing UI lives in index.html (absent
  // here), so its DOM hooks no-op; every write is denied server-side (gast role).
  const board = await import('./board-boot');
  await board.bootBoard();
}

main();
```

- [ ] **Step 4: Confirm `bootBoard`'s entry tolerates missing topbar DOM**

```bash
grep -n "getElementById\|querySelector" brett/src/client/board-boot.ts | head -20
```
Manual check: the mount helpers (`mountInviteButton`, `mountParticipantsButton`, etc.) early-return when their slot is absent (mirror of `topbar-invite.ts` which checks the slot). If any throws on a null slot, guard the call in `board-boot` with an `if (slot)` — but prefer NOT to refactor board-boot; the slots simply won't exist in `share.html`, and the existing `mount*` helpers already handle a missing slot by returning. Verify by reading the first ~60 lines of `board-boot.ts` (the mount calls) and confirming each is slot-guarded; if one isn't, add a `if (document.getElementById('<slot>'))` guard around it in `share.ts`'s pre-boot step is NOT possible — instead guard inside the helper. Note any helper that needs a guard for the executor.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/public/share.html brett/src/client/share.ts
git commit -m "feat(brett): share.html + share.ts view-only client [T000608]"
```

### Task D3: Vite multi-entry build

**Files:**
- Modify: `brett/vite.config.ts`

- [ ] **Step 1: Add the second entry**

`root` is `public/`, so entry paths are relative to `public/`. Update `build`:

```ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'public',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html'),
        share: resolve(__dirname, 'public/share.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/presets': 'http://localhost:3000',
      '/share': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
      '/sync': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
```

(Added `/share` to the dev proxy so the dev server forwards `/share/:token` page requests to Express; and the second `input` so `vite build` emits `dist/client/share.html`.)

- [ ] **Step 2: Run the prod build to prove multi-entry works**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
npm run build 2>&1 | tail -25
test -f dist/client/share.html && echo "share.html built OK"
test -f dist/client/index.html && echo "index.html built OK"
```
Expected: build succeeds; both HTML files present in `dist/client/`. The server's `staticDir` already prefers `dist/client` when `index.html` exists, and `app.get('/share/:token')` `sendFile`s `share.html` from that same dir.

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/vite.config.ts
git commit -m "feat(brett): vite second entry point for share.html [T000608]"
```

---

## Phase E: Board-UI (Teilen-Button)

### Task E1: `topbar-share.ts` button (TDD, mirrors `topbar-invite.ts`)

**Files:**
- Create: `brett/src/client/ui/topbar-share.ts`
- Test: `brett/test/topbar-share.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// brett/test/topbar-share.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareButtonVisible } from '../src/client/ui/topbar-share';

test('FA-BRT-E1a: shareButtonVisible true for leiter', () => {
  assert.equal(shareButtonVisible('leiter', false), true);
});
test('FA-BRT-E1b: shareButtonVisible true for admin regardless of role', () => {
  assert.equal(shareButtonVisible('beobachter', true), true);
  assert.equal(shareButtonVisible(undefined, true), true);
});
test('FA-BRT-E1c: shareButtonVisible false for non-leiter non-admin', () => {
  assert.equal(shareButtonVisible('beobachter', false), false);
  assert.equal(shareButtonVisible('stellvertreter', false), false);
  assert.equal(shareButtonVisible(undefined, false), false);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/topbar-share.test.ts 2>&1 | tail -20
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `topbar-share.ts`**

```ts
// brett/src/client/ui/topbar-share.ts — "Teilen" topbar button (T000608).
// Visible only to the board leader (or an admin). Click POSTs to create a public
// share link and copies it to the clipboard. Pure helpers are node-testable; DOM
// lives in mountShareButton (mirrors topbar-invite.ts).

/** Pure: only the room leiter (or an admin) may create/share public links. */
export function shareButtonVisible(role: string | undefined | null, isAdmin: boolean): boolean {
  return isAdmin === true || role === 'leiter';
}

const SHARE_STYLE_ID = 'brett-topbar-share';

function injectStyles(doc: Document = document): void {
  if (doc.getElementById(SHARE_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = SHARE_STYLE_ID;
  el.textContent =
    '.brett-share-btn{font-family:var(--brett-font-sans,sans-serif);font-size:12px;' +
    'background:transparent;color:var(--brett-fg,#e7ead0);border:1px solid var(--brett-line,rgba(255,255,255,0.18));' +
    'border-radius:var(--brett-radius-sm,8px);padding:6px 12px;cursor:pointer;}' +
    '.brett-share-btn:hover{background:rgba(255,255,255,0.06);}';
  doc.head.appendChild(el);
}

export interface ShareMountOptions {
  roomToken: string;
  role: string | undefined | null;
  isAdmin: boolean;
  /** Injected for tests; defaults to the real fetch. */
  doFetch?: typeof fetch;
  /** Injected for tests; defaults to navigator.clipboard.writeText. */
  writeClipboard?: (text: string) => Promise<void> | void;
  /** Injected for tests; defaults to a transient DOM toast. */
  showToast?: (msg: string) => void;
}

/** Mount the share button into `slot`. No-op when the slot is absent or the
 *  current user is not leiter/admin. */
export function mountShareButton(slot: HTMLElement | null, opts: ShareMountOptions): void {
  if (!slot) return;
  if (!shareButtonVisible(opts.role, opts.isAdmin)) return;
  injectStyles();
  const btn = document.createElement('button');
  btn.id = 'share-btn';
  btn.className = 'brett-share-btn';
  btn.title = 'Board teilen';
  btn.setAttribute('aria-label', 'Board-Link teilen');
  btn.textContent = '🔗 Teilen';
  const fetcher = opts.doFetch ?? fetch;
  const clip = opts.writeClipboard ?? ((t: string) => navigator.clipboard?.writeText(t));
  const toast = opts.showToast ?? defaultToast;
  btn.addEventListener('click', async () => {
    try {
      const resp = await fetcher(`/api/rooms/${encodeURIComponent(opts.roomToken)}/share`, { method: 'POST' });
      if (!resp.ok) { toast('Teilen fehlgeschlagen.'); return; }
      const { url } = await resp.json();
      await clip(url);
      toast('Link in Zwischenablage kopiert!');
    } catch {
      toast('Teilen fehlgeschlagen.');
    }
  });
  slot.appendChild(btn);
}

function defaultToast(msg: string): void {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
    'background:#c8a96e;color:#0b111c;padding:8px 16px;border-radius:8px;z-index:200;font-size:13px;';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/topbar-share.test.ts 2>&1 | tail -10
npm run typecheck 2>&1 | tail -10
```
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/src/client/ui/topbar-share.ts brett/test/topbar-share.test.ts
git commit -m "feat(brett): topbar share button helper + tests [T000608]"
```

### Task E2: Wire the button into the board topbar

**Files:**
- Modify: `brett/public/index.html` (add slot)
- Modify: `brett/src/client/board-boot.ts` (mount call)

- [ ] **Step 1: Add the slot to `index.html`**

After line 354 (`<div id="topbar-invite-slot"></div>`) add:
```html
      <div id="topbar-share-slot"></div>
```

- [ ] **Step 2: Mount it in `board-boot.ts`**

Find where `mountInviteButton` is called in `board-boot.ts` (search `mountInviteButton`). Immediately after it, add a share-button mount. The current user's role + admin flag come from the lobby/ws state — board-boot already knows `currentUser` and the room. Use the room from `location.search`:

```ts
import { mountShareButton } from './ui/topbar-share';
// …inside bootBoard, alongside the other mount* calls:
{
  const roomToken = new URLSearchParams(location.search).get('room') || 'default';
  const me = await (await fetch('/auth/me')).json().catch(() => ({}));
  const roles = wsClient.getLobbyState().roster;
  const myRole = roles?.[me.userId]?.role;
  mountShareButton(document.getElementById('topbar-share-slot'), {
    roomToken,
    role: myRole,
    isAdmin: !!me.isAdmin,
  });
}
```

If `bootBoard` already fetched `/auth/me` (it does — search `auth/me` in board-boot), reuse that result instead of re-fetching; thread the role from the existing user object. The exact variable names depend on board-boot's body — read the relevant section and reuse the existing `user`/`isAdmin` locals rather than adding a second fetch. The mount is no-op for non-leiter/non-admin, so even if `myRole` is briefly stale on first mount, the worst case is the button is hidden (re-mount on a role update is out of scope for Phase 1).

- [ ] **Step 3: Typecheck + build**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
npm run typecheck 2>&1 | tail -10
npm run build 2>&1 | tail -10
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/public/index.html brett/src/client/board-boot.ts
git commit -m "feat(brett): mount Teilen button in board topbar (leiter/admin) [T000608]"
```

---

## Phase F: Tests (route + WS integration; E2E)

### Task F1: `node:test` integration tests `FA-BRT-41..45` (server routes + WS guest)

**Files:**
- Create: `brett/test/share-route.test.ts`

These run the real Express app + WS server in-process under `MOCK_DB=true`. Because `MOCK_DB` returns empty rows, the DB-backed `resolveShareToken` would always return null. So this test injects a controllable pool via `initDb`-replacement before importing `index.ts` is not feasible (index wires at import). Instead, test the HTTP routes and WS handler at the **handler level** with a stubbed `resolveShareToken`, mirroring how the other brett tests exercise modules directly (`auth.test.ts`, `permissions.test.ts`) rather than booting the full server. This keeps the tests offline-safe (no real Postgres) and CI-stable.

- [ ] **Step 1: Write the tests**

```ts
// brett/test/share-route.test.ts
// FA-BRT-41..45 — share-link route + WS guest gating (T000608).
// Handler-level tests (no live Postgres): resolveShareToken is stubbed via the
// pool argument; the WS guest path is exercised through attachWsServer with a
// fake wss + injected deps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveShareToken } from '../src/server/share-tokens';
import { gateMutation } from '../src/server/ws-handler';
import { canMutate, resolveRole } from '../src/server/permissions';

// FA-BRT-41: a valid token resolves to its room (the /share/:token route serves
// share.html only when resolveShareToken returns non-null).
test('FA-BRT-41: resolveShareToken returns the room for a valid token', async () => {
  const pool = { async query() { return { rows: [{ room_token: 'room-A' }] }; } };
  assert.equal(await resolveShareToken('valid', pool as any), 'room-A');
});

// FA-BRT-42: an invalid token resolves to null (route → 404).
test('FA-BRT-42: resolveShareToken returns null for an invalid token', async () => {
  const pool = { async query() { return { rows: [] }; } };
  assert.equal(await resolveShareToken('nope', pool as any), null);
});

// FA-BRT-43: the leiter/admin gate denies an unauthenticated POST.
test('FA-BRT-43: requireLeiterOrAdmin denies anon (403)', async () => {
  const { requireLeiterOrAdmin } = await import('../src/server/auth');
  delete process.env.BRETT_OIDC_SECRET;
  const req: any = { session: {}, params: { roomToken: 'r1' }, header: () => undefined };
  const res: any = { statusCode: 0, body: null, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
  let nexted = false;
  requireLeiterOrAdmin(() => ({}))(req, res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 403);
});

// FA-BRT-44: a guest WS connection may read (request_state_snapshot passes the gate).
test('FA-BRT-44: guest WS may request_state_snapshot', () => {
  const deps = { buildStateFromMutations: () => ({ sessionCode: 'X', roles: { u1: 'leiter' } }), figureMaps: new Map(), canMutate, resolveRole };
  assert.equal(gateMutation({ _isGuest: true }, 'room-A', 'request_state_snapshot', undefined, deps as any), true);
});

// FA-BRT-45: a guest WS write mutation is rejected by the gate.
test('FA-BRT-45: guest WS write mutation is denied', () => {
  const deps = { buildStateFromMutations: () => ({ sessionCode: 'X', roles: { u1: 'leiter' } }), figureMaps: new Map(), canMutate, resolveRole };
  for (const t of ['add', 'move', 'delete', 'figure_possess'] as const) {
    assert.equal(gateMutation({ _isGuest: true }, 'room-A', t, 'fig1', deps as any), false, `guest ${t} must be denied`);
  }
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
MOCK_DB=true npx tsx --test test/share-route.test.ts 2>&1 | tail -20
```
Expected: PASS (5 tests, FA-BRT-41..45).

- [ ] **Step 3: Run the FULL brett test suite (regression gate)**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
npm test 2>&1 | tail -25
```
Expected: all tests pass, including the pre-existing ones (no regressions from the `Role` union / `gateMutation` / `connectWS` changes).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-T000608-brett-share-link
git add brett/test/share-route.test.ts
git commit -m "test(brett): FA-BRT-41..45 share route + WS guest gating [T000608]"
```

### Task F2: Playwright E2E

**Files:**
- Create: `tests/e2e/specs/brett-share-link.spec.ts`
- Modify: `tests/e2e/playwright.config.ts` (add to `brett-mentolder` testMatch)

The E2E runs against the live `brett-mentolder` deployment (the project uses `storageState: '.auth/mentolder-brett.json'` for the leader context, and opens a fresh, unauthenticated context for the guest viewer). Model it on `brett-roles.spec.ts` (which "opens its own contexts").

- [ ] **Step 1: Read an existing brett e2e spec for the helpers/URL conventions**

```bash
sed -n '1,60p' /tmp/wt-T000608-brett-share-link/tests/e2e/specs/brett-roles.spec.ts
```
Note: base URL, how a board/session is created, how a fresh context is opened. Reuse those exact helpers (do not invent new ones).

- [ ] **Step 2: Write the spec**

```ts
// tests/e2e/specs/brett-share-link.spec.ts
// E2E for the public view-only share link (T000608). Leader (authed) creates a
// link; a fresh unauthenticated context opens it and sees the board read-only.
import { test, expect, chromium } from '@playwright/test';

test.describe('Brett share link (T000608)', () => {
  test('leader creates a share link; guest views the board read-only', async ({ page, baseURL }) => {
    // 1. Leader opens the board and starts a session (reuse the project's flow —
    //    mirror brett-roles.spec.ts: navigate, create session, become leiter).
    await page.goto(`${baseURL}/`);
    // …create-session steps copied from brett-roles.spec.ts…

    // 2. Click the Teilen button and capture the copied URL.
    const shareBtn = page.locator('#share-btn');
    await expect(shareBtn).toBeVisible();
    // Grant clipboard read so we can assert the copied link.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await shareBtn.click();
    await expect(page.getByText('Link in Zwischenablage kopiert!')).toBeVisible();
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareUrl).toContain('/share/');

    // 3. Open the link in a fresh, unauthenticated context.
    const browser = await chromium.launch();
    const guestCtx = await browser.newContext();          // NO storageState → anon
    const guest = await guestCtx.newPage();
    await guest.goto(shareUrl);

    // 4. View-only badge visible, board canvas renders, no edit UI.
    await expect(guest.locator('#view-only-badge')).toBeVisible();
    await expect(guest.locator('canvas')).toBeVisible({ timeout: 15000 });
    await expect(guest.locator('#fig-panel-btn')).toHaveCount(0); // editor absent
    await expect(guest.locator('#share-btn')).toHaveCount(0);

    await guestCtx.close();
    await browser.close();
  });

  test('a disabled / invalid link shows an error', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext();
    const guest = await ctx.newPage();
    await guest.goto(`${baseURL}/share/this-token-does-not-exist`);
    // The /share/:token route returns 404 text for an unknown token.
    await expect(guest.getByText(/ungültig|nicht mehr gültig/i)).toBeVisible();
    await ctx.close();
  });
});
```

The create-session steps in Step 2 must be copied verbatim from `brett-roles.spec.ts` — do not guess them; read that file and reuse its exact selectors/helpers.

- [ ] **Step 3: Register the spec in the `brett-mentolder` project**

In `tests/e2e/playwright.config.ts`, add to the `brett-mentolder` project's `testMatch` array (after `'**/brett-roles.spec.ts'`):
```ts
        '**/brett-share-link.spec.ts',  // T000608 public view-only share link
```

- [ ] **Step 4: Commit (E2E runs post-deploy, not in offline CI)**

```bash
cd /tmp/wt-T000608-brett-share-link
git add tests/e2e/specs/brett-share-link.spec.ts tests/e2e/playwright.config.ts
git commit -m "test(e2e): brett share-link viewer flow [T000608]"
```

Note for the executor: E2E here targets the live deployment. It will only pass after the brett image is built+deployed (`task feature:brett`) post-merge. The `dev-flow-e2e` skill drives the live run; offline CI (`task test:all`) does not execute Playwround against a cluster.

---

## Phase G: Build-Verify + PR

### Task G1: Full local verification (reproduce CI)

- [ ] **Step 1: brett typecheck + full unit suite + build**

```bash
cd /tmp/wt-T000608-brett-share-link/brett
npm run typecheck && npm test && npm run build 2>&1 | tail -30
```
Expected: all green; `dist/client/share.html` + `dist/client/index.html` present.

- [ ] **Step 2: Repo-level offline CI**

```bash
cd /tmp/wt-T000608-brett-share-link
bash scripts/task-oracle.sh 'run all offline tests'   # resolves to task test:all
```
Then run the resolved task. Expected: green. If `task test:all` includes a brett-typecheck gate (it does per repo memory — "brett typecheck gate now LIVE"), confirm it passes.

- [ ] **Step 3: Freshness / inventory check**

```bash
cd /tmp/wt-T000608-brett-share-link
bash scripts/task-oracle.sh 'regenerate test inventory'   # if a test-inventory task exists for brett
```
The CI test-inventory check compares `website/src/data/test-inventory.json`. Brett `node:test` files are not BATS/Playwright FA-* in that inventory, so this likely needs no change — but run the inventory task and `git diff` to be sure; commit any regenerated artifact.

- [ ] **Step 4: Verification gate (no success claims without evidence)**

REQUIRED SUB-SKILL: Use superpowers:verification-before-completion. Paste the actual command outputs (typecheck PASS, `npm test` summary line, build artifact listing) before claiming done.

### Task G2: Push + PR with auto-merge

- [ ] **Step 1: Push the branch**

```bash
cd /tmp/wt-T000608-brett-share-link
git push -u origin feature/T000608-brett-share-link
```

- [ ] **Step 2: Open the PR and enable auto-merge (per user preference)**

```bash
cd /tmp/wt-T000608-brett-share-link
gh pr create --fill --title "feat(brett): Board als öffentlichen View-only-Link teilen [T000608]" \
  --body "$(cat <<'EOF'
Implements public, login-free view-only board sharing (T000608).

- DB: brett_share_tokens table (migration 003) + share-tokens.ts helpers
- Server: /share/:token + /api/share/:token (public), /api/rooms/:roomToken/share* (leiter/admin)
- WS: new 'gast' role (fail-closed), guest detection from share_token, gateMutation guest short-circuit BEFORE the free-board bypass
- Client: share.html + share.ts second Vite entry; buildSyncUrl forwards share_token; Teilen topbar button (leiter/admin)
- Tests: brett node:test units (share-tokens, auth, permissions, ws-client, topbar-share) + FA-BRT-41..45 route/WS gating + Playwright E2E

Spec: docs/superpowers/specs/2026-06-11-brett-share-link-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --auto
```

- [ ] **Step 3: Post-merge deploy (executor, after CI green + merge)**

```bash
cd <fresh tree off origin/main>
bash scripts/task-oracle.sh 'build and deploy brett'   # → task feature:brett
```
Deploy from a FRESH tree off origin/main (per repo memory: `task feature:*` builds from the working tree — a stale checkout ships old code). Verify the served dir contains share.html:
```bash
kubectl --context fleet -n workspace exec deploy/brett -- ls /app/dist/client | grep share.html
```
Then run the live E2E via the `dev-flow-e2e` skill against `brett-mentolder`.

- [ ] **Step 4: Release the agent locks**

```bash
cd /home/patrick/Bachelorprojekt
bash scripts/agent-lock.sh release ticket T000608
bash scripts/agent-lock.sh release branch feature/T000608-brett-share-link
```

---

## Self-Review (run against the spec before handing off)

- **Spec coverage:** Migration 003 (A1) ✓; db.ts helpers → `share-tokens.ts` (A2) ✓; index.ts routes (B2) ✓; `requireLeiterOrAdmin` (B1) ✓; `gast` in Role (C1) ✓; `canMutate` gast (C2) ✓; `resolveRole` guest (C2) ✓; ws-handler share-token detection (C3) ✓; share.html (D2) ✓; share.ts (D2) ✓; vite second entry (D3) ✓; topbar Teilen button leiter/admin (E1/E2) ✓; unit tests (A2/B1/C2/E1) ✓; FA-BRT-41..45 (F1) ✓; E2E (F2) ✓; risks (rate-limit note, fail-closed gast, multi-entry build verify) addressed in tasks. Out-of-scope items (expires_at UI, password links, multi-link mgmt UI, analytics) deliberately NOT implemented — matches spec §"Nicht in Scope".
- **Spec deviations (intentional, justified in Ground-truth notes):** helpers in `share-tokens.ts` not `db.ts`; role getter injected into `requireLeiterOrAdmin` (no `rooms.getRoles`); tests are `node:test` not BATS; E2E in `tests/e2e/specs/` under `brett-mentolder` (no `brett` project/dir); guest short-circuit added to `gateMutation` to close the free-board bypass hole; `scene.ts` reused (already extracted); `buildSyncUrl` extraction to thread `share_token`.
- **Type consistency:** `resolveShareToken`/`createShareToken`/`disableShareToken`/`listShareTokens` signatures consistent across A2 (impl), B2 (routes), C3 (wsDeps), F1 (tests). `Role` includes `'gast'` everywhere it's used. `shareButtonVisible(role, isAdmin)` and `mountShareButton(slot, opts)` consistent E1↔E2. `buildSyncUrl(search, host, protocol, userId)` consistent D1 impl↔tests.
- **Placeholders:** none — every code step shows full content. The two "copy from brett-roles.spec.ts" notes (E2 board-boot locals, F2 create-session steps) are explicit read-and-reuse instructions because the exact existing locals/selectors must be matched verbatim, not invented.
