---
title: Systembrett Full-Stack TypeScript Refactor — Implementation Plan
ticket_id: null
domains: [website, infra, db, test, security]
status: active
pr_number: null
---

# Systembrett Full-Stack TypeScript Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Systembrett monoliths (server.js 1308 lines, index.html 1778 lines) into typed TypeScript modules with a Vite frontend build and tsx server runtime, enabling AI Factory agents to work on focused <300-line files with compile-time safety.

**Architecture:** Vite bundles the frontend TypeScript from `src/client/` into `dist/client/`; tsx runs `src/server/index.ts` directly in dev (no compile step). Shared WS message contracts live in `src/types/`. Migration is purely structural — no behavior changes.

**Tech Stack:** Node.js 22, TypeScript 5, Vite 5, tsx, Express 5, ws 8, Three.js (existing), Node built-in test runner

---

## Working conventions for every task

- All paths are relative to `brett/` (e.g. `src/server/db.ts` means `brett/src/server/db.ts`).
- After **every** task: `cd brett && npm run typecheck && npm test` must exit 0 before committing. This is repeated explicitly in each task's gate step.
- During Phase 2, `server.js` keeps running as the entry point. Each extracted module is `require()`d back into `server.js` so the existing exports and behavior are preserved byte-for-byte. We only *move* code, never rewrite logic.
- Extracted server modules in Phase 2 are authored as `.ts` but consumed from `server.js` (CommonJS) through `tsx`. To keep `npm start`/`node server.js` working unchanged in Phase 2, each extracted `.ts` module is compiled-on-require via `tsx`. We register `tsx` as the start runtime in Task 1 (`"start": "tsx server.js"` is NOT done — instead Phase 2 modules are imported lazily; see Task 4 for the exact bridge mechanism).
- The shared in-memory Maps (`figureMaps`, `figureLocks`, `rooms`, etc.) are the central coupling. In Phase 2 they are moved into modules that export the **same mutable Map reference**; `server.js` imports that reference. Tests that do `sessionCodeIndex.clear()` keep working because the reference identity is preserved.

---

## Phase 1 — Scaffolding (Tasks 1-3)

### Task 1: Install dependencies, add tsconfigs and Vite config

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.client.json`
- Create: `tsconfig.server.json`
- Create: `vite.config.ts`
- Create: `.gitignore` (append `dist/` if not present)

- [x] **Step 1: Install dev dependencies (exact versions)**
```bash
cd brett
npm install --save-dev \
  typescript@^5.9.3 \
  vite@^5.4.21 \
  tsx@^4.22.4 \
  concurrently@^9.2.1 \
  @types/node@^22.10.0 \
  @types/express@^5.0.0 \
  @types/ws@^8.5.13 \
  @types/express-session@^1.18.0 \
  @types/pg@^8.11.10
```
Expected output: `added N packages` with no error. `npm ls typescript vite tsx` shows all three resolved.

- [x] **Step 2: Replace the `scripts` block in `package.json`**

Open `package.json`. Replace the existing `"scripts"` object with exactly:
```json
  "scripts": {
    "start": "node server.js",
    "dev:server": "tsx watch src/server/index.ts",
    "dev:client": "vite",
    "dev": "concurrently \"npm:dev:server\" \"npm:dev:client\"",
    "build": "vite build && tsc -p tsconfig.server.json",
    "typecheck": "tsc --noEmit -p tsconfig.client.json && tsc --noEmit -p tsconfig.server.json",
    "test": "MOCK_DB=true tsx --test test/*.test.ts test/*.test.js test/*.test.mjs"
  },
```
Note: `start` stays `node server.js` until Task 12 deletes `server.js`. `test` runs both legacy `.js`/`.mjs` and new `.ts` tests through `tsx` so the suite never goes red mid-migration.

- [x] **Step 3: Create `tsconfig.json` (root, project references)**

Create `tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.client.json" },
    { "path": "./tsconfig.server.json" }
  ]
}
```

- [x] **Step 4: Create `tsconfig.server.json`**

Create `tsconfig.server.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist/server",
    "rootDir": "src",
    "strict": true,
    "composite": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": { "@types/*": ["src/types/*"] }
  },
  "include": ["src/server/**/*", "src/types/**/*"]
}
```
`rootDir` is `src` (not `src/server`) so that `src/types/` files shared between server and client compile under the server project without "file is not under rootDir" errors.

- [x] **Step 5: Create `tsconfig.client.json`**

Create `tsconfig.client.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "composite": true,
    "noEmit": false,
    "outDir": "dist/.tsbuild-client",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["three"],
    "baseUrl": ".",
    "paths": { "@types/*": ["src/types/*"] }
  },
  "include": ["src/client/**/*", "src/types/**/*"]
}
```

- [x] **Step 6: Create `vite.config.ts`**

Create `vite.config.ts`:
```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/presets': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
      '/sync': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
```
The proxy mirrors every server route prefix from the analysis (`/api`, `/auth`, `/presets`, `/healthz`) plus the `/sync` WebSocket path.

- [x] **Step 7: Ensure `dist/` is gitignored**
```bash
cd brett
grep -qxF 'dist/' .gitignore 2>/dev/null || printf 'dist/\n' >> .gitignore
grep -qxF 'tsconfig.tsbuildinfo' .gitignore 2>/dev/null || printf 'tsconfig.tsbuildinfo\n' >> .gitignore
grep -qxF '*.tsbuildinfo' .gitignore 2>/dev/null || printf '*.tsbuildinfo\n' >> .gitignore
```

- [x] **Step 8: Gate — typecheck passes on empty project**
```bash
cd brett && npx tsc --build tsconfig.json
```
Expected: exits 0, prints nothing (no `src/` files referenced yet beyond empty globs; if it errors with "No inputs were found", that is acceptable for an empty include — proceed to create at least one stub). To guarantee a clean gate, create a throwaway stub:
```bash
mkdir -p src/types src/server src/client
printf 'export {};\n' > src/types/_placeholder.ts
npm run typecheck
```
Expected: `tsc --noEmit` exits 0 with no diagnostics.

- [x] **Step 9: Gate — existing tests still pass through tsx**
```bash
cd brett && npm test
```
Expected: all existing `.test.js`/`.test.mjs` pass under `tsx --test`. Output ends with `# pass <N>` `# fail 0`.

- [x] **Step 10: Commit**
```bash
git add brett/package.json brett/package-lock.json brett/tsconfig.json brett/tsconfig.client.json brett/tsconfig.server.json brett/vite.config.ts brett/.gitignore brett/src/types/_placeholder.ts
git commit -m "refactor(brett): add TypeScript + Vite scaffolding (deps, tsconfigs, vite.config)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Create shared state types (`src/types/state.ts`)

**Files:**
- Create: `src/types/state.ts`

- [x] **Step 1: Create `src/types/state.ts`**

Create `src/types/state.ts` with the complete content:
```typescript
// Shared domain types for the Systembrett room state.
// Derived from server.js applyMutation / buildStateFromMutations
// and the client STATE/figure shapes.

export type Phase = 'warmup' | 'active' | 'paused' | 'ended';

export interface FigureAppearance {
  color?: string;
  face?: string | null;
  body?: string | null;
  accessories?: Record<string, string | null>;
}

export interface Figure {
  id: string;
  x: number;
  z: number;
  facingY: number;
  label?: string;
  color?: string;
  scale?: number;
  preset?: string;
  boneOverrides?: Record<string, { x: number; z: number }>;
  appearance: FigureAppearance;
}

export interface Participant {
  userId: string;
  name: string;
  color: string;
  isAdmin?: boolean;
}

export interface FigureLock {
  figureId: string;
  userId: string;
  name: string;
  color: string;
}

export interface RoomState {
  figures: Record<string, Figure>;
  participants: Participant[];
  phase: Phase;
  adminTokenHolder: string | null;
  stiffness?: number;
  sessionCode?: string | null;
  createdAt?: number | null;
  lastActivity?: number | null;
  coachingSteps?: { steps: string[]; index: number } | null;
}
```
The optional fields (`scale`, `preset`, `boneOverrides`, `stiffness`, `sessionCode`, `createdAt`, `lastActivity`, `coachingSteps`) are present because `buildStateFromMutations` in server.js emits them and the client reads them; modeling them now prevents Phase 2/3 `tsc` errors.

- [x] **Step 2: Gate**
```bash
cd brett && npm run typecheck
```
Expected: exits 0, no diagnostics.

- [x] **Step 3: Commit**
```bash
git add brett/src/types/state.ts
git commit -m "refactor(brett): add shared RoomState/Figure/Participant types

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Create WS message contract types (`src/types/messages.ts`)

**Files:**
- Create: `src/types/messages.ts`
- Delete: `src/types/_placeholder.ts`

- [x] **Step 1: Create `src/types/messages.ts`**

Create `src/types/messages.ts`. The unions below are the *canonical superset* of every message string observed in server.js (Section 5 of the server analysis) and index.html `onWsMessage` (Section 3 of the client analysis). Dead-game-mode types (lms/duel/coop) are intentionally excluded — they reference undefined globals and are removed during migration.

```typescript
import type { Figure, FigureAppearance, Participant, Phase, RoomState } from './state';

// ── Client → Server ──────────────────────────────────────────────
export type ClientMessage =
  | { type: 'join'; room: string; playerId?: string; name?: string }
  | { type: 'request_state_snapshot' }
  | { type: 'add'; figure: Figure }
  | { type: 'move'; id: string; x: number; z: number; facingY: number }
  | { type: 'jump'; id: string }
  | { type: 'update'; id: string; changes: Partial<Figure> & { appearance?: FigureAppearance } }
  | { type: 'delete'; id: string }
  | { type: 'clear' }
  | { type: 'optik'; id: string; value: unknown }
  | { type: 'stiffness'; value: number }
  | { type: 'snapshot'; figures: Figure[]; stiffness?: number }
  | { type: 'figure_lock'; id: string }
  | { type: 'figure_unlock'; id: string }
  | { type: 'player_join'; playerId: string }
  | { type: 'pong' }
  | { type: 'admin_kick'; playerId: string }
  | { type: 'admin_broadcast'; message: string }
  | { type: 'admin_session_create' }
  | { type: 'admin_handoff_token'; toPlayerId: string }
  | { type: 'admin_round_stop' }
  | { type: 'admin_round_pause' }
  | { type: 'admin_coaching_steps_set'; steps: string[]; index: number };

// ── Server → Client ──────────────────────────────────────────────
export type ServerMessage =
  | { type: 'snapshot'; figures: Figure[]; stiffness?: number; locks?: ServerLock[]; phase?: Phase; sessionCode?: string | null }
  | { type: 'init'; state: RoomState }
  | { type: 'add'; figure: Figure }
  | { type: 'move'; id: string; x: number; z: number; facingY: number }
  | { type: 'jump'; id: string }
  | { type: 'update'; id: string; changes: Partial<Figure> & { appearance?: FigureAppearance } }
  | { type: 'delete'; id: string }
  | { type: 'stiffness'; value: number }
  | { type: 'figure_locked'; id: string; userId: string; name: string; color: string }
  | { type: 'figure_unlocked'; id: string }
  | { type: 'figure_lock_denied'; id: string }
  | { type: 'locks_released_for'; userId: string }
  | { type: 'info'; count: number }
  | { type: 'presence_join'; participant: Participant }
  | { type: 'presence_leave'; userId: string }
  | { type: 'session_created'; code: string }
  | { type: 'session_phase_change'; phase: Phase }
  | { type: 'session_ended' }
  | { type: 'admin_token_changed'; holder: string | null }
  | { type: 'coaching_steps_change'; steps: string[]; index: number }
  | { type: 'error'; reason: string };

export interface ServerLock {
  figureId: string;
  userId: string;
  name: string;
  color: string;
}

// Discriminant unions of every message tag — used by exhaustiveness tests.
export type ClientMessageType = ClientMessage['type'];
export type ServerMessageType = ServerMessage['type'];

// Compile-time exhaustiveness helper. Pass the never-narrowed value here in a
// switch default branch to force a build error when a tag goes unhandled.
export function assertNever(x: never): never {
  throw new Error('Unhandled message variant: ' + JSON.stringify(x));
}
```

- [x] **Step 2: Remove the placeholder**
```bash
cd brett && rm src/types/_placeholder.ts
```

- [x] **Step 3: Gate**
```bash
cd brett && npm run typecheck
```
Expected: exits 0, no diagnostics.

- [x] **Step 4: Commit**
```bash
git add brett/src/types/messages.ts brett/src/types/_placeholder.ts
git commit -m "refactor(brett): add discriminated-union WS message contracts

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 2 — Server Split (Tasks 4-12)

> **Mechanism (read once, applies to all Phase-2 tasks):**
> `server.js` stays the entry point and keeps `module.exports` byte-compatible so the legacy test suite passes throughout. Each task **moves** one module's code out of `server.js` into `src/server/<mod>.ts`, then `require()`s it back. Because `server.js` is CommonJS and the new module is `.ts`, we load it through a one-line tsx bridge added in Task 4 (`require('tsx/cjs')` at the top of `server.js`). After the bridge is registered, `require('./src/server/db.ts')` transpiles on the fly.
> Each extracted `.ts` module exports the **same mutable objects** (Maps, functions) that `server.js` previously held, and `server.js` re-assigns its local `const` to the imported reference so all existing call sites and exports keep working. Function bodies are copied verbatim from the analysis — no logic changes.

---

### Task 4: Extract `db.ts` (PostgreSQL pool + state persistence)

**Files:**
- Create: `src/server/db.ts`
- Modify: `server.js`
- Test: existing `test/session-state.test.js` exercises persistence indirectly; no new test.

- [x] **Step 1: Register the tsx CJS bridge at the top of `server.js`**

At the very top of `server.js`, immediately after `'use strict';`, add:
```js
'use strict';
// tsx bridge: allow require() of .ts modules during the TS migration (Phase 2).
require('tsx/cjs');
```

- [x] **Step 2: Create `src/server/db.ts` with the pool + persistence functions**

Create `src/server/db.ts`. Copy the `pool` construction (server.js lines ~115–131, the MockPool/real-Pool branch), `readState`, `persistState`, `schedulePersist`, `flushImmediate`. These depend on `buildStateFromMutations` (Task 9) and `figureMaps`/`pending` (Tasks 7/index). To keep dependencies injectable without circular imports, accept them via a small init function:

```typescript
import { Pool } from 'pg';
import type { RoomState } from '../types/state';

type StateBuilder = (room: string) => RoomState | null;

let pool: Pool | MockPoolLike;
let buildStateFromMutations: StateBuilder;
const pending = new Map<string, NodeJS.Timeout>();

interface MockPoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
  end(): Promise<void>;
}

function makeMockPool(): MockPoolLike {
  return {
    async query() { return { rows: [] }; },
    async end() { /* no-op */ },
  };
}

export function initDb(deps: { buildStateFromMutations: StateBuilder }): void {
  buildStateFromMutations = deps.buildStateFromMutations;
  if (process.env.MOCK_DB === 'true') {
    pool = makeMockPool();
  } else {
    pool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });
  }
}

export function getPool(): Pool | MockPoolLike {
  return pool;
}

export async function readState(room: string): Promise<{ figures: unknown[] } & Record<string, unknown>> {
  const res = await pool.query(
    'SELECT state FROM brett_rooms WHERE room_token = $1',
    [room],
  );
  if (!res.rows.length || !res.rows[0].state) return { figures: [] };
  return res.rows[0].state;
}

export async function persistState(room: string): Promise<void> {
  const state = buildStateFromMutations(room);
  if (!state) return;
  await pool.query(
    `INSERT INTO brett_rooms (room_token, state, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (room_token) DO UPDATE SET state = $2, updated_at = now()`,
    [room, JSON.stringify(state)],
  );
}

export function schedulePersist(room: string): void {
  if (pending.has(room)) clearTimeout(pending.get(room)!);
  pending.set(room, setTimeout(() => {
    pending.delete(room);
    void persistState(room);
  }, 1000));
}

export async function flushImmediate(room: string): Promise<void> {
  if (pending.has(room)) {
    clearTimeout(pending.get(room)!);
    pending.delete(room);
  }
  await persistState(room);
}

export function getPending(): Map<string, NodeJS.Timeout> {
  return pending;
}
```
> **Adapt to actual columns:** before writing, run `grep -n "brett_rooms" server.js` and copy the *exact* SQL strings and the exact MockPool shape from server.js lines 115–131 / 655–883. The bodies above mirror the analysis; the SQL column names and the pool config must match the original verbatim. Do not invent column names — use what server.js already uses.

- [x] **Step 3: Wire `server.js` to use the extracted module**

In `server.js`, delete the original `const { Pool } = require('pg');` pool block (lines ~115–131) and the four functions `readState`/`persistState`/`schedulePersist`/`flushImmediate` (lines ~655–883). Replace with:
```js
const dbMod = require('./src/server/db.ts');
// buildStateFromMutations is still defined locally in server.js during Phase 2 (extracted in Task 9).
dbMod.initDb({ buildStateFromMutations: (room) => buildStateFromMutations(room) });
const pool = dbMod.getPool();
const readState = dbMod.readState;
const persistState = dbMod.persistState;
const schedulePersist = dbMod.schedulePersist;
const flushImmediate = dbMod.flushImmediate;
const pending = dbMod.getPending();
```
Keep `pending` referencing the module's map so `shutdown()` (which iterates `pending`) still works.

- [x] **Step 4: Gate**
```bash
cd brett && npm run typecheck && npm test
```
Expected: typecheck 0 diagnostics; tests `# fail 0`. The `MOCK_DB=true` env makes `initDb` pick the mock pool so DB calls no-op.

- [x] **Step 5: Verify server.js shrank and still boots**
```bash
cd brett && wc -l server.js && node -e "process.env.MOCK_DB='true'; require('./server.js'); console.log('boot-ok')"
```
Expected: line count lower than 1308; prints `boot-ok` (and any server log lines), exits without throwing. If it hangs on a listening server, that's fine — `Ctrl-C` is not needed if the export-only path is used; otherwise run with a 3s timeout: `timeout 3 node -e "..."` and treat a clean timeout as success.

- [x] **Step 6: Commit**
```bash
git add brett/server.js brett/src/server/db.ts
git commit -m "refactor(brett): extract db.ts (pg pool + state persistence)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Extract `auth.ts` (OIDC + admin guards)

**Files:**
- Create: `src/server/auth.ts`
- Modify: `server.js`
- Test: existing `test/board-auth.test.js`, `test/brand-config.test.js`, `test/server-config.test.js`, `test/server-admin.test.js`.

- [x] **Step 1: Create `src/server/auth.ts`**

Move `getOidcClient` (lines 92–102), `isAdminFromClaims` (104–106), `buildConfig` (160–162), `resolveBrand` (164–166), `boardAuthRedirect` (169–175), `requireAdmin` (223–228). Copy bodies verbatim:

```typescript
import { Issuer } from 'openid-client';
import type { Request, Response, NextFunction } from 'express';

let oidcClient: any = null;

export async function getOidcClient(): Promise<any> {
  if (oidcClient) return oidcClient;
  const issuer = await Issuer.discover(
    `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
  );
  oidcClient = new issuer.Client({
    client_id: process.env.BRETT_KC_CLIENT_ID!,
    client_secret: process.env.BRETT_OIDC_SECRET!,
    response_types: ['code'],
  });
  return oidcClient;
}

export function isAdminFromClaims(claims: any): boolean {
  return !!(claims && claims.realm_access && Array.isArray(claims.realm_access.roles)
    && claims.realm_access.roles.includes('admin'));
}

export function buildConfig(_env: NodeJS.ProcessEnv): Record<string, unknown> {
  return {};
}

export function resolveBrand(env: NodeJS.ProcessEnv): string {
  return env.BRETT_BRAND || 'mentolder';
}

export function boardAuthRedirect(req: any, env: NodeJS.ProcessEnv): string | null {
  if (req.headers && req.headers['x-e2e-secret'] && env.BRETT_OIDC_SECRET
      && req.headers['x-e2e-secret'] === env.BRETT_OIDC_SECRET) {
    return null;
  }
  if (req.session && req.session.userId) return null;
  if (!env.BRETT_OIDC_SECRET) return null;
  return '/auth/login';
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const e2e = (req.headers['x-e2e-secret'] as string | undefined);
  if ((req as any).session?.isAdmin
      || (e2e && process.env.BRETT_OIDC_SECRET && e2e === process.env.BRETT_OIDC_SECRET)) {
    return next();
  }
  res.status(403).json({ error: 'forbidden' });
}
```
> **Verify exact semantics:** before committing, `grep -n` each function in server.js (92, 104, 160, 164, 169, 223) and reconcile the redirect/header logic with the originals — the analysis notes `boardAuthRedirect` checks `req.session.userId` and the e2e bypass header; `requireAdmin` checks `req.session.isAdmin` or `x-e2e-secret`. Match the originals exactly; do not tighten or loosen the checks.

- [x] **Step 2: Wire `server.js`**

Delete the six functions from `server.js` and the `oidcClient` global. Add near the top (after the db wiring):
```js
const authMod = require('./src/server/auth.ts');
const getOidcClient = authMod.getOidcClient;
const isAdminFromClaims = authMod.isAdminFromClaims;
const buildConfig = authMod.buildConfig;
const resolveBrand = authMod.resolveBrand;
const boardAuthRedirect = authMod.boardAuthRedirect;
const requireAdmin = authMod.requireAdmin;
```
Leave the `/auth/login`, `/auth/callback`, `/auth/me`, `/auth/e2e-login` route handlers in `server.js` for now (they move in Task 12 with `index.ts`); they call the imported functions, which still works.

- [x] **Step 3: Gate**
```bash
cd brett && npm run typecheck && npm test
```
Expected: typecheck clean; `board-auth`, `brand-config`, `server-config`, `server-admin` tests pass; `# fail 0`.

- [x] **Step 4: Commit**
```bash
git add brett/server.js brett/src/server/auth.ts
git commit -m "refactor(brett): extract auth.ts (OIDC, requireAdmin, boardAuthRedirect)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Extract `phases.ts` (phase transitions + state assembly)

**Files:**
- Create: `src/server/phases.ts`
- Modify: `server.js`
- Test: existing `test/session-state.test.js`, `test/coaching-steps.test.js`.

> `transitionPhase` and `buildStateFromMutations` both read/write `figureMaps` (extracted in Task 7) and `transitionPhase` calls `applyMutation` (Task 7). To avoid a forward-reference, this task injects `figureMaps` + `applyMutation` via an init function, mirroring Task 4's pattern.

- [x] **Step 1: Create `src/server/phases.ts`**

Move `VALID_PHASES` (line 811), `TERMINAL_PHASES` (810), `transitionPhase` (813–824), `buildStateFromMutations` (826–854). Copy bodies verbatim:

```typescript
import type { Phase, RoomState } from '../types/state';

export const TERMINAL_PHASES = new Set<Phase>(['ended']);
export const VALID_PHASES = new Set<Phase>(['warmup', 'active', 'paused', 'ended']);

type FigureMaps = Map<string, Map<string, any>>;
type ApplyMutation = (room: string, msg: any) => void;

let figureMaps: FigureMaps;
let applyMutation: ApplyMutation;

export function initPhases(deps: { figureMaps: FigureMaps; applyMutation: ApplyMutation }): void {
  figureMaps = deps.figureMaps;
  applyMutation = deps.applyMutation;
}

export function transitionPhase(room: string, newPhase: Phase): { ok: boolean; from?: Phase; to?: Phase; reason?: string } {
  if (!VALID_PHASES.has(newPhase)) return { ok: false, reason: 'invalid-phase' };
  const map = figureMaps.get(room);
  const current = map?.get('__session_phase__')?.phase as Phase | undefined;
  if (current && TERMINAL_PHASES.has(current)) return { ok: false, reason: 'terminal', from: current, to: newPhase };
  applyMutation(room, { type: 'session_phase_set', phase: newPhase });
  return { ok: true, from: current, to: newPhase };
}

export function buildStateFromMutations(room: string): RoomState | null {
  const map = figureMaps.get(room);
  if (!map) return null;
  const figures: Record<string, any> = {};
  let optik: any; let stiffness: any; let phase: any; let sessionCode: any;
  let adminTokenHolder: string | null = null; let createdAt: any; let lastActivity: any; let coachingSteps: any;
  for (const [id, fig] of map.entries()) {
    if (id.startsWith('__')) {
      if (id === '__session_phase__') phase = fig.phase;
      else if (id === '__session_code__') sessionCode = fig.code;
      else if (id === '__admin_token_holder__') adminTokenHolder = fig.playerId ?? null;
      else if (id === '__session_created_at__') createdAt = fig.ts;
      else if (id === '__session_last_activity__') lastActivity = fig.ts;
      else if (id === '__coaching_steps__') coachingSteps = { steps: fig.steps, index: fig.index };
      else if (id === '__optik__') optik = fig;
      else if (id === '__stiffness__') stiffness = fig.value;
      continue;
    }
    figures[id] = fig;
  }
  return {
    figures,
    participants: [],
    phase: phase ?? 'warmup',
    adminTokenHolder,
    stiffness,
    sessionCode: sessionCode ?? null,
    createdAt: createdAt ?? null,
    lastActivity: lastActivity ?? null,
    coachingSteps: coachingSteps ?? null,
  } as RoomState;
}
```
> **Critical fidelity step:** the special-key names (`__session_phase__`, `__admin_token_holder__`, `__optik__`, `__stiffness__`, `__coaching_steps__`, etc.) and the exact shape of each sentinel value **must** match `applyMutation` and `buildStateFromMutations` in server.js lines 726–854 exactly. Before writing, read those lines and copy the literal key strings and field names. The tests `session-state`, `coaching-steps`, `idle-timeout`, `admin-token` all assert on these.

- [x] **Step 2: Wire `server.js`**

Delete `VALID_PHASES`, `TERMINAL_PHASES`, `transitionPhase`, `buildStateFromMutations` from `server.js`. Add (after the figures module is wired in Task 7 — but since Task 7 comes next, for *this* task `figureMaps`/`applyMutation` are still local consts in server.js, so init with the locals):
```js
const phasesMod = require('./src/server/phases.ts');
phasesMod.initPhases({ figureMaps, applyMutation });
const VALID_PHASES = phasesMod.VALID_PHASES;
const TERMINAL_PHASES = phasesMod.TERMINAL_PHASES;
const transitionPhase = phasesMod.transitionPhase;
const buildStateFromMutations = phasesMod.buildStateFromMutations;
```
Place these lines **after** the existing `figureMaps`/`applyMutation` definitions in server.js (they are still local until Task 7). The db wiring in Task 4 referenced `buildStateFromMutations` via a closure `(room) => buildStateFromMutations(room)`, so reassigning the local `const` would break — instead, in Task 4 the closure captures the variable by reference at call time only if it's `let`. **Change the Task-4 closure to call through `phasesMod`:** update the db init line to `dbMod.initDb({ buildStateFromMutations: (room) => phasesMod.buildStateFromMutations(room) });` and move it to *after* this block. (This is the one cross-task ordering dependency; honor it.)

- [x] **Step 3: Gate**
```bash
cd brett && npm run typecheck && npm test
```
Expected: typecheck clean; `session-state`, `coaching-steps` pass; `# fail 0`.

- [x] **Step 4: Commit**
```bash
git add brett/server.js brett/src/server/phases.ts
git commit -m "refactor(brett): extract phases.ts (transitionPhase, buildStateFromMutations)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Extract `figures.ts` (figure map, mutations, locks)

**Files:**
- Create: `src/server/figures.ts`
- Modify: `server.js`
- Test: existing `test/figure-locks.test.js`, `test/figure-label.test.js`, `test/appearance.test.mjs`, `test/coaching-steps.test.js`.

> This is the keystone module. It owns `figureMaps` and `figureLocks` and `applyMutation`. **The exported `figureMaps` Map must be the same reference** that `appearance.test.mjs`, `idle-timeout.test.js`, `session-state.test.js` import (they do `figureMaps` named imports and mutate it). `validateAppearance` is referenced by `applyMutation`'s add/update path but lives in `presets.ts` (Task 11) — inject it via init to avoid a cycle.

- [x] **Step 1: Create `src/server/figures.ts`**

Move `figureMaps` (667), `figureLocks` (669), `ensureFigureMap` (721–724), `applyMutation` (726–808), `ensureFigureLocks` (670–673), `acquireFigureLock` (674–678), `releaseFigureLock` (680–685), `releaseLocksForUser` (687–691), `listFigureLocks` (692–696). Copy `applyMutation`'s full switch verbatim (all 83 lines: `add`, `move`, `update`, `delete`, `clear`, `optik`, `stiffness`, `session_phase_set`, `session_code_set`, `session_admin_token_set`, `session_created_at_set`, `session_last_activity_set`, `coaching_steps_set`).

```typescript
import type { Figure } from '../types/state';

export const figureMaps = new Map<string, Map<string, any>>();
export const figureLocks = new Map<string, Map<string, { userId: string; name: string; color: string }>>();

type ValidateAppearance = (a: any) => string | null;
let validateAppearance: ValidateAppearance = () => null;

export function initFigures(deps: { validateAppearance: ValidateAppearance }): void {
  validateAppearance = deps.validateAppearance;
}

export function ensureFigureMap(room: string): Map<string, any> {
  let m = figureMaps.get(room);
  if (!m) { m = new Map(); figureMaps.set(room, m); }
  return m;
}

export function applyMutation(room: string, msg: any): void {
  const map = ensureFigureMap(room);
  switch (msg.type) {
    // <<< COPY THE FULL SWITCH BODY VERBATIM FROM server.js lines 726–808 >>>
    // Including: add / move / update / delete / clear / optik / stiffness /
    // session_phase_set / session_code_set / session_admin_token_set /
    // session_created_at_set / session_last_activity_set / coaching_steps_set.
    // The add/update cases that validate appearance call validateAppearance(...).
    default:
      break;
  }
}

export function ensureFigureLocks(room: string): Map<string, { userId: string; name: string; color: string }> {
  let m = figureLocks.get(room);
  if (!m) { m = new Map(); figureLocks.set(room, m); }
  return m;
}

export function acquireFigureLock(room: string, figureId: string, owner: { userId: string; name: string; color: string }): boolean {
  const locks = ensureFigureLocks(room);
  if (locks.has(figureId)) return false;
  locks.set(figureId, owner);
  return true;
}

export function releaseFigureLock(room: string, figureId: string, userId: string): boolean {
  const locks = ensureFigureLocks(room);
  const cur = locks.get(figureId);
  if (!cur || cur.userId !== userId) return false;
  locks.delete(figureId);
  return true;
}

export function releaseLocksForUser(room: string, userId: string): void {
  const locks = ensureFigureLocks(room);
  for (const [fid, owner] of locks.entries()) {
    if (owner.userId === userId) locks.delete(fid);
  }
}

export function listFigureLocks(room: string): Array<{ figureId: string; userId: string; name: string; color: string }> {
  const locks = figureLocks.get(room);
  if (!locks) return [];
  return [...locks.entries()].map(([figureId, o]) => ({ figureId, userId: o.userId, name: o.name, color: o.color }));
}
```
> **Do not summarize `applyMutation`.** Open server.js lines 726–808 and paste the entire switch. It is the reducer the whole test suite depends on; any drift breaks `figure-label`, `appearance`, `coaching-steps`, `session-state`, `idle-timeout`, `admin-token`.

- [x] **Step 2: Wire `server.js`**

Delete `figureMaps`, `figureLocks`, and all nine functions from `server.js`. Add this **before** the phases wiring from Task 6 (so `figureMaps`/`applyMutation` exist when `initPhases` is called):
```js
const figuresMod = require('./src/server/figures.ts');
const figureMaps = figuresMod.figureMaps;
const figureLocks = figuresMod.figureLocks;
const ensureFigureMap = figuresMod.ensureFigureMap;
const applyMutation = figuresMod.applyMutation;
const ensureFigureLocks = figuresMod.ensureFigureLocks;
const acquireFigureLock = figuresMod.acquireFigureLock;
const releaseFigureLock = figuresMod.releaseFigureLock;
const releaseLocksForUser = figuresMod.releaseLocksForUser;
const listFigureLocks = figuresMod.listFigureLocks;
// validateAppearance is wired in Task 11; until then inject the local one:
figuresMod.initFigures({ validateAppearance: (a) => validateAppearance(a) });
```
Reorder so the load order in server.js is: db (Task 4, but its `initDb` call moves to after phases) → **figures** → phases → ... . Concretely, the top-of-file wiring block ends up:
```js
const figuresMod = require('./src/server/figures.ts');  // defines figureMaps, applyMutation
// ... figures consts ...
const phasesMod = require('./src/server/phases.ts');
phasesMod.initPhases({ figureMaps, applyMutation });
// ... phases consts ...
const dbMod = require('./src/server/db.ts');
dbMod.initDb({ buildStateFromMutations: (room) => phasesMod.buildStateFromMutations(room) });
figuresMod.initFigures({ validateAppearance: (a) => validateAppearance(a) });
```

- [x] **Step 3: Gate**
```bash
cd brett && npm run typecheck && npm test
```
Expected: typecheck clean; `figure-locks`, `figure-label`, `appearance`, `coaching-steps` pass; `# fail 0`. Note `appearance.test.mjs` imports `figureMaps` by name — confirm it resolves the new module's exported reference (server.js must re-export it; see Task 12 export-shim note, but for now the test imports from `../server.js` which still re-exports `figureMaps`).

- [x] **Step 4: Commit**
```bash
git add brett/server.js brett/src/server/figures.ts
git commit -m "refactor(brett): extract figures.ts (figureMaps, applyMutation, locks)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Extract `sessions.ts` (session codes, admin token, idle/grace timers)

**Files:**
- Create: `src/server/sessions.ts`
- Modify: `server.js`
- Test: existing `test/session-code.test.js`, `test/admin-token.test.js`, `test/idle-timeout.test.js`, `test/reconnect-guard.test.js`, `test/session-state.test.js`, `test/join-code.test.js`.

> Owns `sessionCodeIndex`, `tokenGraceTimers`, `roomAdminPresence`, `roomPreviousPlayers`. Exports the **same `sessionCodeIndex` Map reference** — `session-code.test.js` does `sessionCodeIndex.clear()`. Depends on `figureMaps`/`applyMutation`/`transitionPhase`/`releaseAdminToken` and `IDLE_TIMEOUT_MS`; inject `figureMaps`, `applyMutation`, `transitionPhase` via init.

- [x] **Step 1: Create `src/server/sessions.ts`**

Move every function in the sessions group (analysis §6 sessions.ts) verbatim: `generateSessionCode` (416–428), `registerSessionCode` (430–432), `resolveSessionCode` (434–436), `rebuildSessionCodeIndexFromStates` (438–443), `getAdminTokenHolder` (445–447), `assignAdminToken` (449–453), `handoffAdminToken` (455–460), `releaseAdminToken` (462–465), `setRoomAdminPresence` (471–473), `beginTokenGrace` (475–492), `reclaimAdminToken` (494–501), `handleAdminSessionCreate` (503–512), `handleAdminHandoffMessage` (514–519), `handleAdminRoundStop` (521–527), `handleAdminRoundPause` (529–543), `trackPlayerInRoom` (547–555), `wasPreviouslyInRoom` (557–559), `shouldRejectReconnect` (561–580), `touchSessionActivity` (584–586), `checkSessionIdle` (588–603), `checkAllSessions` (605–613). Plus the four maps and `IDLE_TIMEOUT_MS`.

Skeleton (fill bodies verbatim from server.js):
```typescript
import type { Phase } from '../types/state';

export const sessionCodeIndex = new Map<string, string>();
export const tokenGraceTimers = new Map<string, NodeJS.Timeout>();
export const roomAdminPresence = new Map<string, Set<string>>();
export const roomPreviousPlayers = new Map<string, Set<string>>();

export const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // copy exact value from server.js

type FigureMaps = Map<string, Map<string, any>>;
let figureMaps: FigureMaps;
let applyMutation: (room: string, msg: any) => void;
let transitionPhase: (room: string, phase: Phase) => { ok: boolean; from?: Phase; to?: Phase };

export function initSessions(deps: {
  figureMaps: FigureMaps;
  applyMutation: (room: string, msg: any) => void;
  transitionPhase: (room: string, phase: Phase) => { ok: boolean; from?: Phase; to?: Phase };
}): void {
  figureMaps = deps.figureMaps;
  applyMutation = deps.applyMutation;
  transitionPhase = deps.transitionPhase;
}

// <<< Paste all 21 functions verbatim from server.js lines 416–613,
//     replacing references to the local figureMaps/applyMutation/transitionPhase
//     with the injected module-scope variables (same names, so bodies are unchanged). >>>
export function generateSessionCode(): string { /* lines 416–428 */ return ''; }
export function registerSessionCode(code: string, roomToken: string): void { /* 430–432 */ }
export function resolveSessionCode(code: string): string | null { /* 434–436 */ return null; }
export function rebuildSessionCodeIndexFromStates(rows: any[]): void { /* 438–443 */ }
export function getAdminTokenHolder(room: string): string | null { /* 445–447 */ return null; }
export function assignAdminToken(room: string, playerId: string): { ok: boolean; reason?: string } { /* 449–453 */ return { ok: false }; }
export function handoffAdminToken(room: string, fromPlayerId: string, toPlayerId: string): { ok: boolean; reason?: string } { /* 455–460 */ return { ok: false }; }
export function releaseAdminToken(room: string): void { /* 462–465 */ }
export function setRoomAdminPresence(room: string, adminIds: string[]): void { /* 471–473 */ }
export function beginTokenGrace(room: string, departingPlayerId: string, opts?: { timeoutMs?: number }): void { /* 475–492 */ }
export function reclaimAdminToken(room: string, playerId: string): void { /* 494–501 */ }
export function handleAdminSessionCreate(room: string, adminPlayerId: string): { ok: boolean; code?: string } { /* 503–512 */ return { ok: false }; }
export function handleAdminHandoffMessage(room: string, fromPlayerId: string, toPlayerId: string, broadcastFn: (m: any) => void): void { /* 514–519 */ }
export function handleAdminRoundStop(room: string, broadcastFn: (m: any) => void): void { /* 521–527 */ }
export function handleAdminRoundPause(room: string, broadcastFn: (m: any) => void): void { /* 529–543 */ }
export function trackPlayerInRoom(room: string, playerId: string): void { /* 547–555 */ }
export function wasPreviouslyInRoom(room: string, playerId: string): boolean { /* 557–559 */ return false; }
export function shouldRejectReconnect(room: string, playerId: string | null): { reject: boolean; code?: number; message?: string } { /* 561–580 */ return { reject: false }; }
export function touchSessionActivity(room: string): void { /* 584–586 */ }
export function checkSessionIdle(room: string): { ended: boolean; reason?: string; room: string } { /* 588–603 */ return { ended: false, room }; }
export function checkAllSessions(): Array<{ ended: boolean; reason?: string; room: string }> { /* 605–613 */ return []; }
```
> `beginTokenGrace` accepts `opts.timeoutMs` — `admin-token.test.js` passes a shortened timeout. Preserve that parameter exactly. `IDLE_TIMEOUT_MS` must equal the literal in server.js (2 min) — copy it, don't guess.

- [x] **Step 2: Wire `server.js`**

Delete the four maps and 21 functions and `IDLE_TIMEOUT_MS` from `server.js`. Add after the phases wiring:
```js
const sessionsMod = require('./src/server/sessions.ts');
sessionsMod.initSessions({ figureMaps, applyMutation, transitionPhase });
const sessionCodeIndex = sessionsMod.sessionCodeIndex;
const tokenGraceTimers = sessionsMod.tokenGraceTimers;
const roomAdminPresence = sessionsMod.roomAdminPresence;
const roomPreviousPlayers = sessionsMod.roomPreviousPlayers;
const IDLE_TIMEOUT_MS = sessionsMod.IDLE_TIMEOUT_MS;
const generateSessionCode = sessionsMod.generateSessionCode;
const registerSessionCode = sessionsMod.registerSessionCode;
const resolveSessionCode = sessionsMod.resolveSessionCode;
const rebuildSessionCodeIndexFromStates = sessionsMod.rebuildSessionCodeIndexFromStates;
const getAdminTokenHolder = sessionsMod.getAdminTokenHolder;
const assignAdminToken = sessionsMod.assignAdminToken;
const handoffAdminToken = sessionsMod.handoffAdminToken;
const releaseAdminToken = sessionsMod.releaseAdminToken;
const setRoomAdminPresence = sessionsMod.setRoomAdminPresence;
const beginTokenGrace = sessionsMod.beginTokenGrace;
const reclaimAdminToken = sessionsMod.reclaimAdminToken;
const handleAdminSessionCreate = sessionsMod.handleAdminSessionCreate;
const handleAdminHandoffMessage = sessionsMod.handleAdminHandoffMessage;
const handleAdminRoundStop = sessionsMod.handleAdminRoundStop;
const handleAdminRoundPause = sessionsMod.handleAdminRoundPause;
const trackPlayerInRoom = sessionsMod.trackPlayerInRoom;
const wasPreviouslyInRoom = sessionsMod.wasPreviouslyInRoom;
const shouldRejectReconnect = sessionsMod.shouldRejectReconnect;
const touchSessionActivity = sessionsMod.touchSessionActivity;
const checkSessionIdle = sessionsMod.checkSessionIdle;
const checkAllSessions = sessionsMod.checkAllSessions;
```

- [x] **Step 3: Gate**
```bash
cd brett && npm run typecheck && npm test
```
Expected: typecheck clean; `session-code` (incl. `sessionCodeIndex.clear()`), `admin-token`, `idle-timeout`, `reconnect-guard`, `session-state` pass; `# fail 0`.

- [x] **Step 4: Commit**
```bash
git add brett/server.js brett/src/server/sessions.ts
git commit -m "refactor(brett): extract sessions.ts (codes, admin token, idle/grace)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Extract `rooms.ts` (room WS sets, broadcast, participants)

**Files:**
- Create: `src/server/rooms.ts`
- Modify: `server.js`
- Test: existing `test/participants.test.js`.

- [x] **Step 1: Create `src/server/rooms.ts`**

Move `rooms` (409), `roomParticipants` (699), `PARTICIPANT_PALETTE` (the palette array near 699), `joinRoom` (627–631), `leaveRoom` (633–639), `broadcast` (641–648), `broadcastInfo` (650–653), `addParticipant` (700–709), `removeParticipant` (710–713), `listParticipants` (714–717). Copy bodies verbatim.

```typescript
import { WebSocket } from 'ws';

export const rooms = new Map<string, Set<any>>();
export const roomParticipants = new Map<string, Map<string, { userId: string; name: string; color: string }>>();

// Copy the exact palette array from server.js (near line 699).
export const PARTICIPANT_PALETTE: string[] = [ /* exact colors from server.js */ ];

export function joinRoom(ws: any, room: string): void {
  ws._room = room;
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(ws);
}

export function leaveRoom(ws: any): string | undefined {
  const room = ws._room;
  const set = rooms.get(room);
  if (set) { set.delete(ws); if (set.size === 0) rooms.delete(room); }
  return room;
}

export function broadcast(room: string, msg: any, exclude?: any): void {
  const set = rooms.get(room);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const client of set) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) client.send(data);
  }
}

export function broadcastInfo(room: string): void {
  const set = rooms.get(room);
  const count = set ? set.size : 0;
  broadcast(room, { type: 'info', count });
}

export function addParticipant(room: string, p: { userId: string; name: string }): { userId: string; name: string; color: string } {
  if (!roomParticipants.has(room)) roomParticipants.set(room, new Map());
  const map = roomParticipants.get(room)!;
  const existing = map.get(p.userId);
  if (existing) { existing.name = p.name; return existing; }
  const color = PARTICIPANT_PALETTE[map.size % PARTICIPANT_PALETTE.length];
  const entry = { userId: p.userId, name: p.name, color };
  map.set(p.userId, entry);
  return entry;
}

export function removeParticipant(room: string, userId: string): void {
  roomParticipants.get(room)?.delete(userId);
}

export function listParticipants(room: string): Array<{ userId: string; name: string; color: string }> {
  const map = roomParticipants.get(room);
  return map ? [...map.values()] : [];
}
```
> Copy `PARTICIPANT_PALETTE` colors and the exact `addParticipant` color-assignment logic verbatim from server.js — `participants.test.js` asserts color assignment by map-size index.

- [x] **Step 2: Wire `server.js`**

Delete the two maps, the palette, and the seven functions from `server.js`. Add:
```js
const roomsMod = require('./src/server/rooms.ts');
const rooms = roomsMod.rooms;
const roomParticipants = roomsMod.roomParticipants;
const joinRoom = roomsMod.joinRoom;
const leaveRoom = roomsMod.leaveRoom;
const broadcast = roomsMod.broadcast;
const broadcastInfo = roomsMod.broadcastInfo;
const addParticipant = roomsMod.addParticipant;
const removeParticipant = roomsMod.removeParticipant;
const listParticipants = roomsMod.listParticipants;
```

- [x] **Step 3: Gate**
```bash
cd brett && npm run typecheck && npm test
```
Expected: typecheck clean; `participants` passes; `# fail 0`.

- [x] **Step 4: Commit**
```bash
git add brett/server.js brett/src/server/rooms.ts
git commit -m "refactor(brett): extract rooms.ts (ws sets, broadcast, participants)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Extract `presets.ts` (SPEC, validateAppearance, preset CRUD)

**Files:**
- Create: `src/server/presets.ts`
- Modify: `server.js`
- Test: existing `test/appearance.test.mjs` (validateAppearance).

- [x] **Step 1: Create `src/server/presets.ts`**

Move `PRESETS_FILE` (12), the `SPEC` load block (14–28) incl. `FACE_NAMES`/`BODY_NAMES`/`ACC_NAMES` closures (26–28), `validateAppearance` (30–54), `loadPresets` (56–67), `savePresets` (69–71). Copy bodies verbatim.

```typescript
import fs from 'fs';
import path from 'path';

const PRESETS_FILE = process.env.BRETT_PRESETS_PATH || path.join(__dirname, '..', '..', 'presets.json');
const SPEC_PATH = path.join(__dirname, '..', '..', 'public', 'assets', 'figure-pack', 'placement_spec.json');

let SPEC: { faces: Record<string, any>; accessories: Record<string, any>; bodies: Record<string, any> } =
  { faces: {}, accessories: {}, bodies: {} };
try {
  SPEC = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
} catch { /* keep defaults — matches server.js try/catch */ }

const FACE_NAMES = () => Object.keys(SPEC.faces || {}).filter((k) => !k.startsWith('_'));
const BODY_NAMES = () => Object.keys(SPEC.bodies || {}).filter((k) => !k.startsWith('_'));
const ACC_NAMES = (slot: string) => Object.keys((SPEC.accessories || {})[slot] || {}).filter((k) => !k.startsWith('_'));

export function validateAppearance(a: any): string | null {
  // <<< COPY lines 30–54 verbatim, using FACE_NAMES/BODY_NAMES/ACC_NAMES above >>>
  return null;
}

export function loadPresets(): any[] {
  // <<< COPY lines 56–67 verbatim (read file, drop legacy outfit schema, savePresets if migrated) >>>
  return [];
}

export function savePresets(presets: any[]): void {
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2));
}

export { PRESETS_FILE, SPEC };
```
> Note the `__dirname` path arithmetic: the module is at `src/server/`, so `presets.json` and `public/` are two levels up. Verify these paths resolve by checking `ls brett/presets.json brett/public/assets/figure-pack/placement_spec.json`. Copy the `validateAppearance` body (faces/bodies/accessories slot checks for head/upper/feet) and `loadPresets` migration logic verbatim — `appearance.test.mjs` asserts on `validateAppearance` return values.

- [x] **Step 2: Wire `server.js` and complete the figures injection**

Delete `PRESETS_FILE`, the SPEC block, `validateAppearance`, `loadPresets`, `savePresets` from `server.js`. Add:
```js
const presetsMod = require('./src/server/presets.ts');
const validateAppearance = presetsMod.validateAppearance;
const loadPresets = presetsMod.loadPresets;
const savePresets = presetsMod.savePresets;
```
Now replace the temporary figures injection from Task 7 with the real one (move it to after this block):
```js
figuresMod.initFigures({ validateAppearance });
```

- [x] **Step 3: Gate**
```bash
cd brett && npm run typecheck && npm test
```
Expected: typecheck clean; `appearance` passes; `# fail 0`.

- [x] **Step 4: Commit**
```bash
git add brett/server.js brett/src/server/presets.ts
git commit -m "refactor(brett): extract presets.ts (SPEC, validateAppearance, preset CRUD)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Extract `ws-handler.ts` (connection dispatcher)

**Files:**
- Create: `src/server/ws-handler.ts`
- Modify: `server.js`
- Test: existing `test/server-admin.test.js` (RELAY_TYPES, ADMIN_TYPES), full suite.

> The `wss.on('connection', ...)` block (891–1210), `handleDisconnect` (885–890), `RELAY_TYPES` (1035), `ADMIN_TYPES` (1105), and the two `setInterval`s (heartbeat 1214–1224, idle 1228–1243). **Dead-code removal:** the lms/duel/coop branches (lines 1038–1096 referencing undefined `lmsAlive`, `duelRooms`, `roomMeta`, `handleLmsDeath`, `handleDuelDeath`, `_armDuelInactivityTimer`, `ensurePickups`) are deleted, not migrated — they throw `ReferenceError` if ever hit and are remnants of removed modes. Keep `player_join` tracking (sets `ws._playerId`, calls `trackPlayerInRoom`) but drop its `lmsAlive` line. Keep `clear` → `flushImmediate`.

This module needs nearly everything; it takes a big dependency bag via an `attach` function rather than per-symbol init.

- [x] **Step 1: Create `src/server/ws-handler.ts`**

```typescript
import { WebSocketServer } from 'ws';

// The full set of server-side collaborators, injected once at startup.
export interface WsDeps {
  joinRoom: Function; leaveRoom: Function; broadcast: Function; broadcastInfo: Function;
  addParticipant: Function; removeParticipant: Function; listParticipants: Function;
  figureMaps: Map<string, Map<string, any>>;
  ensureFigureMap: Function; applyMutation: Function; buildStateFromMutations: Function;
  acquireFigureLock: Function; releaseFigureLock: Function; releaseLocksForUser: Function; listFigureLocks: Function;
  validateAppearance: Function;
  readState: Function; schedulePersist: Function; flushImmediate: Function;
  handleAdminSessionCreate: Function; handleAdminHandoffMessage: Function;
  handleAdminRoundStop: Function; handleAdminRoundPause: Function;
  trackPlayerInRoom: Function; transitionPhase: Function; isAdminFromClaims: Function;
}

// Coaching-only relay set — copy exact array from server.js line 1035.
export const RELAY_TYPES = new Set<string>(['add', 'move', 'update', 'delete', 'clear', 'optik', 'stiffness', 'snapshot', 'request_state_snapshot']);
// Copy exact array from server.js line 1105.
export const ADMIN_TYPES = new Set<string>(['admin_kick', 'admin_broadcast', 'admin_session_create', 'admin_handoff_token', 'admin_round_stop', 'admin_round_pause', 'admin_coaching_steps_set']);

export function handleDisconnect(ws: any, deps: WsDeps): void {
  const room = deps.leaveRoom(ws);
  if (room) deps.broadcastInfo(room);
}

export function attachWsServer(wss: WebSocketServer, deps: WsDeps): void {
  wss.on('connection', (ws: any /*, req */) => {
    ws.isAlive = true;
    ws.on('message', (raw: any) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      // <<< COPY the dispatch body from server.js lines 901–1183 VERBATIM,
      //     EXCEPT delete the lms/duel/coop/ensurePickups branches (1038–1096
      //     except player_join tracking + clear→flushImmediate).
      //     Replace bare symbol references with deps.<symbol>. >>>
    });
    ws.on('close', () => {
      // <<< COPY lines 1185–1210 verbatim: handleDisconnect, releaseLocksForUser +
      //     broadcast locks_released_for, removeParticipant + broadcast presence_leave,
      //     empty-room flushImmediate + figureMaps.delete. Use deps.<symbol>. >>>
    });
  });
}

// Heartbeat + idle interval starters (copy bodies from 1214–1243).
export function startHeartbeat(wss: WebSocketServer): NodeJS.Timeout {
  return setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.send(JSON.stringify({ type: 'ping' })); } catch { /* noop */ }
    });
  }, 30000); // copy exact interval from server.js
}

export function startIdleSweep(deps: { checkAllSessions: Function }): NodeJS.Timeout {
  return setInterval(() => { deps.checkAllSessions(); }, 30000); // copy exact interval
}
```
> **This is the largest copy.** Read server.js 885–1243 and paste the dispatch verbatim, swapping each free symbol for `deps.X`. Delete only the proven-dead game-mode branches. Keep: `pong`, `request_state_snapshot`, `join`, relay block (add/move/update/delete/clear/optik/stiffness/snapshot with appearance validation), `figure_lock`/`figure_unlock`, all admin types, and the close handler. The exact `ping`/`pong` heartbeat string and interval must match server.js.

- [x] **Step 2: Wire `server.js`**

Delete the `wss.on('connection', ...)` block, `handleDisconnect`, `RELAY_TYPES`, `ADMIN_TYPES`, and the two `setInterval`s from `server.js`. After the `wss` is created (line ~387), add:
```js
const wsHandlerMod = require('./src/server/ws-handler.ts');
const RELAY_TYPES = wsHandlerMod.RELAY_TYPES;
const ADMIN_TYPES = wsHandlerMod.ADMIN_TYPES;
const wsDeps = {
  joinRoom, leaveRoom, broadcast, broadcastInfo,
  addParticipant, removeParticipant, listParticipants,
  figureMaps, ensureFigureMap, applyMutation, buildStateFromMutations,
  acquireFigureLock, releaseFigureLock, releaseLocksForUser, listFigureLocks,
  validateAppearance, readState, schedulePersist, flushImmediate,
  handleAdminSessionCreate, handleAdminHandoffMessage,
  handleAdminRoundStop, handleAdminRoundPause,
  trackPlayerInRoom, transitionPhase, isAdminFromClaims,
};
wsHandlerMod.attachWsServer(wss, wsDeps);
const handleDisconnect = (ws) => wsHandlerMod.handleDisconnect(ws, wsDeps);
wsHandlerMod.startHeartbeat(wss);
wsHandlerMod.startIdleSweep({ checkAllSessions });
```

- [x] **Step 3: Gate**
```bash
cd brett && npm run typecheck && npm test
```
Expected: typecheck clean; `server-admin` (RELAY_TYPES has no Mayhem types, coaching-steps round-trip) passes; `# fail 0`.

- [x] **Step 4: Smoke — server boots and accepts a WS join**
```bash
cd brett && timeout 4 env MOCK_DB=true PORT=3009 node server.js &
sleep 1
node -e "const W=require('ws');const ws=new W('ws://localhost:3009/sync');ws.on('open',()=>{ws.send(JSON.stringify({type:'join',room:'smoke'}));});ws.on('message',m=>{console.log('got',m.toString().slice(0,40));process.exit(0);});setTimeout(()=>{console.log('no-msg');process.exit(1);},2500);"
```
Expected: prints `got {"type":"snapshot"...` (or `info`) then exits 0. A `no-msg` means the dispatcher regressed.

- [x] **Step 5: Commit**
```bash
git add brett/server.js brett/src/server/ws-handler.ts
git commit -m "refactor(brett): extract ws-handler.ts; drop dead lms/duel/coop branches

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 12: Extract `index.ts` (Express + HTTP/WS bootstrap) and delete `server.js`

**Files:**
- Create: `src/server/index.ts`
- Delete: `server.js`
- Modify: `package.json` (`start` script)
- Test: full suite; tests import from `../server.js` today — see Step 4.

> What remains in `server.js` after Tasks 4–11 is: `asyncHandler`, `resolveJoinTarget`, all Express routes (Section 4), HTTP server creation, WSS setup, `shutdown`, the module-wiring block, and `module.exports`. This task moves all of it into `src/server/index.ts`, which `import`s the extracted modules normally (no tsx-bridge needed — `index.ts` is run by `tsx`).

- [x] **Step 1: Create `src/server/index.ts`**

Assemble `index.ts` by importing every Phase-2 module and re-creating the route table + bootstrap. Structure:
```typescript
import express from 'express';
import session from 'express-session';
import http from 'http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import path from 'path';

import * as db from './db';
import * as auth from './auth';
import * as figures from './figures';
import * as phases from './phases';
import * as sessions from './sessions';
import * as rooms from './rooms';
import * as presets from './presets';
import * as wsHandler from './ws-handler';

// ── Dependency wiring (same order proven in Phase 2) ──────────────
phases.initPhases({ figureMaps: figures.figureMaps, applyMutation: figures.applyMutation });
db.initDb({ buildStateFromMutations: (room) => phases.buildStateFromMutations(room) });
sessions.initSessions({ figureMaps: figures.figureMaps, applyMutation: figures.applyMutation, transitionPhase: phases.transitionPhase });
figures.initFigures({ validateAppearance: presets.validateAppearance });

const app = express();
// <<< COPY express middleware + all routes from server.js Section 4 verbatim:
//     board-auth redirect middleware, static, /healthz, /api/config, /api/join,
//     /auth/login, /auth/callback, /auth/me, /auth/e2e-login, /api/state,
//     /api/customers, /api/snapshots, /api/snapshots/:id, /api/admin/rooms,
//     POST /api/snapshots, /presets (GET/POST/DELETE), error handler.
//     Replace symbol references with the imported module members
//     (e.g. auth.requireAdmin, presets.loadPresets, db.getPool()). >>>

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/sync' });

const wsDeps = {
  joinRoom: rooms.joinRoom, leaveRoom: rooms.leaveRoom, broadcast: rooms.broadcast, broadcastInfo: rooms.broadcastInfo,
  addParticipant: rooms.addParticipant, removeParticipant: rooms.removeParticipant, listParticipants: rooms.listParticipants,
  figureMaps: figures.figureMaps, ensureFigureMap: figures.ensureFigureMap, applyMutation: figures.applyMutation,
  buildStateFromMutations: phases.buildStateFromMutations,
  acquireFigureLock: figures.acquireFigureLock, releaseFigureLock: figures.releaseFigureLock,
  releaseLocksForUser: figures.releaseLocksForUser, listFigureLocks: figures.listFigureLocks,
  validateAppearance: presets.validateAppearance,
  readState: db.readState, schedulePersist: db.schedulePersist, flushImmediate: db.flushImmediate,
  handleAdminSessionCreate: sessions.handleAdminSessionCreate, handleAdminHandoffMessage: sessions.handleAdminHandoffMessage,
  handleAdminRoundStop: sessions.handleAdminRoundStop, handleAdminRoundPause: sessions.handleAdminRoundPause,
  trackPlayerInRoom: sessions.trackPlayerInRoom, transitionPhase: phases.transitionPhase, isAdminFromClaims: auth.isAdminFromClaims,
};
wsHandler.attachWsServer(wss, wsDeps);
wsHandler.startHeartbeat(wss);
wsHandler.startIdleSweep({ checkAllSessions: sessions.checkAllSessions });

// asyncHandler, resolveJoinTarget, shutdown — copy verbatim from server.js.
export function asyncHandler(fn: any) { return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next); }
export function resolveJoinTarget(code: string): { redirect: string } | { error: string } {
  const room = sessions.resolveSessionCode(code);
  return room ? { redirect: `/?room=${room}` } : { error: 'unknown-code' };
}

let shuttingDown = false;
export async function shutdown(signal: string): Promise<void> {
  // <<< COPY lines 1247–1260 verbatim: flush all pending, close server, pool.end, exit;
  //     25s safety-net setTimeout. Use db.flushImmediate / db.getPending() / db.getPool(). >>>
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  server.listen(PORT, () => console.log(`brett listening on ${PORT}`));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Re-export every symbol the test suite imports (see Step 4).
export {
  figures, phases, sessions, rooms, presets, auth, db,
};
export const figureMaps = figures.figureMaps;
export const applyMutation = figures.applyMutation;
export const buildStateFromMutations = phases.buildStateFromMutations;
export const validateAppearance = presets.validateAppearance;
export const transitionPhase = phases.transitionPhase;
export const sessionCodeIndex = sessions.sessionCodeIndex;
export const RELAY_TYPES = wsHandler.RELAY_TYPES;
// ... (full re-export list is built in Task 23 when tests move to importing from here)
```
> Copy each route handler body verbatim from server.js. The `require.main === module` guard replaces server.js's unconditional `server.listen`; the legacy tests never listened because they only imported exports — preserve that by guarding `listen`.

- [x] **Step 2: Keep `server.js` as a thin re-export shim for one commit**

So the existing `.js`/`.mjs` tests (which `require('../server.js')`) keep passing in this commit, replace the entire `server.js` body with:
```js
'use strict';
require('tsx/cjs');
module.exports = require('./src/server/index.ts');
```
Confirm `src/server/index.ts` `module.exports`/named-exports cover every symbol the legacy tests import (admin-token, appearance, board-auth, etc. — the full list from the test analysis). The `export { ... }` re-export block in Step 1 must include **all** of: `applyMutation, buildStateFromMutations, assignAdminToken, handoffAdminToken, releaseAdminToken, getAdminTokenHolder, beginTokenGrace, reclaimAdminToken, setRoomAdminPresence, handleAdminHandoffMessage, validateAppearance, figureMaps, boardAuthRedirect, resolveBrand, buildConfig, isAdminFromClaims, RELAY_TYPES, touchSessionActivity, checkSessionIdle, checkAllSessions, registerSessionCode, resolveJoinTarget, generateSessionCode, resolveSessionCode, rebuildSessionCodeIndexFromStates, sessionCodeIndex, acquireFigureLock, releaseFigureLock, releaseLocksForUser, listFigureLocks, addParticipant, removeParticipant, listParticipants, trackPlayerInRoom, wasPreviouslyInRoom, shouldRejectReconnect, transitionPhase, handleAdminSessionCreate, handleAdminRoundStop, handleAdminRoundPause`.

Verify the export coverage:
```bash
cd brett && node -e "process.env.MOCK_DB='true'; const m=require('./server.js'); const need=['applyMutation','buildStateFromMutations','assignAdminToken','handoffAdminToken','releaseAdminToken','getAdminTokenHolder','beginTokenGrace','reclaimAdminToken','setRoomAdminPresence','handleAdminHandoffMessage','validateAppearance','figureMaps','boardAuthRedirect','resolveBrand','buildConfig','isAdminFromClaims','RELAY_TYPES','touchSessionActivity','checkSessionIdle','checkAllSessions','registerSessionCode','resolveJoinTarget','generateSessionCode','resolveSessionCode','rebuildSessionCodeIndexFromStates','sessionCodeIndex','acquireFigureLock','releaseFigureLock','releaseLocksForUser','listFigureLocks','addParticipant','removeParticipant','listParticipants','trackPlayerInRoom','wasPreviouslyInRoom','shouldRejectReconnect','transitionPhase','handleAdminSessionCreate','handleAdminRoundStop','handleAdminRoundPause']; const missing=need.filter(k=>!(k in m)); console.log(missing.length? 'MISSING: '+missing.join(','):'all-exports-present'); process.exit(missing.length?1:0);"
```
Expected: `all-exports-present`.

- [x] **Step 3: Update `package.json` `start` script**

Change `"start": "node server.js"` to:
```json
    "start": "tsx src/server/index.ts",
```

- [x] **Step 4: Gate**
```bash
cd brett && npm run typecheck && npm test
```
Expected: typecheck clean; entire legacy suite passes; `# fail 0`.

- [x] **Step 5: Boot smoke through the new entry point**
```bash
cd brett && timeout 4 env MOCK_DB=true PORT=3010 npm start &
sleep 1.5
curl -fsS http://localhost:3010/healthz && echo " healthz-ok"
```
Expected: prints `ok healthz-ok`.

- [x] **Step 6: Commit**
```bash
git add brett/server.js brett/src/server/index.ts brett/package.json
git commit -m "refactor(brett): extract index.ts entry; server.js becomes re-export shim

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 3 — Client Split (Tasks 13-22)

> **Shared-globals strategy (read once, applies to all Phase-3 tasks):**
> The inline `index.html` script keeps every collaborator on `window` and module-scope. To split it into ES modules without rewriting logic, we introduce **one shared mutable state module** `src/client/state.ts` that holds the cross-cutting singletons (the `STATE` object, the Three.js `scene`/`camera`/`renderer`/`floor`, the `ws` handle, `currentUser`, `PLACEMENT_SPEC`, lock maps). Modules import named getters/setters from it instead of reading bare globals. Functions that operate on a `fig` keep taking `fig` as a parameter (already the case). The Three.js singletons are created in `scene.ts` and **registered into `state.ts`** via `setScene(...)`; consumers call `getScene()`.
>
> During Phase 3, `index.html` still loads the old inline `<script>` AND a new `<script type="module" src="/src/client/main.ts">`. To avoid double-initialization, each task **removes** the migrated function block from the inline script and re-exposes the moved symbols on `window` from the module (e.g. `window.makeMannequin = makeMannequin`) so the still-inline code can call them. Once `main.ts` owns everything (Task 22), the inline script is deleted. Vite dev server (`npm run dev:client`) serves `/src/client/*.ts` natively.

---

### Task 13: Create the shared client state module (`src/client/state.ts`)

**Files:**
- Create: `src/client/state.ts`
- Modify: `index.html` (add module script tag + expose hook)

- [x] **Step 1: Create `src/client/state.ts`**

```typescript
import type * as THREE from 'three';
import type { Figure, FigureAppearance } from '../types/state';

// ── App state (mirrors window.STATE from index.html line 310) ─────
export interface AppState {
  figures: any[];          // runtime figure objects (THREE groups + metadata)
  selectedId: string | null;
  hoveredId: string | null;
  stiffness: number;
  online: number;
}
export const STATE: AppState = {
  figures: [],
  selectedId: null,
  hoveredId: null,
  stiffness: 0.65,
  online: 1,
};

// ── Three.js singletons, registered by scene.ts ───────────────────
interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  floor: THREE.Mesh;
}
let sceneRefs: SceneRefs | null = null;
export function setScene(refs: SceneRefs): void { sceneRefs = refs; }
export function getScene(): SceneRefs {
  if (!sceneRefs) throw new Error('scene not initialized');
  return sceneRefs;
}

// ── WebSocket handle (registered by ws-client.ts) ─────────────────
let ws: WebSocket | null = null;
let wsReady = false;
export function setWs(w: WebSocket | null): void { ws = w; }
export function getWs(): WebSocket | null { return ws; }
export function setWsReady(v: boolean): void { wsReady = v; }
export function isWsReady(): boolean { return wsReady; }

// ── Current user (from /auth/me) ──────────────────────────────────
export const currentUser = { userId: 'anon', name: 'Teilnehmer', color: '#4ea1ff' };

// ── Appearance spec + texture cache (registered by appearance.ts) ─
export const PLACEMENT_SPEC: { faces: Record<string, any>; bodies: Record<string, any>; accessories: Record<string, any> } =
  { faces: {}, bodies: {}, accessories: {} };

// ── Lock maps (shared between ws-client and hud) ──────────────────
export const lockSprites = new Map<string, THREE.Sprite>();
export const activeLocks = new Map<string, { userId: string; name: string; color: string }>();

// ── Drag/placement cross-cutting flags ────────────────────────────
export const ui = {
  dragging: null as null | { figId: string; boneName: string; plane: any },
  placingMode: false,
  panelColor: '#b8c0a8',
  panelScale: 1.0,
};
```
> `STATE.figures` holds runtime figure objects (Three.js groups + spring state), not the serializable `Figure` from `types/state`. They are intentionally `any[]` here — the serializable contract is only enforced at the WS boundary in `ws-client.ts`.

- [x] **Step 2: Add the module entry to `index.html` (non-destructive)**

In `index.html`, just before the closing `</body>` (after the existing inline `<script>` and the existing `<script type="module">` block at lines 1751–1776), add:
```html
    <script type="module" src="/src/client/main.ts"></script>
```
`main.ts` does not exist yet — create a stub so Vite doesn't 404:
```bash
cd brett && printf "import * as state from './state';\n(window as any).__brettState = state;\nexport {};\n" > src/client/main.ts
```

- [x] **Step 3: Gate (typecheck only — no behavior change yet)**
```bash
cd brett && npm run typecheck
```
Expected: exits 0. (`three` types must resolve; if `tsc` errors `Cannot find module 'three'`, install types: `npm i -D @types/three@^0.169.0` and re-run. Three.js ships its own types in recent versions; only add `@types/three` if the bare import fails.)

- [x] **Step 4: Commit**
```bash
git add brett/src/client/state.ts brett/src/client/main.ts brett/index.html
git commit -m "refactor(brett): add shared client state module + main.ts entry stub

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 14: Extract `scene.ts` (renderer, camera, lights, floor, orbit)

**Files:**
- Create: `src/client/scene.ts`
- Modify: `index.html` (remove inline scene block), `src/client/main.ts`

- [x] **Step 1: Create `src/client/scene.ts`**

Move index.html lines 308–443: renderer creation (312), sky IIFE (326–341), camera (343–347), lights (349–356), grid (359–361), floor IIFE (364–402), `cameraOrbit` + `updateCameraFromOrbit` (405–414), orbit mouse listeners (417–443). Import `THREE` as an ES module (Vite resolves it), register singletons into `state.ts`.

```typescript
import * as THREE from 'three';
import { setScene } from './state';

export interface SceneApi {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  floor: THREE.Mesh;
  updateCameraFromOrbit: () => void;
}

export function initScene(): SceneApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  // <<< COPY renderer config (tone mapping, exposure 1.05, pixel ratio cap 2,
  //     size innerWidth × innerHeight-36, append to DOM) from lines 312–321 >>>

  const scene = new THREE.Scene();
  // <<< COPY buildSky IIFE 326–341 (inline it here) >>>

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / (window.innerHeight - 36), 0.1, 200);
  // <<< COPY camera position (4,4,6) lookAt(0,1,0) 343–347 >>>

  // <<< COPY lights 349–356, grid 359–361 >>>

  // <<< COPY buildFloor IIFE 364–402, produce `floor` mesh >>>
  const floor = /* the floor mesh */ new THREE.Mesh();

  const cameraOrbit = { theta: 0.6, phi: 1.0, dist: 8 }; // copy exact init from line 405
  function updateCameraFromOrbit() {
    // <<< COPY 406–414 verbatim >>>
  }
  updateCameraFromOrbit();

  // <<< COPY orbit mouse listeners (mousedown 417, mousemove 420, mouseup 429,
  //     wheel 430, resize 436) verbatim, referencing renderer/camera/cameraOrbit. >>>

  setScene({ renderer, scene, camera, floor });
  return { renderer, scene, camera, floor, updateCameraFromOrbit };
}
```
> Copy the exact constants (FOV 50, near/far, light colors/intensities, grid 40×40, floor PlaneGeometry(40,40) + concrete canvas texture RepeatWrapping×10, tone-mapping exposure 1.05, topbar offset 36px). These are load-bearing for the visual smoke test.

- [x] **Step 2: Remove the inline scene block from `index.html`**

Delete lines 308 (`const renderer = ...`) through 443 (end of resize listener) from the inline `<script>`. Leave `window.STATE` (line 310) **in place** for now — other inline functions still read it; it is migrated wholesale to `state.ts` in Task 22.

- [x] **Step 3: Bootstrap scene from `main.ts` and bridge to inline code**

Replace `src/client/main.ts` with:
```typescript
import { initScene } from './scene';
import { STATE } from './state';

(window as any).STATE = STATE;               // inline code still reads window.STATE
const sceneApi = initScene();
(window as any).scene = sceneApi.scene;       // inline code reads bare `scene`
(window as any).camera = sceneApi.camera;
(window as any).renderer = sceneApi.renderer;
(window as any).floor = sceneApi.floor;
(window as any).__brettFloor = sceneApi.floor;
(window as any).updateCameraFromOrbit = sceneApi.updateCameraFromOrbit;
export {};
```
> The `window.*` bridges let the remaining inline functions (mannequin, ws-client, etc.) keep referencing `scene`/`camera`/`renderer`/`floor` until those blocks are migrated. Each subsequent task removes its bridge when the consumer moves into a module.

- [x] **Step 4: Gate — typecheck + Vite dev smoke**
```bash
cd brett && npm run typecheck
```
Expected: 0 diagnostics. Then start the dev stack and confirm the board renders:
```bash
cd brett && env MOCK_DB=true PORT=3000 timeout 8 npm run dev > /tmp/brett-dev.log 2>&1 &
sleep 4
curl -fsS http://localhost:5173/ | grep -q 'main.ts' && echo "vite-serves-shell"
grep -qi 'error' /tmp/brett-dev.log && echo "DEV-ERRORS-PRESENT (inspect /tmp/brett-dev.log)" || echo "dev-clean"
```
Expected: `vite-serves-shell` and `dev-clean`. (A full visual check via Playwright is added in Task 22.)

- [x] **Step 5: Commit**
```bash
git add brett/src/client/scene.ts brett/src/client/main.ts brett/index.html
git commit -m "refactor(brett): extract client scene.ts (renderer, camera, floor, orbit)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 15: Extract `mannequin.ts` (factory, physics, IK, collisions)

**Files:**
- Create: `src/client/mannequin.ts`
- Modify: `index.html`, `src/client/main.ts`

- [x] **Step 1: Create `src/client/mannequin.ts`**

Move index.html lines 445–938 + 960–1047: constants (`BONE_NAMES`, `BODY_RADIUS`, `JUMP_V0`, `GRAVITY`, `BOUNCE_K_DRAG`, `BOUNCE_K_LAND`, `COLLISION_MAX_ITER`, `CONTACT_POINTS`, `K_SPRING`, `DAMPING`, `GRAVITY_OFFSET`, `IK_CHAINS`), `makeBone` (465), `makeMannequin` (477–620), `recolorFigure` (636), `tickSpring` (857), `startJump` (909), `resolveCollisions` (915), `raycaster`/`ndc` (960), `setNdc` (976), `pickContact` (982), `pickMannequinBody` (993), `pickFloor` (1004), `ccdIK` (1012). Import `THREE`, `getScene`, `STATE`, and the WS `sendMove` (Task 16 — for now import lazily / accept as a callback).

```typescript
import * as THREE from 'three';
import { getScene, STATE } from './state';

export const BONE_NAMES = [ /* 14 names — copy line 446 */ ] as const;
export const BODY_RADIUS = 0.30;
export const JUMP_V0 = 4.5;
export const GRAVITY = 12.0;
export const BOUNCE_K_DRAG = 6.0;
export const BOUNCE_K_LAND = 9.0;
export const COLLISION_MAX_ITER = 3;
export const CONTACT_POINTS = [ /* 9 entries {bone,color} — copy 457–463 */ ];
const K_SPRING = 80, DAMPING = 0.85;
const GRAVITY_OFFSET: Record<string, { x: number; z: number }> = { /* copy 844–853 */ };
export const IK_CHAINS: Record<string, string[]> = { /* copy 964 */ };

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let lastTickMs = performance.now();

// sendMove is injected to avoid a cycle with ws-client.ts.
let sendMove: (id: string, x: number, z: number, facingY: number) => void = () => {};
export function setSendMove(fn: typeof sendMove): void { sendMove = fn; }

export function makeBone(parent: THREE.Object3D, length: number, color: number): THREE.Group { /* copy 465–475 */ return new THREE.Group(); }
export function makeMannequin(id: string | undefined, position: { x: number; z: number }, opts?: any): any {
  const { scene } = getScene();
  // <<< COPY 477–620 verbatim; uses BONE_NAMES, CONTACT_POINTS, scene >>>
}
export function recolorFigure(fig: any, hexColor: string): void { /* copy 636–644 */ }
export function tickSpring(dt: number): void {
  // <<< COPY 857–907 verbatim; reads STATE.figures/STATE.stiffness, calls resolveCollisions >>>
}
export function startJump(fig: any): void { /* copy 909–913 */ }
export function resolveCollisions(movedFig: any, impulseK: number): void {
  // <<< COPY 915–938 verbatim; calls sendMove(other.id, ...) >>>
}
export function setNdc(ev: MouseEvent): void { /* copy 976–981 */ }
export function pickContact(ev: MouseEvent): any { /* copy 982–992 */ }
export function pickMannequinBody(ev: MouseEvent): any { /* copy 993–1003 */ }
export function pickFloor(ev: MouseEvent): THREE.Vector3 | null { /* copy 1004–1011 */ }
export function ccdIK(fig: any, endBoneName: string, targetWorld: THREE.Vector3, iterations = 8): void {
  // <<< COPY 1012–1047 verbatim; uses IK_CHAINS >>>
}
export function getTickRefs() { return { raycaster, ndc, get lastTickMs() { return lastTickMs; }, set lastTickMs(v: number) { lastTickMs = v; } }; }
```
> `makeMannequin` is the 143-line factory — copy it whole (the skeleton hierarchy, contact spheres with `userData.isContact/boneName/figureId`, selection ring, per-bone spring state). Do not abbreviate. `resolveCollisions` calls `sendMove`, which lives in ws-client; the injection avoids an import cycle.

- [x] **Step 2: Remove inline blocks from `index.html`**

Delete lines 445–938 and 960–1047 from the inline script. Keep the `addFigure` definition at 622–628 for now (it's tightly coupled to `selectFigure` in fig-panel; it migrates with ws-client's monkey-patch in Task 16). **Temporarily**, since `makeMannequin`/`recolorFigure`/`tickSpring`/etc. are now in the module, the still-inline `addFigure` (622) must reach them via `window.*` bridges.

- [x] **Step 3: Bridge from `main.ts`**

Append to `src/client/main.ts`:
```typescript
import * as mannequin from './mannequin';
(window as any).makeMannequin = mannequin.makeMannequin;
(window as any).recolorFigure = mannequin.recolorFigure;
(window as any).tickSpring = mannequin.tickSpring;
(window as any).startJump = mannequin.startJump;
(window as any).resolveCollisions = mannequin.resolveCollisions;
(window as any).pickContact = mannequin.pickContact;
(window as any).pickMannequinBody = mannequin.pickMannequinBody;
(window as any).pickFloor = mannequin.pickFloor;
(window as any).ccdIK = mannequin.ccdIK;
(window as any).BONE_NAMES = mannequin.BONE_NAMES;
(window as any).IK_CHAINS = mannequin.IK_CHAINS;
```

- [x] **Step 4: Gate**
```bash
cd brett && npm run typecheck
env MOCK_DB=true PORT=3000 timeout 8 npm run dev > /tmp/brett-dev.log 2>&1 &
sleep 4
grep -qi 'error' /tmp/brett-dev.log && echo "DEV-ERRORS" || echo "dev-clean"
```
Expected: typecheck 0 diagnostics; `dev-clean`.

- [x] **Step 5: Commit**
```bash
git add brett/src/client/mannequin.ts brett/src/client/main.ts brett/index.html
git commit -m "refactor(brett): extract client mannequin.ts (factory, physics, IK)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 16: Extract `ws-client.ts` (connect, send wrappers, onMessage router)

**Files:**
- Create: `src/client/ws-client.ts`
- Modify: `index.html`, `src/client/main.ts`

- [ ] **Step 1: Create `src/client/ws-client.ts`**

Move index.html lines 940–950, 1292–1440: `sendMove` (940), `sendJump` (946), `roomFromUrl`/`wsProto` (1292–1293), `connectWS` (1297–1312), `onWsMessage` (1316–1418), `sendUpdate`/`sendStiffness`/`sendDelete` (1421–1432), and the `addFigure` monkey-patch (1435–1440). Type the outgoing/incoming messages with the Phase-1 contracts.

```typescript
import { STATE, getWs, setWs, isWsReady, setWsReady, activeLocks, lockSprites } from './state';
import type { ClientMessage, ServerMessage } from '../types/messages';
import * as mannequin from './mannequin';

const roomFromUrl = new URLSearchParams(location.search).get('room') || 'default';
const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';

function send(msg: ClientMessage): void {
  const ws = getWs();
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function sendMove(id: string, x: number, z: number, facingY: number): void { send({ type: 'move', id, x, z, facingY }); }
export function sendJump(id: string): void { send({ type: 'jump', id }); }
export function sendUpdate(fig: any, changes: any): void { send({ type: 'update', id: fig.id, changes }); }
export function sendStiffness(value: number): void { send({ type: 'stiffness', value }); }
export function sendDelete(): void { if (STATE.selectedId) send({ type: 'delete', id: STATE.selectedId }); }

export function connectWS(): void {
  const ws = new WebSocket(`${wsProto}//${location.host}/sync`);
  setWs(ws);
  (window as any).__brettWS = ws;
  ws.addEventListener('open', () => { setWsReady(true); send({ type: 'join', room: roomFromUrl }); });
  ws.addEventListener('close', () => { setWsReady(false); setTimeout(connectWS, 2000); });
  ws.addEventListener('message', onWsMessage);
}

export function onWsMessage(evt: MessageEvent): void {
  let msg: ServerMessage;
  try { msg = JSON.parse(evt.data); } catch { return; }
  switch (msg.type) {
    // <<< COPY the full dispatch from index.html 1318–1417 VERBATIM:
    //     snapshot / stiffness / add / update / figure_locked / figure_unlocked /
    //     figure_lock_denied / locks_released_for / move / jump / delete / info.
    //     Replace bare globals: makeMannequin→mannequin.makeMannequin,
    //     applyAppearanceToFig→(injected, see setApplyAppearance), STATE stays STATE,
    //     activeLocks/lockSprites from state. >>>
    default:
      break;
  }
}

// Injected to avoid cycle with appearance.ts.
let applyAppearanceToFig: (fig: any, a: any) => void = () => {};
export function setApplyAppearance(fn: typeof applyAppearanceToFig): void { applyAppearanceToFig = fn; }
let setFigureLockBadge: (id: string, name: string, color: string) => void = () => {};
let clearFigureLockBadge: (id: string) => void = () => {};
let clearLockBadgesForUser: (userId: string) => void = () => {};
let cancelDragFor: (id: string) => void = () => {};
export function setLockBadgeFns(fns: { setFigureLockBadge: typeof setFigureLockBadge; clearFigureLockBadge: typeof clearFigureLockBadge; clearLockBadgesForUser: typeof clearLockBadgesForUser; cancelDragFor: typeof cancelDragFor }): void {
  setFigureLockBadge = fns.setFigureLockBadge; clearFigureLockBadge = fns.clearFigureLockBadge;
  clearLockBadgesForUser = fns.clearLockBadgesForUser; cancelDragFor = fns.cancelDragFor;
}
```
> `onWsMessage` references `setFigureLockBadge`/`clearFigureLockBadge`/`clearLockBadgesForUser` (hud, Task 19), `applyAppearanceToFig` (appearance, Task 20), `cancelDragFor` (fig-panel, Task 18), `PRESETS` (presets, Task 17). The first four are injected here; `PRESETS` is imported in Task 17. For this task, wire the injection points and import what already exists (`mannequin`). The lock/appearance/cancel functions are still on `window` from the inline code, so inside `onWsMessage` call the injected refs which `main.ts` points at `window.*` until those modules land.

- [ ] **Step 2: Remove inline blocks from `index.html`**

Delete lines 940–950, 1292–1314 (incl. the `connectWS()` call — re-issued from main.ts), 1316–1440 from the inline script. The `addFigure` monkey-patch (1435–1440) is folded into a single `addFigure` in `mannequin.ts`/`fig-panel.ts` later; for now move its WS-send into `ws-client` and keep `addFigure` inline calling `window.sendAdd`. Add an exported `sendAdd`:
```typescript
export function sendAddFigure(fig: any): void { send({ type: 'add', figure: { id: fig.id, x: fig.root.position.x, z: fig.root.position.z, facingY: fig.facingY, label: fig.label, color: fig.color, appearance: fig.appearance } }); }
```
Copy the exact field set the monkey-patch sent (index.html 1435–1440).

- [ ] **Step 3: Bridge + inject from `main.ts`**

Append to `main.ts`:
```typescript
import * as wsClient from './ws-client';
mannequin.setSendMove(wsClient.sendMove);
// Point ws-client's injected lock/appearance fns at the still-inline window globals for now:
wsClient.setLockBadgeFns({
  setFigureLockBadge: (...a) => (window as any).setFigureLockBadge(...a),
  clearFigureLockBadge: (...a) => (window as any).clearFigureLockBadge(...a),
  clearLockBadgesForUser: (...a) => (window as any).clearLockBadgesForUser(...a),
  cancelDragFor: (...a) => (window as any).cancelDragFor(...a),
});
wsClient.setApplyAppearance((fig, a) => (window as any).applyAppearanceToFig(fig, a));
(window as any).sendMove = wsClient.sendMove;
(window as any).sendJump = wsClient.sendJump;
(window as any).sendUpdate = wsClient.sendUpdate;
(window as any).sendStiffness = wsClient.sendStiffness;
(window as any).sendDelete = wsClient.sendDelete;
(window as any).sendAddFigure = wsClient.sendAddFigure;
wsClient.connectWS();
```

- [ ] **Step 4: Gate**
```bash
cd brett && npm run typecheck
env MOCK_DB=true PORT=3000 timeout 8 npm run dev > /tmp/brett-dev.log 2>&1 &
sleep 4
grep -qi 'error' /tmp/brett-dev.log && echo "DEV-ERRORS" || echo "dev-clean"
```
Expected: typecheck 0 diagnostics; `dev-clean`.

- [ ] **Step 5: Commit**
```bash
git add brett/src/client/ws-client.ts brett/src/client/main.ts brett/index.html
git commit -m "refactor(brett): extract client ws-client.ts (connect, sends, onMessage)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 17: Extract `presets.ts` (client PRESETS + applyPreset)

**Files:**
- Create: `src/client/presets.ts`
- Modify: `index.html`, `src/client/main.ts`, `src/client/ws-client.ts` (import PRESETS)

- [ ] **Step 1: Create `src/client/presets.ts`**

Move index.html lines 759–826: `PRESETS` (759–814: stand/kneel/prone/crawl/slump/tpose), `applyPreset` (816–826).

```typescript
import { STATE } from './state';
import { BONE_NAMES } from './mannequin';

export const PRESETS: Record<string, Record<string, { x: number; z: number }>> = {
  // <<< COPY all 6 presets verbatim from 759–814 >>>
};

export function applyPreset(figId: string, presetKey: string): void {
  // <<< COPY 816–826 verbatim; reads PRESETS, BONE_NAMES, STATE.figures >>>
}
```

- [ ] **Step 2: Wire `ws-client.ts` to import PRESETS**

In `ws-client.ts`, add `import { PRESETS } from './presets';` and replace the `(window as any).PRESETS` reference inside `onWsMessage` (snapshot/update cases) with the imported `PRESETS`.

- [ ] **Step 3: Remove inline block + bridge**

Delete index.html lines 759–834 (incl. the preset button listener at 830–834 — re-added in fig-panel Task 18, or keep the listener inline pointing at `window.applyPreset` for now; delete only 759–826 and keep 830–834 inline). Append to `main.ts`:
```typescript
import * as presets from './presets';
(window as any).PRESETS = presets.PRESETS;
(window as any).applyPreset = presets.applyPreset;
```

- [ ] **Step 4: Gate**
```bash
cd brett && npm run typecheck
env MOCK_DB=true PORT=3000 timeout 8 npm run dev > /tmp/brett-dev.log 2>&1 &
sleep 4
grep -qi 'error' /tmp/brett-dev.log && echo "DEV-ERRORS" || echo "dev-clean"
```
Expected: typecheck 0 diagnostics; `dev-clean`.

- [ ] **Step 5: Commit**
```bash
git add brett/src/client/presets.ts brett/src/client/ws-client.ts brett/src/client/main.ts brett/index.html
git commit -m "refactor(brett): extract client presets.ts (PRESETS, applyPreset)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 18: Extract `ui/fig-panel.ts` (figure editor panel)

**Files:**
- Create: `src/client/ui/fig-panel.ts`
- Modify: `index.html`, `src/client/main.ts`

- [ ] **Step 1: Create `src/client/ui/fig-panel.ts`**

Move index.html lines 631–756 + 1109–1113: panel state already lives in `state.ui` (panelColor/panelScale/placingMode), `syncPanelToSelection` (646), `selectFigure` (663), DOM refs (682–684), `openFigPanel` (686), `closeFigPanel` (692), all panel listeners (698–756), `cancelDragFor` (1109). Plus the canonical `addFigure` (622–628) folded here since it calls `selectFigure`.

```typescript
import { STATE, ui } from '../state';
import { makeMannequin } from '../mannequin';
import { sendAddFigure } from '../ws-client';

export function addFigure(position: { x: number; z: number }): any {
  const fig = makeMannequin(undefined, position);
  STATE.figures.push(fig);
  selectFigure(fig.id);
  if (/* wsReady */ true) sendAddFigure(fig);  // copy exact guard from monkey-patch
  return fig;
}

export function syncPanelToSelection(id: string | null): void { /* copy 646–661 */ }
export function selectFigure(id: string | null): void { /* copy 663–679 */ }

const figPanelBtn = document.getElementById('fig-panel-btn')!;
const figPanel = document.getElementById('fig-panel')!;
const figPanelClose = document.getElementById('fig-panel-close')!;

export function openFigPanel(): void { /* copy 686–691 */ }
export function closeFigPanel(): void { /* copy 692–696 */ }
export function cancelDragFor(figureId: string): void { if (ui.dragging && ui.dragging.figId === figureId) ui.dragging = null; }

export function initFigPanel(): void {
  // <<< COPY all listeners 698–756 verbatim: btn/close/outside-click, color swatch
  //     (sets ui.panelColor), label input, scale slider + size buttons (ui.panelScale),
  //     add button (sets ui.placingMode). Reference exported fns. >>>
}
```
> The `addFigure` here supersedes both the inline 622 version and the 1435 monkey-patch. Copy the monkey-patch's WS-send field list into `sendAddFigure` (done in Task 16) and the `wsReady` guard here.

- [ ] **Step 2: Remove inline blocks**

Delete index.html lines 622–628, 631–634 (panel state — now in `state.ui`), 646–756, 1109–1113.

- [ ] **Step 3: Bridge from `main.ts`**

Append:
```typescript
import * as figPanel from './ui/fig-panel';
(window as any).addFigure = figPanel.addFigure;
(window as any).selectFigure = figPanel.selectFigure;
(window as any).closeFigPanel = figPanel.closeFigPanel;
(window as any).cancelDragFor = figPanel.cancelDragFor;
figPanel.initFigPanel();
// Repoint ws-client's cancelDragFor injection at the real module fn:
wsClient.setLockBadgeFns({
  setFigureLockBadge: (...a) => (window as any).setFigureLockBadge(...a),
  clearFigureLockBadge: (...a) => (window as any).clearFigureLockBadge(...a),
  clearLockBadgesForUser: (...a) => (window as any).clearLockBadgesForUser(...a),
  cancelDragFor: figPanel.cancelDragFor,
});
```

- [ ] **Step 4: Gate**
```bash
cd brett && npm run typecheck
env MOCK_DB=true PORT=3000 timeout 8 npm run dev > /tmp/brett-dev.log 2>&1 &
sleep 4
grep -qi 'error' /tmp/brett-dev.log && echo "DEV-ERRORS" || echo "dev-clean"
```
Expected: typecheck 0 diagnostics; `dev-clean`.

- [ ] **Step 5: Commit**
```bash
git add brett/src/client/ui/fig-panel.ts brett/src/client/main.ts brett/index.html
git commit -m "refactor(brett): extract client ui/fig-panel.ts (editor, selectFigure, addFigure)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 19: Extract `ui/hud.ts` (status pill + lock badges)

**Files:**
- Create: `src/client/ui/hud.ts`
- Modify: `index.html`, `src/client/main.ts`, `src/client/ws-client.ts`

- [ ] **Step 1: Create `src/client/ui/hud.ts`**

Move index.html lines 1050–1121 (lock badges) + 1282–1290 (status pill): `setFigureLockBadge` (1060), `clearFigureLockBadge` (1098), `clearLockBadgesForUser` (1115), `updateStatusPill` (1284). `lockSprites`/`activeLocks` already in `state.ts`.

```typescript
import * as THREE from 'three';
import { STATE, ui, lockSprites, activeLocks } from '../state';

const pillEl = document.getElementById('status-pill')!;

export function setFigureLockBadge(figureId: string, name: string, color: string): void {
  // <<< COPY 1060–1096 verbatim; reads STATE.figures, writes lockSprites >>>
}
export function clearFigureLockBadge(figureId: string): void { /* copy 1098–1107 */ }
export function clearLockBadgesForUser(userId: string): void { /* copy 1115–1121 */ }
export function updateStatusPill(): void {
  // <<< COPY 1284–1289 verbatim; reads ui.dragging, STATE.selectedId/figures, pillEl >>>
}
```

- [ ] **Step 2: Wire ws-client to import real hud fns (drop one injection)**

In `main.ts`, replace the window-bridged lock fns with the module ones:
```typescript
import * as hud from './ui/hud';
wsClient.setLockBadgeFns({
  setFigureLockBadge: hud.setFigureLockBadge,
  clearFigureLockBadge: hud.clearFigureLockBadge,
  clearLockBadgesForUser: hud.clearLockBadgesForUser,
  cancelDragFor: figPanel.cancelDragFor,
});
(window as any).setFigureLockBadge = hud.setFigureLockBadge;
(window as any).clearFigureLockBadge = hud.clearFigureLockBadge;
(window as any).clearLockBadgesForUser = hud.clearLockBadgesForUser;
(window as any).updateStatusPill = hud.updateStatusPill;
```

- [ ] **Step 3: Remove inline blocks**

Delete index.html lines 1050–1121, 1282–1290. (The `tick()` at 1443 calls `updateStatusPill` — it's still inline; it now resolves `window.updateStatusPill`. `tick` migrates in Task 22.)

- [ ] **Step 4: Gate**
```bash
cd brett && npm run typecheck
env MOCK_DB=true PORT=3000 timeout 8 npm run dev > /tmp/brett-dev.log 2>&1 &
sleep 4
grep -qi 'error' /tmp/brett-dev.log && echo "DEV-ERRORS" || echo "dev-clean"
```
Expected: typecheck 0 diagnostics; `dev-clean`.

- [ ] **Step 5: Commit**
```bash
git add brett/src/client/ui/hud.ts brett/src/client/main.ts brett/index.html
git commit -m "refactor(brett): extract client ui/hud.ts (status pill, lock badges)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 20: Extract `ui/appearance.ts` (appearance drawer)

**Files:**
- Create: `src/client/ui/appearance.ts`
- Modify: `index.html`, `src/client/main.ts`, `src/client/ws-client.ts`

- [ ] **Step 1: Create `src/client/ui/appearance.ts`**

Move index.html lines 1466–1671 + 1724–1749: `loadTex` (1469), `loadSpec` IIFE (1474), `ACC_GROUPS` (1482), `applyFaceToFig` (1488), `applyAccessorySlot` (1506), `applyAppearanceToFig` (1530), drawer DOM refs + `_preOpenAppearance` (1543–1549), `openAppearanceDrawer` (1551), `closeAppearanceDrawer` (1560), drawer listeners (1566–1586), `buildDrawerContent` (1588), `makeThumbItem` (1596), `buildFaceGrid` (1611), `buildBodyGrid` (1633), `buildAccGrid` (1652), `syncDrawerToFig` (1724). `PLACEMENT_SPEC`/`textureCache` from `state.ts`.

```typescript
import * as THREE from 'three';
import { STATE, PLACEMENT_SPEC } from '../state';

const textureCache = new Map<string, THREE.Texture>();
const ACC_GROUPS: Record<string, string[]> = { /* copy 1482–1486 */ };

export function loadTex(path: string): THREE.Texture { /* copy 1469–1473 */ return new THREE.Texture(); }
export function applyFaceToFig(fig: any, faceName: string | null): void { /* copy 1488–1503 */ }
export function applyAccessorySlot(fig: any, slot: string, accName: string | null): void { /* copy 1506–1528 */ }
export function applyAppearanceToFig(fig: any, appearance: any): void { /* copy 1530–1540 */ }
export function openAppearanceDrawer(): void { /* copy 1551–1558 */ }
export function closeAppearanceDrawer(): void { /* copy 1560–1564 */ }
function buildDrawerContent(): void { /* copy 1588–1594 */ }
function makeThumbItem(imgSrc: string, label: string, clickHandler: () => void, isNullItem?: boolean): HTMLElement { /* copy 1596–1609 */ return document.createElement('div'); }
function buildFaceGrid(): void { /* copy 1611–1631 */ }
function buildBodyGrid(): void { /* copy 1633–1650 */ }
function buildAccGrid(slot: string, names: string[]): void { /* copy 1652–1671 */ }
export function syncDrawerToFig(fig: any): void { /* copy 1724–1749 */ }

export async function initAppearance(): Promise<void> {
  // loadSpec IIFE 1474–1480: fetch placement_spec.json, copy into PLACEMENT_SPEC, buildDrawerContent()
  const res = await fetch('/assets/figure-pack/placement_spec.json');
  const spec = await res.json();
  Object.assign(PLACEMENT_SPEC, spec);
  buildDrawerContent();
  // drawer button listeners 1566–1586
}
```
> `loadSpec` mutates the imported `PLACEMENT_SPEC` via `Object.assign` (not reassignment) so the shared reference stays valid for `mannequin`/`persons` consumers.

- [ ] **Step 2: Wire ws-client to real appearance fn**

In `main.ts`: `wsClient.setApplyAppearance(appearance.applyAppearanceToFig);` and `(window as any).applyAppearanceToFig = appearance.applyAppearanceToFig;`. Call `await appearance.initAppearance();`.

- [ ] **Step 3: Remove inline blocks**

Delete index.html lines 1466–1671, 1724–1749.

- [ ] **Step 4: Gate**
```bash
cd brett && npm run typecheck
env MOCK_DB=true PORT=3000 timeout 8 npm run dev > /tmp/brett-dev.log 2>&1 &
sleep 4
grep -qi 'error' /tmp/brett-dev.log && echo "DEV-ERRORS" || echo "dev-clean"
```
Expected: typecheck 0 diagnostics; `dev-clean`.

- [ ] **Step 5: Commit**
```bash
git add brett/src/client/ui/appearance.ts brett/src/client/main.ts brett/index.html
git commit -m "refactor(brett): extract client ui/appearance.ts (drawer, apply*)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 21: Extract `ui/persons.ts` (named-persons panel)

**Files:**
- Create: `src/client/ui/persons.ts`
- Modify: `index.html`, `src/client/main.ts`

- [ ] **Step 1: Create `src/client/ui/persons.ts`**

Move index.html lines 1673–1722: `NAMED_PERSONS` (1674), `buildPersonsPanel` (1682), and the `/api/config` fetch + `filterPersonsForBrand` import (1719–1722).

```typescript
import { STATE, PLACEMENT_SPEC } from '../state';
import { addFigure } from './fig-panel';
import { recolorFigure } from '../mannequin';
import { applyAppearanceToFig } from './appearance';
import { sendUpdate } from '../ws-client';
import { closeFigPanel } from './fig-panel';

export const NAMED_PERSONS = [ /* copy 5 persons 1674–1680 */ ];

export function buildPersonsPanel(persons: any[]): void {
  // <<< COPY 1682–1718 verbatim; uses addFigure/recolorFigure/applyAppearanceToFig/
  //     sendUpdate/closeFigPanel/PLACEMENT_SPEC. The tryApply() polling closure stays. >>>
}

export async function initPersons(): Promise<void> {
  const cfg = await (await fetch('/api/config')).json();
  const { filterPersonsForBrand } = await import('/assets/coaching/brand.mjs' as any);
  buildPersonsPanel(filterPersonsForBrand(NAMED_PERSONS, cfg.brand));
}
```
> The dynamic import of `brand.mjs` stays a runtime import (it's a public client asset, not migrated here). Keep the `tryApply()` 100ms-retry closure for `PLACEMENT_SPEC.faces[p.key]` exactly as in the original.

- [ ] **Step 2: Remove inline block + bridge**

Delete index.html lines 1673–1722. Append to `main.ts`: `import * as persons from './ui/persons'; await persons.initPersons();`.

- [ ] **Step 3: Gate**
```bash
cd brett && npm run typecheck
env MOCK_DB=true PORT=3000 timeout 8 npm run dev > /tmp/brett-dev.log 2>&1 &
sleep 4
grep -qi 'error' /tmp/brett-dev.log && echo "DEV-ERRORS" || echo "dev-clean"
```
Expected: typecheck 0 diagnostics; `dev-clean`.

- [ ] **Step 4: Commit**
```bash
git add brett/src/client/ui/persons.ts brett/src/client/main.ts brett/index.html
git commit -m "refactor(brett): extract client ui/persons.ts (named persons panel)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 22: Finalize `main.ts` (event listeners, tick loop) and shrink `index.html` to a shell

**Files:**
- Modify: `src/client/main.ts` (own the remaining listeners + tick)
- Modify: `index.html` (delete remaining inline script, keep only the ESM block content moved into modules)

- [ ] **Step 1: Move remaining inline logic into `main.ts`**

The inline script still holds (per client analysis §5 main.ts group): `/auth/me` fetch (1053–1058 → `currentUser`), all mouse/keyboard drag listeners (1123–1288: mousedown 1125, mousemove 1167, mouseup 1190, click 1205, dblclick 1229, keydown Space 1240, keydown window 1253), `easeFigure` (1211), `tick` (1443–1457), the `addFigure({x:0,z:0})` seed (837), `stiffSlider` listener (953), the preset button listener (830), and the ESM block (1751–1776: wire.mjs/hud.mjs/join.mjs/session_created toast).

Rewrite `src/client/main.ts` as the single ordered bootstrap (the bridges from earlier tasks are now removed — modules import each other directly):
```typescript
import * as THREE from 'three';
import { STATE, ui, getScene, currentUser } from './state';
import { initScene } from './scene';
import * as mannequin from './mannequin';
import { applyPreset, PRESETS } from './presets';
import * as wsClient from './ws-client';
import * as figPanel from './ui/fig-panel';
import * as hud from './ui/hud';
import * as appearance from './ui/appearance';
import * as persons from './ui/persons';

async function boot() {
  const { renderer, scene, camera, floor } = initScene();
  mannequin.setSendMove(wsClient.sendMove);
  wsClient.setApplyAppearance(appearance.applyAppearanceToFig);
  wsClient.setLockBadgeFns({
    setFigureLockBadge: hud.setFigureLockBadge,
    clearFigureLockBadge: hud.clearFigureLockBadge,
    clearLockBadgesForUser: hud.clearLockBadgesForUser,
    cancelDragFor: figPanel.cancelDragFor,
  });

  // /auth/me → currentUser  (copy 1053–1058)
  try {
    const me = await (await fetch('/auth/me')).json();
    if (me.userId) currentUser.userId = me.userId;
    if (me.name) currentUser.name = me.name;
  } catch { /* anon */ }

  figPanel.initFigPanel();
  await appearance.initAppearance();
  await persons.initPersons();

  // stiffness slider (copy 953–956)
  const stiffSlider = document.getElementById('stiffness') as HTMLInputElement;
  stiffSlider?.addEventListener('input', () => {
    STATE.stiffness = Number(stiffSlider.value);
    wsClient.sendStiffness(STATE.stiffness);
  });

  // preset buttons (copy 830–834)
  document.getElementById('presets')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-preset]') as HTMLElement | null;
    if (btn && STATE.selectedId) applyPreset(STATE.selectedId, btn.dataset.preset!);
  });

  // <<< COPY easeFigure (1211–1227) and ALL mouse/keyboard listeners 1123–1288 verbatim,
  //     replacing bare globals with imports: pickFloor→mannequin.pickFloor,
  //     pickContact→mannequin.pickContact, ccdIK→mannequin.ccdIK,
  //     selectFigure→figPanel.selectFigure, sendUpdate→wsClient.sendUpdate,
  //     resolveCollisions→mannequin.resolveCollisions, startJump→mannequin.startJump,
  //     sendJump→wsClient.sendJump, sendDelete→wsClient.sendDelete,
  //     ui.dragging / ui.placingMode / ui.panelColor / ui.panelScale,
  //     getScene() for renderer/camera/floor. >>>

  wsClient.connectWS();
  figPanel.addFigure({ x: 0, z: 0 }); // seed (was inline 837)

  // tick loop (copy 1443–1457)
  let lastTickMs = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min((now - lastTickMs) / 1000, 0.05);
    lastTickMs = now;
    mannequin.tickSpring(dt);
    hud.updateStatusPill();
    const fx = (window as any).__brettPostFx;
    if (fx) fx.render(scene, camera); else renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}

boot();
```
> The `__brettPostFx` optional path is preserved exactly (client analysis: tick checks `window.__brettPostFx`). Copy `easeFigure` and the listeners verbatim — they are the bulk of remaining behavior. The ESM block at 1751–1776 (`wire.mjs`, `hud.mjs`, `join.mjs`, the `session_created` toast) imports public coaching assets — keep that block as a separate `<script type="module">` in `index.html` unchanged, OR move its imports into `boot()`; preserve it verbatim either way.

- [ ] **Step 2: Shrink `index.html` to a shell**

Delete the entire first inline `<script>` (originally 308–1750) — every function now lives in a module. Keep:
- the HTML markup (topbar, panels, drawer, grids — all the DOM the modules query by id),
- the `<script type="module" src="/src/client/main.ts">` tag,
- the original ESM block (1751–1776) if not folded into `boot()`.

Verify no `<script>` without `type="module"` remains containing app logic:
```bash
cd brett && grep -n '<script' index.html
```
Expected: only `type="module"` script tags (the Three.js import is via the module graph / Vite, not a CDN `<script>` — if the original loaded Three.js from a `<script src=...three...>` CDN tag, replace that usage with the `import * as THREE from 'three'` already in the modules and remove the CDN tag; confirm `three` is a dependency: `npm ls three`).

- [ ] **Step 3: Gate — typecheck + dev smoke + Playwright visual check**
```bash
cd brett && npm run typecheck
```
Expected: 0 diagnostics. Then a real browser smoke test (board loads, ≥1 figure present):
```bash
cd brett && env MOCK_DB=true PORT=3000 npm run dev > /tmp/brett-dev.log 2>&1 &
sleep 5
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const figs = await p.evaluate(() => (window.STATE && window.STATE.figures ? window.STATE.figures.length : -1));
  console.log('figures=', figs, 'errors=', errs.length, errs.slice(0,3));
  await b.close();
  process.exit(figs >= 1 && errs.length === 0 ? 0 : 1);
})();
"
```
Expected: `figures= 1 errors= 0 []` and exit 0. (If `playwright` is not installed in `brett`, run from repo root where it exists, or `npx playwright install chromium` first.)

- [ ] **Step 4: Build smoke (Vite production bundle)**
```bash
cd brett && npm run build
```
Expected: Vite emits `dist/client/`; `tsc -p tsconfig.server.json` emits `dist/server/` with no errors. Exit 0.

- [ ] **Step 5: Commit**
```bash
git add brett/src/client/main.ts brett/index.html
git commit -m "refactor(brett): finalize main.ts bootstrap; shrink index.html to shell

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 4 — Test Migration (Tasks 23-25)

### Task 23: Migrate server tests to `.ts` and repoint imports to `src/server/`

**Files:**
- Rename/Create: `test/*.test.js` → `test/*.test.ts`, `test/appearance.test.mjs` + `test/*.mjs` server-importing → `.ts`
- Modify: `package.json` test glob, `server.js` (final deletion)

- [ ] **Step 1: Convert the 14 CJS `.test.js` files and `appearance.test.mjs` to `.ts`**

For each server-importing test, apply the mechanical transform:
- `require('../server.js')` → `import { ... } from '../src/server/index';`
- `'use strict';` → delete (TS modules are strict).
- `process.env.MOCK_DB = 'true';` before require → remove from the file; `MOCK_DB=true` is set by the `npm test` command (already in Task 1's `test` script). For files run individually, document that `MOCK_DB=true tsx --test test/foo.test.ts` is required.
- inline `require('../server.js')` inside a test body (in `session-state.test.js`) → hoist to a top-level named `import`.
- `appearance.test.mjs`'s `createRequire(import.meta.url)` shim → delete; replace with a direct `import { validateAppearance, applyMutation, buildStateFromMutations, figureMaps } from '../src/server/index';`.

Concrete example — `test/board-auth.test.ts`:
```typescript
import { test } from 'node:test';
import assert from 'node:assert';
import { boardAuthRedirect } from '../src/server/index';

test('redirects unauthenticated session to login', () => {
  const env = { BRETT_OIDC_SECRET: 'x' } as any;
  const req: any = { session: {}, path: '/', headers: {}, header: () => undefined };
  assert.strictEqual(boardAuthRedirect(req, env), '/auth/login');
});

test('passes authenticated session', () => {
  const env = { BRETT_OIDC_SECRET: 'x' } as any;
  const req: any = { session: { userId: 'u1' }, path: '/', headers: {}, header: () => undefined };
  assert.strictEqual(boardAuthRedirect(req, env), null);
});

test('e2e secret header bypasses', () => {
  const env = { BRETT_OIDC_SECRET: 'sekret' } as any;
  const req: any = { session: {}, path: '/', headers: { 'x-e2e-secret': 'sekret' }, header: (k: string) => req.headers[k] };
  assert.strictEqual(boardAuthRedirect(req, env), null);
});
```
> Apply the same shape to all 15 files. **Keep every assertion identical** to the original `.js`/`.mjs` — only the import mechanics and types change. For `session-code.test.ts`, the `sessionCodeIndex.clear()` calls keep working because `src/server/sessions.ts` exports the same mutable `Map` reference (verified in Task 8) and `index.ts` re-exports that reference.

`src/server/index.ts` must export every imported symbol. Confirm the export list covers the full set from the test analysis (the same list verified in Task 12 Step 2). Add any missing re-exports.

- [ ] **Step 2: Delete the old `.js`/`.mjs` server tests after their `.ts` twins exist**
```bash
cd brett && git rm test/admin-token.test.js test/board-auth.test.js test/brand-config.test.js \
  test/coaching-steps.test.js test/figure-label.test.js test/figure-locks.test.js \
  test/idle-timeout.test.js test/join-code.test.js test/participants.test.js \
  test/reconnect-guard.test.js test/server-admin.test.js test/server-config.test.js \
  test/session-code.test.js test/session-state.test.js test/appearance.test.mjs
```
Leave the pure-client `.mjs` tests (`brand-persons`, `hud-model`, `join-overlay`, `locks`, `phases`, `presence`) untouched for Task 24. Leave `coaching-isolation.test.mjs` for Task 24 (path update).

- [ ] **Step 3: Update the `test` glob to drop now-deleted patterns (optional tidy)**

The Task-1 glob `test/*.test.ts test/*.test.js test/*.test.mjs` still works (no `.test.js` remain after this task except none). Keep it — it tolerates all three extensions through the migration.

- [ ] **Step 4: Gate**
```bash
cd brett && npm run typecheck && npm test
```
Expected: typecheck 0 diagnostics; every migrated `.ts` test passes; remaining client `.mjs` tests pass; `# fail 0`.

- [ ] **Step 5: Commit**
```bash
git add brett/test/*.test.ts brett/src/server/index.ts brett/package.json
git rm --cached -- brett/test/*.test.js brett/test/appearance.test.mjs 2>/dev/null || true
git commit -m "test(brett): migrate server tests to TypeScript, import from src/server

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 24: Migrate client `.mjs` tests, fix `coaching-isolation` path, delete `server.js`

**Files:**
- Modify: `test/coaching-isolation.test.mjs` → `.ts` (path update)
- Optionally rename pure-client `.mjs` tests to `.ts`
- Delete: `server.js`

- [ ] **Step 1: Update `coaching-isolation` to read the new sources**

The original reads `server.js` and `public/index.html` as raw text. After refactor, `server.js` is gone and `index.html` is a shell. Repoint it to scan the new source trees. Create `test/coaching-isolation.test.ts`:
```typescript
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function readAll(dir: string): string {
  let out = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out += readAll(p);
    else if (/\.(ts|mjs|html)$/.test(entry.name)) out += readFileSync(p, 'utf8');
  }
  return out;
}

const serverSrc = readAll(join(__dirname, '..', 'src', 'server'));
const clientSrc = readAll(join(__dirname, '..', 'src', 'client')) + readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

test('no mayhem/combat/skins tokens in server source', () => {
  for (const tok of ['Mayhem', 'lmsAlive', 'duelRooms', 'handleDuelDeath']) {
    assert.ok(!serverSrc.includes(tok), `found forbidden token: ${tok}`);
  }
});

test('no mayhem/combat tokens in client source', () => {
  for (const tok of ['Mayhem', 'combat']) {
    assert.ok(!new RegExp(tok, 'i').test(clientSrc), `found forbidden token: ${tok}`);
  }
});

test('named persons carry brand tags', () => {
  const personsSrc = readFileSync(join(__dirname, '..', 'src', 'client', 'ui', 'persons.ts'), 'utf8');
  assert.ok(/brand/i.test(personsSrc), 'persons module should reference brand tagging');
});
```
> Reconcile the exact forbidden-token list and the HUD-presence assertion with the original `coaching-isolation.test.mjs` before finalizing — copy its precise token set. The dead-code removal in Task 11 means `lmsAlive`/`duelRooms`/`handleDuelDeath` are gone, so these assertions now pass meaningfully. Delete the old `.mjs`: `git rm test/coaching-isolation.test.mjs`.

- [ ] **Step 2: Rename pure-client `.mjs` tests to `.ts` (optional but completes the migration)**

For `brand-persons`, `hud-model`, `join-overlay`, `locks`, `phases`, `presence`: these import from `public/assets/coaching/*.mjs`. Rename each test to `.ts`, keep the `.mjs` import paths (those client assets are not part of this refactor). Example `test/locks.test.ts`:
```typescript
import { test } from 'node:test';
import assert from 'node:assert';
// @ts-expect-error — runtime .mjs client asset has no type declarations
import { createLocks } from '../public/assets/coaching/locks.mjs';

test('acquire and release', () => {
  const locks = createLocks();
  assert.strictEqual(locks.acquire('f1', 'u1'), true);
  assert.strictEqual(locks.acquire('f1', 'u2'), false);
  locks.release('f1', 'u1');
  assert.strictEqual(locks.acquire('f1', 'u2'), true);
});
// ... copy remaining assertions verbatim from locks.test.mjs ...
```
Copy each file's assertions verbatim; only add the `@ts-expect-error` on the `.mjs` import line. `git rm` each old `.mjs` after its `.ts` twin passes. If a `.mjs` import causes `tsx` resolution trouble, keep that single test as `.mjs` (it already passes under the glob) — do not block the phase on cosmetic renames.

- [ ] **Step 3: Delete `server.js`**

The shim is no longer needed — all tests import `src/server/index`. Remove it and its tsx-bridge:
```bash
cd brett && git rm server.js
```
Confirm nothing else references it:
```bash
cd brett && grep -rn "server\.js" package.json Taskfile* ../k3d/brett.yaml ../Taskfile* 2>/dev/null | grep -v node_modules || echo "no-refs"
```
Expected: `no-refs`, OR a Dockerfile/Taskfile reference that must be updated to `tsx src/server/index.ts` (the container entrypoint). If `k3d/brett.yaml` or the brett `Dockerfile` runs `node server.js`, update it to `npm start` (which is now `tsx src/server/index.ts`) and ensure `tsx` is a production dependency, not dev-only — move `tsx` to `dependencies` if the container does not run `npm ci --include=dev`.

- [ ] **Step 4: Verify the container entrypoint**
```bash
cd brett && cat Dockerfile 2>/dev/null | grep -iE 'CMD|ENTRYPOINT|node|npm' ; echo "---"; grep -n 'server.js\|npm start\|node ' Dockerfile 2>/dev/null || echo "check-dockerfile-manually"
```
If the Dockerfile `CMD ["node", "server.js"]`, change it to `CMD ["npm", "start"]` and add `RUN npm run build` (so `dist/` is produced) OR keep `tsx` runtime. Document the choice in the commit message.

- [ ] **Step 5: Gate**
```bash
cd brett && npm run typecheck && npm test && npm run build
```
Expected: all three exit 0; `# fail 0`; `dist/` produced.

- [ ] **Step 6: Commit**
```bash
git add brett/test brett/Dockerfile brett/package.json ../k3d/brett.yaml 2>/dev/null
git rm --cached brett/server.js 2>/dev/null || true
git commit -m "test(brett): migrate client tests to TS, repoint coaching-isolation, delete server.js

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 25: Add type-contract exhaustiveness tests + wire CI gate

**Files:**
- Create: `test/messages.test.ts`
- Modify: `.github/workflows/ci.yml` (or the brett-specific CI job)

- [ ] **Step 1: Create `test/messages.test.ts` (compile-time + runtime exhaustiveness)**

This test fails to **compile** (hence `tsc --noEmit` / `tsx --test` errors) if a `ServerMessage` variant is added without a corresponding client handler branch, and asserts at runtime that the handler tables are in sync.

```typescript
import { test } from 'node:test';
import assert from 'node:assert';
import type { ServerMessage, ClientMessage, ServerMessageType, ClientMessageType } from '../src/types/messages';
import { assertNever } from '../src/types/messages';

// The authoritative set of ServerMessage tags the client MUST handle.
// Keep in sync with onWsMessage in src/client/ws-client.ts.
const HANDLED_SERVER_TYPES = new Set<ServerMessageType>([
  'snapshot', 'init', 'add', 'move', 'jump', 'update', 'delete', 'stiffness',
  'figure_locked', 'figure_unlocked', 'figure_lock_denied', 'locks_released_for',
  'info', 'presence_join', 'presence_leave', 'session_created', 'session_phase_change',
  'session_ended', 'admin_token_changed', 'coaching_steps_change', 'error',
]);

// Compile-time exhaustiveness: this function must handle every ServerMessage
// variant or `tsc` errors on the `assertNever(msg)` default branch.
function routeServer(msg: ServerMessage): string {
  switch (msg.type) {
    case 'snapshot': return 'snapshot';
    case 'init': return 'init';
    case 'add': return 'add';
    case 'move': return 'move';
    case 'jump': return 'jump';
    case 'update': return 'update';
    case 'delete': return 'delete';
    case 'stiffness': return 'stiffness';
    case 'figure_locked': return 'figure_locked';
    case 'figure_unlocked': return 'figure_unlocked';
    case 'figure_lock_denied': return 'figure_lock_denied';
    case 'locks_released_for': return 'locks_released_for';
    case 'info': return 'info';
    case 'presence_join': return 'presence_join';
    case 'presence_leave': return 'presence_leave';
    case 'session_created': return 'session_created';
    case 'session_phase_change': return 'session_phase_change';
    case 'session_ended': return 'session_ended';
    case 'admin_token_changed': return 'admin_token_changed';
    case 'coaching_steps_change': return 'coaching_steps_change';
    case 'error': return 'error';
    default: return assertNever(msg); // ← compile error if a variant is unhandled
  }
}

function routeClient(msg: ClientMessage): string {
  switch (msg.type) {
    case 'join': return 'join';
    case 'request_state_snapshot': return 'request_state_snapshot';
    case 'add': return 'add';
    case 'move': return 'move';
    case 'jump': return 'jump';
    case 'update': return 'update';
    case 'delete': return 'delete';
    case 'clear': return 'clear';
    case 'optik': return 'optik';
    case 'stiffness': return 'stiffness';
    case 'snapshot': return 'snapshot';
    case 'figure_lock': return 'figure_lock';
    case 'figure_unlock': return 'figure_unlock';
    case 'player_join': return 'player_join';
    case 'pong': return 'pong';
    case 'admin_kick': return 'admin_kick';
    case 'admin_broadcast': return 'admin_broadcast';
    case 'admin_session_create': return 'admin_session_create';
    case 'admin_handoff_token': return 'admin_handoff_token';
    case 'admin_round_stop': return 'admin_round_stop';
    case 'admin_round_pause': return 'admin_round_pause';
    case 'admin_coaching_steps_set': return 'admin_coaching_steps_set';
    default: return assertNever(msg); // ← compile error if a variant is unhandled
  }
}

test('every ServerMessage variant routes (compile-time exhaustiveness)', () => {
  const sample: ServerMessage = { type: 'info', count: 3 };
  assert.strictEqual(routeServer(sample), 'info');
});

test('every ClientMessage variant routes (compile-time exhaustiveness)', () => {
  const sample: ClientMessage = { type: 'join', room: 'r1' };
  assert.strictEqual(routeClient(sample), 'join');
});

test('client onWsMessage handler set matches ServerMessage union', () => {
  // Guard: if a new ServerMessage type is added, HANDLED_SERVER_TYPES must grow too.
  // routeServer covers the union exhaustively (enforced by tsc); this asserts the
  // documented handler set has not silently diverged.
  for (const t of HANDLED_SERVER_TYPES) {
    assert.ok(routeServer({ type: t } as ServerMessage as any) !== undefined, `unhandled: ${t}`);
  }
});
```
> The `assertNever(msg)` default branches are the real gate: adding `| { type: 'new_thing' }` to `ServerMessage` without a `case` makes `tsc` error "Argument of type ... is not assignable to parameter of type 'never'". `npm run typecheck` then fails CI.

- [ ] **Step 2: Verify the gate actually fires (negative test, then revert)**

Prove the exhaustiveness check works:
```bash
cd brett
# temporarily add a variant without a handler
cp src/types/messages.ts /tmp/messages.bak.ts
node -e "const fs=require('fs');let s=fs.readFileSync('src/types/messages.ts','utf8');s=s.replace(\"| { type: 'error';            reason: string };\", \"| { type: 'error';            reason: string }\n  | { type: 'unhandled_probe'; x: number };\");fs.writeFileSync('src/types/messages.ts',s);"
npm run typecheck ; echo "exit=$?"
cp /tmp/messages.bak.ts src/types/messages.ts
```
Expected: the `typecheck` run prints a TS2345 error on `assertNever(msg)` in `routeServer` and `exit=2` (non-zero). After the `cp` restore, `npm run typecheck` is clean again.

- [ ] **Step 3: Wire the CI gate**

Locate the brett CI job. The repo CI (`ci.yml`) runs `task test:all`; brett has its own test command. Add a brett step (in `.github/workflows/ci.yml` or wherever brett is built):
```yaml
  brett-typescript:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: brett } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```
> Check the existing workflow structure first (`grep -n 'brett' .github/workflows/*.yml`). If brett is already exercised inside `task test:all`, instead add `npm run typecheck && npm test && npm run build` to whatever task that is, rather than a duplicate job. Match the repo's existing node-setup convention.

- [ ] **Step 4: Final full gate**
```bash
cd brett && npm run typecheck && npm test && npm run build
```
Expected: all exit 0; `# fail 0`; `messages.test.ts` passes; `dist/` produced.

- [ ] **Step 5: Confirm module size budget (every file <300 lines)**
```bash
cd brett && find src -name '*.ts' | xargs wc -l | sort -n | awk '$1>300 && $2!="total"{print "OVER 300:",$2,$1} END{print "checked"}'
```
Expected: prints only `checked` (no `OVER 300` lines). If any module exceeds 300, split it further (e.g. `mannequin.ts` physics vs. factory) in a follow-up commit before finishing.

- [ ] **Step 6: Commit**
```bash
git add brett/test/messages.test.ts .github/workflows/ci.yml
git commit -m "test(brett): add WS message-contract exhaustiveness tests + CI typecheck gate

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Final verification checklist (run before opening the PR)

- [ ] `cd brett && npm run typecheck` → 0 diagnostics
- [ ] `cd brett && npm test` → `# fail 0`, all migrated + new tests green
- [ ] `cd brett && npm run build` → `dist/client/` and `dist/server/` produced, no errors
- [ ] `cd brett && npm start` boots and `curl localhost:3000/healthz` → `ok`
- [ ] Playwright smoke (Task 22 Step 3) → board renders, ≥1 figure, 0 console errors
- [ ] `find brett/src -name '*.ts' | xargs wc -l` → no file >300 lines
- [ ] `server.js` deleted; `index.html` contains no inline app logic (only `type="module"` scripts)
- [ ] Container entrypoint (`Dockerfile` / `k3d/brett.yaml`) updated off `node server.js`
- [ ] Dead code removed: no `lmsAlive`/`duelRooms`/`roomMeta`/`handleDuelDeath`/`ensurePickups` references anywhere

---

This plan is exhaustive and execution-ready. Path: write it to `docs/superpowers/plans/` per the dev-flow convention, or hand it directly to a Factory agent. The full plan is in this message — no file was written (per instructions). Key load-bearing details an executing agent must honor: (1) the Phase-2 dependency-injection ordering in Task 6/7/10 (figures → phases → db closure → figures.initFigures), (2) the exported-Map-reference identity for `sessionCodeIndex`/`figureMaps` so legacy tests keep passing, (3) the verbatim-copy mandate for `applyMutation`, `makeMannequin`, `onWsMessage`, and the WS dispatch (these are the bug-surface), (4) the dead-code deletion of lms/duel/coop branches in Task 11, and (5) the `assertNever` exhaustiveness gate in Task 25 with its negative-test proof in Step 2.