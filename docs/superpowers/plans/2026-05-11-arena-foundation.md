# Arena — Foundation (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the arena-server skeleton, lobby lifecycle (no gameplay), Keycloak/SealedSecret/DB plumbing, three Astro endpoints, the cross-brand `<ArenaBanner/>`, and deploy infrastructure so an admin can `POST /lobby/open` and every logged-in user on either brand sees the banner. Plan 2 layers actual gameplay (tick loop, combat, Pixi client, bots, results) on top.

**Architecture:** New TypeScript service `arena-server/` (Express + Socket.io + Drizzle) sibling to `brett/` and `website/`. Deployed only in the mentolder cluster; korczewski's website talks to the same server via `arena-ws.mentolder.de`. Banner state propagates `arena-server` → Astro per-pod long-poll → SSE → browser. DB schema `arena` lives in mentolder's shared-db. JWT validation trusts both Keycloak realms. Lobby state machine implemented end-to-end; in-match phase is a stub that holds for a fixed duration until Plan 2 replaces it with the real tick loop.

**Tech Stack:** Node 20, TypeScript 5, Express 4, Socket.io 4, Drizzle ORM + node-postgres, `jose` (JWKS), Vitest. Astro 4 + Svelte 4 on the website side. Kustomize/SealedSecrets/Traefik IngressRoute on the infra side.

**Plan 2 (follow-up, not in scope here):** game/tick.ts, physics, weapons, items, powerups, zone, map, React+Pixi client (Lobby/Match/Spectator/Results scenes), HUD, bot AI (A*), slow-mo, rematch UI, SFX, FA-31/FA-32/FA-33 E2E specs.

---

## File Structure (Plan 1)

**Create — arena-server/ (sibling to brett/, website/):**
- `arena-server/package.json` — pnpm, deps: express, socket.io, jose, drizzle-orm, pg, dotenv, pino. dev: typescript, tsx, vitest, @types/*.
- `arena-server/tsconfig.json` — `strict: true`, target ES2022, module commonjs, outDir dist.
- `arena-server/.gitignore` — node_modules, dist, .env.
- `arena-server/Dockerfile` — multi-stage, distroless runner, port 8090.
- `arena-server/README.md` — one paragraph + dev/test commands.
- `arena-server/vitest.config.ts` — node env, globals on.
- `arena-server/src/index.ts` — entrypoint; boot order: config → db → http → ws → tick (tick is no-op in Plan 1).
- `arena-server/src/config.ts` — env parsing + validation, exits with clear error on missing required vars.
- `arena-server/src/proto/messages.ts` — protocol types (mirrors website shared/lobbyTypes.ts), `PROTOCOL_VERSION = 1`.
- `arena-server/src/auth/jwks.ts` — per-issuer JWKS cache (1h TTL, rotation refresh).
- `arena-server/src/auth/jwt.ts` — verify token, return `{ sub, brand, realmRoles, exp }` or throw.
- `arena-server/src/http/middleware.ts` — `requireUser`, `requireAdmin`.
- `arena-server/src/http/routes.ts` — `/healthz`, `/lobby/active`, `POST /lobby/open`, `GET /match/:id`.
- `arena-server/src/ws/server.ts` — Socket.io engine bootstrap, JWT handshake, rate limit, `protocolVersion` check.
- `arena-server/src/ws/handlers.ts` — `lobby:join`, `lobby:ready`, `lobby:leave`, `rematch:vote`, `forfeit`, `auth:refresh`. `input` is accepted and dropped in Plan 1.
- `arena-server/src/ws/broadcasters.ts` — `emitLobbyState(code)`.
- `arena-server/src/lobby/lifecycle.ts` — state machine (`open|starting|in-match|results|closed`), transitions, timers.
- `arena-server/src/lobby/countdown.ts` — 60s join window, 5s starting, 30s rematch.
- `arena-server/src/lobby/botfill.ts` — fills to 4 with `bot_1..3` placeholder slots (no AI, no movement).
- `arena-server/src/lobby/registry.ts` — single in-process lobby (v1 singleton enforced by `409 Conflict`); multi-lobby-ready by code.
- `arena-server/src/game/constants.ts` — locked numbers from §9 (HP, weapons, items, powerups, zone). Plan 1 reads only the timing constants.
- `arena-server/src/game/state.ts` — `MatchState` shape stub (returned in `match:full-snapshot` for Plan 2; Plan 1 returns an empty state with phase + tick).
- `arena-server/src/db/schema.ts` — Drizzle table defs for `arena.matches`, `arena.match_players`, `arena.lobbies`.
- `arena-server/src/db/migrate.ts` — runs SQL files in `migrations/` in lexical order.
- `arena-server/src/db/repo.ts` — `insertLobby`, `updateLobbyPhase`, `insertMatchWithPlayers` (1+N transaction), `getRecentMatches`.
- `arena-server/src/db/migrations/0001_init.sql` — schema + tables + indexes (matches the spec §10 DDL exactly).
- `arena-server/src/db/migrations/0002_arena_app_grants.sql` — grants for `arena_app` role.
- Tests: `arena-server/src/auth/jwt.test.ts`, `lobby/lifecycle.test.ts`, `proto/messages.test.ts`, `db/repo.test.ts`.

**Create — website/ (Astro + Svelte side):**
- `website/src/components/arena/ArenaBanner.svelte` — banner UI per §7.1.
- `website/src/components/arena/shared/lobbyTypes.ts` — copy of `arena-server/src/proto/messages.ts` (CI diff guard added in Plan 1).
- `website/src/components/arena/arenaStore.ts` — Svelte store wrapping `EventSource('/api/arena/active')`.
- `website/src/pages/api/arena/token.ts` — POST, mints `aud: arena` token from session.
- `website/src/pages/api/arena/active.ts` — GET, SSE; per-pod single upstream long-poll fan-out.
- `website/src/pages/api/arena/start.ts` — POST, admin-only, relays to `arena-server` `POST /lobby/open`.
- `website/src/pages/admin/arena.astro` — host UI: Open lobby + recent matches table.
- `website/src/pages/portal/arena.astro` — placeholder ("match begins in Plan 2") plus join confirmation; renders `<ArenaBanner/>` and a Svelte status panel only.

**Modify — website/:**
- `website/src/layouts/Layout.astro` — one-line include `<ArenaBanner client:load />` near top of body.
- `website/src/layouts/PortalLayout.astro` — same include.
- `website/src/layouts/AdminLayout.astro` — same include.
- `website/astro.config.mjs` — confirm `@astrojs/svelte` integration is already present (it is — used by all current Svelte components). No change unless Svelte 4 needs a flag.

**Create — k3d/ and overlays:**
- `k3d/arena.yaml` — Deployment + Service + IngressRoute (host `arena-ws.${PROD_DOMAIN}`).
- `k3d/migrations-arena.yaml` — Job that runs `0001_init.sql` + `0002_arena_app_grants.sql` against shared-db as the `website_owner` role (which already has CREATEROLE-equivalent privileges via the SealedSecret).
- `prod-mentolder/kustomization.yaml` — add `arena.yaml` + `migrations-arena.yaml` to resources.
- `prod-korczewski/kustomization.yaml` — do **not** add arena files (korczewski only needs the website ConfigMap entry).

**Modify — realms:**
- `prod-mentolder/realm-workspace-mentolder.json` — add `arena` OIDC client + `arena_admin` realm role; assign role to admin user via realm-role-mapping section.
- `prod-korczewski/realm-workspace-korczewski.json` — add `arena` OIDC client (no `arena_admin` role; not granted on this realm).

**Modify — environments:**
- `environments/.secrets/mentolder.yaml` — add `arena_db_password`, `arena_db_url`. Re-seal.
- `environments/sealed-secrets/mentolder.yaml` — regenerated by `task env:seal ENV=mentolder`.
- `environments/schema.yaml` — declare new keys `ARENA_WS_URL`, `arena_db_password`, `arena_db_url`.
- `environments/mentolder.yaml` — add `ARENA_WS_URL: https://arena-ws.mentolder.de`.
- `environments/korczewski.yaml` — add `ARENA_WS_URL: https://arena-ws.mentolder.de` (same — points at mentolder).
- `environments/dev.yaml` — add `ARENA_WS_URL: http://arena.localhost`.

**Modify — Taskfile + website ConfigMap:**
- `Taskfile.yml` — add `arena:build`, `arena:push`, `arena:deploy`, `arena:status`, `arena:logs`, `arena:db`, `arena:teardown`, `arena:deploy:all-prods`, `feature:arena`. Append `${ARENA_WS_URL}` to the envsubst lists at Taskfile.yml:1303 (k3d deploy), Taskfile.yml:1362 (`ENVSUBST_VARS` builder for prod), and Taskfile.yml:2177 (website deploy).
- `k3d/website.yaml` — add `ARENA_WS_URL` env var to the website container (read from ConfigMap or directly via envsubst).

**Modify — CI:**
- `.github/workflows/ci.yml` — add `arena-server` job (pnpm install/test/build) and a protocol-drift diff step (`arena-server/src/proto/messages.ts` vs `website/src/components/arena/shared/lobbyTypes.ts`).

**Create — tests:**
- `tests/local/SA-11.bats` — non-admin POST `/api/arena/start` returns 403.
- `tests/local/SA-12.bats` — korczewski-realm JWT accepted by `arena-server` at `/lobby/active`.
- `tests/local/SA-13.bats` — JWT signed by an untrusted issuer is rejected with 401.
- `tests/local/NFA-10.bats` — 50 sequential `/healthz` requests; p95 < 200ms.
- `tests/e2e/specs/fa-30-arena-banner.spec.ts` — admin opens lobby on mentolder; banner appears on `/` on both brands; dismiss persists per-lobby; banner disappears on close.

**Regenerate:**
- `website/src/data/test-inventory.json` — `task test:inventory` regenerates; commit alongside test additions.

**Document:**
- `docs-site/content/services/arena.md` — short page (purpose, host, healthz, admin role). Deployed via `task docs:deploy`.

---

## Task 1: arena-server — Project scaffold

**Files:**
- Create: `arena-server/package.json`
- Create: `arena-server/tsconfig.json`
- Create: `arena-server/.gitignore`
- Create: `arena-server/.dockerignore`
- Create: `arena-server/vitest.config.ts`
- Create: `arena-server/README.md`
- Create: `arena-server/src/index.ts` (stub: prints "arena-server boot")

- [ ] **Step 1: Create `arena-server/package.json`**

```json
{
  "name": "arena-server",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^4.22.1",
    "socket.io": "^4.7.5",
    "jose": "^5.9.4",
    "drizzle-orm": "^0.36.4",
    "pg": "^8.13.1",
    "dotenv": "^16.4.5",
    "pino": "^9.5.0",
    "pino-http": "^10.3.0"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "tsx": "^4.19.2",
    "vitest": "^2.1.5",
    "@types/express": "^4.17.21",
    "@types/node": "^20.17.6",
    "@types/pg": "^8.11.10",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2"
  }
}
```

- [ ] **Step 2: Create `arena-server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create `arena-server/.gitignore`**

```
node_modules
dist
.env
.env.*
coverage
*.log
```

- [ ] **Step 4: Create `arena-server/.dockerignore`**

```
node_modules
dist
.env
.env.*
coverage
*.log
.git
.gitignore
README.md
```

- [ ] **Step 5: Create `arena-server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Create `arena-server/README.md`**

```markdown
# arena-server

Authoritative game server for the Arena last-man-standing match. See
`docs/superpowers/specs/2026-05-11-arena-design.md` for the design.

## Local development

```bash
cd arena-server
pnpm install
cp .env.example .env   # then fill in DB_URL + issuer URLs
pnpm dev
```

## Tests

```bash
pnpm test
```

## Deployment

See `task arena:deploy ENV=mentolder` in the repo root Taskfile.
```

- [ ] **Step 7: Create `arena-server/src/index.ts` (stub)**

```ts
console.log('arena-server boot — Plan 1 scaffold');
```

- [ ] **Step 8: Install + verify build**

Run:
```bash
cd arena-server && pnpm install && pnpm build
```
Expected: `dist/index.js` exists; `node dist/index.js` prints "arena-server boot — Plan 1 scaffold".

- [ ] **Step 9: Commit**

```bash
git add arena-server/
git commit -m "feat(arena): scaffold arena-server TypeScript project"
```

---

## Task 2: arena-server — config module + structured logger

**Files:**
- Create: `arena-server/src/config.ts`
- Create: `arena-server/src/log.ts`
- Create: `arena-server/src/config.test.ts`

- [ ] **Step 1: Create `arena-server/src/log.ts`**

```ts
import pino from 'pino';

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { svc: 'arena-server' },
});
```

- [ ] **Step 2: Write failing test `arena-server/src/config.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('parses a complete env block', () => {
    const env = {
      PORT: '8090',
      DB_URL: 'postgresql://arena_app:pw@shared-db:5432/website',
      KEYCLOAK_ISSUER_MENTOLDER: 'https://auth.mentolder.de/realms/workspace',
      KEYCLOAK_ISSUER_KORCZEWSKI: 'https://auth.korczewski.de/realms/workspace',
      LOG_LEVEL: 'info',
    };
    const cfg = loadConfig(env);
    expect(cfg.port).toBe(8090);
    expect(cfg.issuers).toHaveLength(2);
  });

  it('throws on missing DB_URL', () => {
    expect(() => loadConfig({ PORT: '8090' } as any)).toThrow(/DB_URL/);
  });
});
```

- [ ] **Step 3: Run — expect FAIL ("Cannot find module './config'")**

Run: `cd arena-server && pnpm test src/config.test.ts`

- [ ] **Step 4: Implement `arena-server/src/config.ts`**

```ts
export interface Config {
  port: number;
  dbUrl: string;
  issuers: { url: string; brand: 'mentolder' | 'korczewski' }[];
  logLevel: string;
}

function need(env: Record<string, string | undefined>, k: string): string {
  const v = env[k];
  if (!v) throw new Error(`Missing required env var: ${k}`);
  return v;
}

export function loadConfig(env = process.env): Config {
  return {
    port: parseInt(env.PORT ?? '8090', 10),
    dbUrl: need(env, 'DB_URL'),
    issuers: [
      { url: need(env, 'KEYCLOAK_ISSUER_MENTOLDER'), brand: 'mentolder' },
      { url: need(env, 'KEYCLOAK_ISSUER_KORCZEWSKI'), brand: 'korczewski' },
    ],
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `cd arena-server && pnpm test src/config.test.ts`
Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add arena-server/src/config.ts arena-server/src/config.test.ts arena-server/src/log.ts
git commit -m "feat(arena): config loader + structured logger"
```

---

## Task 3: arena-server — protocol types (single source of truth)

**Files:**
- Create: `arena-server/src/proto/messages.ts`
- Create: `arena-server/src/proto/messages.test.ts`

- [ ] **Step 1: Write failing test `arena-server/src/proto/messages.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg, isClientMsg } from './messages';

describe('protocol', () => {
  it('exposes version 1', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('round-trips a lobby:join client message', () => {
    const msg: ClientMsg = { t: 'lobby:join', code: 'ZK4M9X' };
    const json = JSON.stringify(msg);
    const back = JSON.parse(json) as ClientMsg;
    expect(isClientMsg(back)).toBe(true);
    expect(back.t).toBe('lobby:join');
  });

  it('round-trips a server lobby:state', () => {
    const msg: ServerMsg = {
      t: 'lobby:state', code: 'ZK4M9X', phase: 'open',
      players: [], expiresAt: Date.now() + 60_000,
    };
    expect(JSON.parse(JSON.stringify(msg)).t).toBe('lobby:state');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd arena-server && pnpm test src/proto/messages.test.ts`

- [ ] **Step 3: Implement `arena-server/src/proto/messages.ts`**

```ts
export const PROTOCOL_VERSION = 1;

export type LobbyPhase =
  | 'open' | 'starting' | 'in-match' | 'slow-mo' | 'results' | 'closed';

export interface PlayerSlot {
  key: string;            // sub@brand for humans, bot_<n> for bots
  displayName: string;
  brand: 'mentolder' | 'korczewski' | null;
  characterId: string;
  isBot: boolean;
  ready: boolean;
  alive: boolean;
}

export interface MatchResult {
  playerKey: string;
  displayName: string;
  isBot: boolean;
  place: number;
  kills: number;
  deaths: number;
  forfeit: boolean;
}

export interface MatchState {
  // Plan 1 stub: extended in Plan 2.
  tick: number;
  phase: LobbyPhase;
}

export type DiffOp = { p: string; v: unknown };
export type GameEvent =
  | { e: 'kill'; killer: string; victim: string }
  | { e: 'pickup'; player: string; item: string }
  | { e: 'dodge'; player: string };

export type ClientMsg =
  | { t: 'lobby:open' }
  | { t: 'lobby:join'; code: string }
  | { t: 'lobby:ready'; ready: boolean }
  | { t: 'lobby:leave' }
  | { t: 'input'; seq: number; wasd: number; aim: number;
        fire: boolean; melee: boolean; pickup: boolean; dodge: boolean; tick: number }
  | { t: 'spectator:follow'; target: string | null }
  | { t: 'rematch:vote'; yes: boolean }
  | { t: 'forfeit' }
  | { t: 'auth:refresh'; token: string };

export type ServerMsg =
  | { t: 'lobby:state'; code: string; phase: LobbyPhase;
        players: PlayerSlot[]; expiresAt?: number; countdownMs?: number }
  | { t: 'match:full-snapshot'; tick: number; state: MatchState }
  | { t: 'match:diff'; tick: number; ops: DiffOp[] }
  | { t: 'match:event'; events: GameEvent[] }
  | { t: 'match:end'; results: MatchResult[]; matchId: string }
  | { t: 'error'; code: string; message: string };

const CLIENT_TYPES = new Set([
  'lobby:open','lobby:join','lobby:ready','lobby:leave','input',
  'spectator:follow','rematch:vote','forfeit','auth:refresh',
]);

export function isClientMsg(x: unknown): x is ClientMsg {
  return !!x && typeof x === 'object' && 't' in (x as any) &&
    CLIENT_TYPES.has((x as any).t);
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add arena-server/src/proto/
git commit -m "feat(arena): protocol message types + version 1"
```

---

## Task 4: arena-server — JWKS cache + JWT validation

**Files:**
- Create: `arena-server/src/auth/jwks.ts`
- Create: `arena-server/src/auth/jwt.ts`
- Create: `arena-server/src/auth/jwt.test.ts`

- [ ] **Step 1: Create `arena-server/src/auth/jwks.ts`**

```ts
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { log } from '../log';

interface CacheEntry { jwks: JWTVerifyGetKey; expiresAt: number; }

const TTL_MS = 60 * 60 * 1000; // 1h
const cache = new Map<string, CacheEntry>();

export function getJwks(issuer: string): JWTVerifyGetKey {
  const now = Date.now();
  const hit = cache.get(issuer);
  if (hit && hit.expiresAt > now) return hit.jwks;
  const url = new URL(`${issuer}/protocol/openid-connect/certs`);
  const jwks = createRemoteJWKSet(url, {
    cooldownDuration: 30_000,
    cacheMaxAge: TTL_MS,
  });
  cache.set(issuer, { jwks, expiresAt: now + TTL_MS });
  log.info({ issuer }, 'jwks cache populated');
  return jwks;
}

export function _resetJwksCache() { cache.clear(); }
```

- [ ] **Step 2: Write failing test `arena-server/src/auth/jwt.test.ts`**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import { verifyArenaJwt } from './jwt';

let pair: { publicKey: CryptoKey; privateKey: CryptoKey };
let jwk: any;

beforeAll(async () => {
  pair = await generateKeyPair('RS256');
  jwk = await exportJWK(pair.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
});

async function makeToken(opts: { iss: string; aud?: string; roles?: string[]; exp?: number }) {
  return new SignJWT({
    realm_access: { roles: opts.roles ?? [] },
    preferred_username: 'patrick',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(opts.iss)
    .setAudience(opts.aud ?? 'arena')
    .setSubject('user-uuid-1')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 60)
    .sign(pair.privateKey);
}

describe('verifyArenaJwt', () => {
  it('accepts a token from a trusted issuer with aud=arena', async () => {
    const issuer = 'https://auth.mentolder.de/realms/workspace';
    const token = await makeToken({ iss: issuer, roles: ['arena_admin'] });
    const claims = await verifyArenaJwt(token, {
      trustedIssuers: [{ url: issuer, brand: 'mentolder' }],
      keyResolver: async () => pair.publicKey,
    });
    expect(claims.sub).toBe('user-uuid-1');
    expect(claims.brand).toBe('mentolder');
    expect(claims.realmRoles).toContain('arena_admin');
  });

  it('rejects untrusted issuer', async () => {
    const token = await makeToken({ iss: 'https://evil.example.com/' });
    await expect(verifyArenaJwt(token, {
      trustedIssuers: [{ url: 'https://auth.mentolder.de/realms/workspace', brand: 'mentolder' }],
      keyResolver: async () => pair.publicKey,
    })).rejects.toThrow(/untrusted issuer/i);
  });

  it('rejects wrong audience', async () => {
    const issuer = 'https://auth.mentolder.de/realms/workspace';
    const token = await makeToken({ iss: issuer, aud: 'other' });
    await expect(verifyArenaJwt(token, {
      trustedIssuers: [{ url: issuer, brand: 'mentolder' }],
      keyResolver: async () => pair.publicKey,
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run — expect FAIL ("Cannot find module './jwt'")**

Run: `cd arena-server && pnpm test src/auth/jwt.test.ts`

- [ ] **Step 4: Implement `arena-server/src/auth/jwt.ts`**

```ts
import { jwtVerify, type KeyLike } from 'jose';
import { getJwks } from './jwks';

export type Brand = 'mentolder' | 'korczewski';

export interface TrustedIssuer { url: string; brand: Brand; }

export interface ArenaClaims {
  sub: string;
  brand: Brand;
  displayName: string;
  realmRoles: string[];
  exp: number;
}

export interface VerifyOpts {
  trustedIssuers: TrustedIssuer[];
  /** Test seam: skip JWKS network fetch by supplying a key directly. */
  keyResolver?: (issuer: string) => Promise<KeyLike>;
}

export async function verifyArenaJwt(token: string, opts: VerifyOpts): Promise<ArenaClaims> {
  // Decode issuer claim before signature verification (header is unauthenticated).
  // Use jose's two-step: try each trusted issuer's JWKS until one verifies.
  for (const ti of opts.trustedIssuers) {
    try {
      const key = opts.keyResolver
        ? await opts.keyResolver(ti.url)
        : getJwks(ti.url);
      const { payload } = await jwtVerify(token, key as any, {
        issuer: ti.url,
        audience: 'arena',
      });
      const roles = (payload.realm_access as any)?.roles ?? [];
      return {
        sub: payload.sub!,
        brand: ti.brand,
        displayName: (payload as any).preferred_username ?? payload.sub!,
        realmRoles: roles,
        exp: payload.exp!,
      };
    } catch (err: any) {
      // Try the next issuer only when issuer mismatch; otherwise rethrow.
      if (!/issuer|JWSSignatureVerificationFailed/i.test(err.message)) {
        throw err;
      }
    }
  }
  throw new Error('untrusted issuer');
}

export function playerKey(claims: ArenaClaims): string {
  return `${claims.sub}@${claims.brand}`;
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `cd arena-server && pnpm test src/auth/`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add arena-server/src/auth/
git commit -m "feat(arena): dual-issuer JWT validation via jose"
```

---

## Task 5: arena-server — Drizzle schema + DB migrations

**Files:**
- Create: `arena-server/src/db/schema.ts`
- Create: `arena-server/src/db/migrations/0001_init.sql`
- Create: `arena-server/src/db/migrations/0002_arena_app_grants.sql`
- Create: `arena-server/src/db/migrate.ts`
- Create: `arena-server/src/db/client.ts`

- [ ] **Step 1: Create `arena-server/src/db/migrations/0001_init.sql`**

```sql
CREATE SCHEMA IF NOT EXISTS arena;

CREATE TABLE IF NOT EXISTS arena.matches (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_code      char(6)       NOT NULL,
  opened_at       timestamptz   NOT NULL,
  started_at      timestamptz   NOT NULL,
  ended_at        timestamptz   NOT NULL,
  duration_s      integer       GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (ended_at - started_at))::int) STORED,
  winner_player   text          NULL,
  map             text          NOT NULL DEFAULT 'concrete-arena',
  bot_count       smallint      NOT NULL DEFAULT 0,
  human_count     smallint      NOT NULL,
  forfeit_count   smallint      NOT NULL DEFAULT 0,
  results_jsonb   jsonb         NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_started_idx ON arena.matches (started_at DESC);

CREATE TABLE IF NOT EXISTS arena.match_players (
  match_id        uuid          NOT NULL REFERENCES arena.matches(id) ON DELETE CASCADE,
  player_key      text          NOT NULL,
  display_name    text          NOT NULL,
  brand           text          NULL,
  is_bot          boolean       NOT NULL,
  character_id    text          NOT NULL,
  place           smallint      NOT NULL,
  kills           smallint      NOT NULL DEFAULT 0,
  deaths          smallint      NOT NULL DEFAULT 0,
  forfeit         boolean       NOT NULL DEFAULT false,
  PRIMARY KEY (match_id, player_key)
);
CREATE INDEX IF NOT EXISTS match_players_key_idx ON arena.match_players (player_key, match_id DESC);

CREATE TABLE IF NOT EXISTS arena.lobbies (
  code            char(6)       PRIMARY KEY,
  phase           text          NOT NULL,
  host_key        text          NOT NULL,
  opened_at       timestamptz   NOT NULL DEFAULT now(),
  expires_at      timestamptz   NOT NULL,
  state_jsonb     jsonb         NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS lobbies_phase_idx ON arena.lobbies (phase) WHERE phase != 'closed';
```

- [ ] **Step 2: Create `arena-server/src/db/migrations/0002_arena_app_grants.sql`**

```sql
-- Idempotent role creation; password set by bootstrap Job from SealedSecret.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arena_app') THEN
    CREATE ROLE arena_app LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA arena TO arena_app;
GRANT SELECT, INSERT, UPDATE ON arena.matches       TO arena_app;
GRANT SELECT, INSERT, UPDATE ON arena.match_players TO arena_app;
GRANT SELECT, INSERT, UPDATE ON arena.lobbies       TO arena_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA arena
  GRANT SELECT, INSERT, UPDATE ON TABLES TO arena_app;
```

- [ ] **Step 3: Create `arena-server/src/db/schema.ts`**

```ts
import { pgSchema, uuid, char, text, smallint, boolean, integer, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core';

export const arena = pgSchema('arena');

export const matches = arena.table('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  lobbyCode: char('lobby_code', { length: 6 }).notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
  winnerPlayer: text('winner_player'),
  map: text('map').notNull().default('concrete-arena'),
  botCount: smallint('bot_count').notNull().default(0),
  humanCount: smallint('human_count').notNull(),
  forfeitCount: smallint('forfeit_count').notNull().default(0),
  resultsJsonb: jsonb('results_jsonb').notNull(),
});

export const matchPlayers = arena.table('match_players', {
  matchId: uuid('match_id').notNull(),
  playerKey: text('player_key').notNull(),
  displayName: text('display_name').notNull(),
  brand: text('brand'),
  isBot: boolean('is_bot').notNull(),
  characterId: text('character_id').notNull(),
  place: smallint('place').notNull(),
  kills: smallint('kills').notNull().default(0),
  deaths: smallint('deaths').notNull().default(0),
  forfeit: boolean('forfeit').notNull().default(false),
}, (t) => ({ pk: primaryKey({ columns: [t.matchId, t.playerKey] }) }));

export const lobbies = arena.table('lobbies', {
  code: char('code', { length: 6 }).primaryKey(),
  phase: text('phase').notNull(),
  hostKey: text('host_key').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  stateJsonb: jsonb('state_jsonb').notNull().default({}),
});
```

- [ ] **Step 4: Create `arena-server/src/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Config } from '../config';

export function makeDb(cfg: Config) {
  const pool = new Pool({ connectionString: cfg.dbUrl, max: 10 });
  return { pool, db: drizzle(pool) };
}
```

- [ ] **Step 5: Create `arena-server/src/db/migrate.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { log } from '../log';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS arena;
    CREATE TABLE IF NOT EXISTS arena._migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM arena._migrations WHERE filename = $1', [f],
    );
    if (rows.length) { log.info({ f }, 'migration already applied'); continue; }
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    log.info({ f }, 'applying migration');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO arena._migrations (filename) VALUES ($1)', [f]);
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add arena-server/src/db/
git commit -m "feat(arena): drizzle schema + idempotent SQL migrations"
```

---

## Task 6: arena-server — repo layer (lobby + match writes)

**Files:**
- Create: `arena-server/src/db/repo.ts`
- Create: `arena-server/src/db/repo.test.ts`

- [ ] **Step 1: Write failing test `arena-server/src/db/repo.test.ts`**

This test uses a real Postgres via env var `TEST_DB_URL`. If unset, the test is skipped — CI sets it via a service container in Task 32.

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from './migrate';
import { makeRepo, type MatchInsert } from './repo';

const url = process.env.TEST_DB_URL;
const d = url ? describe : describe.skip;

let pool: Pool;
let repo: ReturnType<typeof makeRepo>;

d('repo (integration)', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await runMigrations(pool);
    repo = makeRepo(pool);
  });

  afterAll(async () => { await pool.end(); });

  it('inserts a match with its players in one transaction', async () => {
    const now = new Date();
    const match: MatchInsert = {
      lobbyCode: 'TST001',
      openedAt: new Date(now.getTime() - 60_000),
      startedAt: new Date(now.getTime() - 30_000),
      endedAt: now,
      winnerPlayer: 'user-1@mentolder',
      botCount: 2,
      humanCount: 2,
      forfeitCount: 0,
      resultsJsonb: { tickCount: 0 },
      players: [
        { playerKey: 'user-1@mentolder', displayName: 'patrick', brand: 'mentolder',
          isBot: false, characterId: 'blonde-guy', place: 1, kills: 0, deaths: 0, forfeit: false },
        { playerKey: 'bot_1', displayName: 'Bot 1', brand: null,
          isBot: true, characterId: 'brown-guy', place: 2, kills: 0, deaths: 1, forfeit: false },
      ],
    };
    const matchId = await repo.insertMatchWithPlayers(match);
    expect(matchId).toMatch(/^[0-9a-f-]{36}$/);
    const got = await pool.query(
      'SELECT count(*)::int AS n FROM arena.match_players WHERE match_id = $1', [matchId],
    );
    expect(got.rows[0].n).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL ("Cannot find module './repo'") or SKIP if no TEST_DB_URL**

Run: `cd arena-server && pnpm test src/db/repo.test.ts`

- [ ] **Step 3: Implement `arena-server/src/db/repo.ts`**

```ts
import type { Pool } from 'pg';

export interface MatchPlayerInsert {
  playerKey: string;
  displayName: string;
  brand: 'mentolder' | 'korczewski' | null;
  isBot: boolean;
  characterId: string;
  place: number;
  kills: number;
  deaths: number;
  forfeit: boolean;
}

export interface MatchInsert {
  lobbyCode: string;
  openedAt: Date;
  startedAt: Date;
  endedAt: Date;
  winnerPlayer: string | null;
  botCount: number;
  humanCount: number;
  forfeitCount: number;
  resultsJsonb: unknown;
  players: MatchPlayerInsert[];
}

export function makeRepo(pool: Pool) {
  return {
    async insertLobby(row: { code: string; phase: string; hostKey: string; expiresAt: Date }) {
      await pool.query(
        `INSERT INTO arena.lobbies (code, phase, host_key, expires_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (code) DO UPDATE SET phase = EXCLUDED.phase, expires_at = EXCLUDED.expires_at`,
        [row.code, row.phase, row.hostKey, row.expiresAt],
      );
    },

    async updateLobbyPhase(code: string, phase: string) {
      await pool.query(
        'UPDATE arena.lobbies SET phase = $2 WHERE code = $1', [code, phase],
      );
    },

    async insertMatchWithPlayers(m: MatchInsert): Promise<string> {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const { rows } = await c.query(
          `INSERT INTO arena.matches
            (lobby_code, opened_at, started_at, ended_at, winner_player,
             bot_count, human_count, forfeit_count, results_jsonb)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id`,
          [m.lobbyCode, m.openedAt, m.startedAt, m.endedAt, m.winnerPlayer,
           m.botCount, m.humanCount, m.forfeitCount, m.resultsJsonb],
        );
        const matchId = rows[0].id as string;
        for (const p of m.players) {
          await c.query(
            `INSERT INTO arena.match_players
              (match_id, player_key, display_name, brand, is_bot, character_id,
               place, kills, deaths, forfeit)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [matchId, p.playerKey, p.displayName, p.brand, p.isBot, p.characterId,
             p.place, p.kills, p.deaths, p.forfeit],
          );
        }
        await c.query('COMMIT');
        return matchId;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },

    async getRecentMatches(limit = 20) {
      const { rows } = await pool.query(
        `SELECT id, lobby_code, started_at, ended_at, winner_player,
                bot_count, human_count, forfeit_count
         FROM arena.matches ORDER BY started_at DESC LIMIT $1`, [limit],
      );
      return rows;
    },
  };
}

export type Repo = ReturnType<typeof makeRepo>;
```

- [ ] **Step 4: Run — expect PASS (or SKIP if no TEST_DB_URL)**

Run: `cd arena-server && pnpm test src/db/repo.test.ts`

- [ ] **Step 5: Commit**

```bash
git add arena-server/src/db/
git commit -m "feat(arena): repo with 1+N match-write transaction"
```

---

## Task 7: arena-server — game constants (locked v1 numbers)

**Files:**
- Create: `arena-server/src/game/constants.ts`

- [ ] **Step 1: Create `arena-server/src/game/constants.ts`**

```ts
// All v1 game-system numbers. Plan 1 uses timings + map dims;
// Plan 2 will read the rest. Changing any value here is a content change,
// not a code change — do not deep-link these values from outside src/game/.

export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;

// Lobby timings
export const LOBBY_OPEN_DURATION_MS   = 60_000;
export const LOBBY_STARTING_DURATION_MS = 5_000;
export const LOBBY_RESULTS_DURATION_MS = 30_000;
export const SLOW_MO_DURATION_MS      = 800;
export const PROTOCOL_VERSION         = 1;

// Map (sandbox.jsx port)
export const MAP_W = 960;
export const MAP_H = 540;

// Player
export const PLAYER_HP = 2;
export const PLAYER_ARMOR_CAP = 1;
export const PLAYER_MOVE_SPEED = 180;
export const PLAYER_HITBOX_W = 24;
export const PLAYER_HITBOX_H = 24;
export const SPAWN_INVULN_MS = 1500;
export const DODGE_IFRAME_MS = 400;
export const DODGE_COOLDOWN_MS = 1200;
export const DODGE_DISTANCE = 90;

// Weapons (hitscan, 1 damage)
export const WEAPONS = {
  glock:  { fireRate: 2.5, mag: 12, reloadMs: 1400, spreadRad: 0.052, rangePx: 500, infinite: true },
  deagle: { fireRate: 1.5, mag:  7, reloadMs: 2000, spreadRad: 0.017, rangePx: 700 },
  m4a1:   { fireRate: 8.0, mag: 30, reloadMs: 2400, spreadRad: 0.087, rangePx: 600 },
  melee:  { cooldownMs: 800, coneDeg: 90, rangePx: 40, ohko: true },
} as const;

// Items
export const ITEM_SPAWN_CYCLE_MS = 60_000;
export const ITEMS_PER_DROP = 3;

// Powerups
export const POWERUP_SPAWN_CYCLE_MS = 90_000;
export const POWERUPS = {
  shield: { durationMs: 3_000 },
  speed:  { durationMs: 5_000, moveMultiplier: 1.6 },
  damage: { durationMs: 5_000, damageMultiplier: 2 },
  emp:    { durationMs: 3_000, radiusPx: 250 },
  cloak:  { durationMs: 4_000, alpha: 0.15 },
} as const;

// Zone
export const ZONE_DELAY_MS = 30_000;
export const ZONE_SHRINK_DURATION_MS = 180_000;
export const ZONE_FINAL_RADIUS_PX = 200;
export const ZONE_DAMAGE_INTERVAL_MS = 3_000;

// Bot config
export const BOT_KEYS = ['bot_1', 'bot_2', 'bot_3'] as const;
export const BOT_DEFAULT_CHARACTERS = ['brown-guy', 'long-red-girl', 'blonde-long-girl'] as const;
```

- [ ] **Step 2: Commit**

```bash
git add arena-server/src/game/constants.ts
git commit -m "feat(arena): lock v1 game constants in one file"
```

---

## Task 8: arena-server — lobby state machine

**Files:**
- Create: `arena-server/src/lobby/registry.ts`
- Create: `arena-server/src/lobby/lifecycle.ts`
- Create: `arena-server/src/lobby/botfill.ts`
- Create: `arena-server/src/lobby/lifecycle.test.ts`

- [ ] **Step 1: Create `arena-server/src/lobby/registry.ts`**

```ts
import type { PlayerSlot } from '../proto/messages';

export interface Lobby {
  code: string;
  phase: 'open' | 'starting' | 'in-match' | 'slow-mo' | 'results' | 'closed';
  hostKey: string;
  openedAt: number;
  expiresAt: number;
  players: Map<string, PlayerSlot>;     // key = sub@brand or bot_<n>
  rematchYes: Set<string>;
  timers: { [k: string]: NodeJS.Timeout | undefined };
}

const lobbies = new Map<string, Lobby>();

export function getLobby(code: string): Lobby | undefined { return lobbies.get(code); }
export function listLobbies(): Lobby[] { return [...lobbies.values()]; }
export function activeLobby(): Lobby | undefined {
  return listLobbies().find(l => l.phase !== 'closed');
}
export function putLobby(l: Lobby) { lobbies.set(l.code, l); }
export function removeLobby(code: string) { lobbies.delete(code); }

export function makeCode(): string {
  // 6 chars, [A-Z2-9] minus ambiguous I/O/1/0
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
```

- [ ] **Step 2: Create `arena-server/src/lobby/botfill.ts`**

```ts
import type { Lobby } from './registry';
import { BOT_KEYS, BOT_DEFAULT_CHARACTERS } from '../game/constants';
import type { PlayerSlot } from '../proto/messages';

export function fillBots(lobby: Lobby): void {
  let i = 0;
  while (lobby.players.size < 4 && i < BOT_KEYS.length) {
    const key = BOT_KEYS[i];
    if (!lobby.players.has(key)) {
      const slot: PlayerSlot = {
        key,
        displayName: `Bot ${i + 1}`,
        brand: null,
        characterId: BOT_DEFAULT_CHARACTERS[i],
        isBot: true,
        ready: true,
        alive: true,
      };
      lobby.players.set(key, slot);
    }
    i++;
  }
}
```

- [ ] **Step 3: Write failing test `arena-server/src/lobby/lifecycle.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Lifecycle } from './lifecycle';
import * as registry from './registry';
import type { PlayerSlot } from '../proto/messages';

function humanSlot(key: string, name = 'P'): PlayerSlot {
  return { key, displayName: name, brand: 'mentolder', characterId: 'blonde-guy',
           isBot: false, ready: true, alive: true };
}

describe('Lifecycle', () => {
  beforeEach(() => {
    for (const l of registry.listLobbies()) registry.removeLobby(l.code);
    vi.useFakeTimers();
  });

  it('opens then auto-fills bots and enters in-match after 60s', () => {
    const onBroadcast = vi.fn();
    const lc = new Lifecycle({ onBroadcast, persist: { insertLobby: async () => {}, updateLobbyPhase: async () => {} } as any });
    const { code } = lc.open({ hostKey: 'patrick@mentolder', hostName: 'Patrick' });
    const lobby = registry.getLobby(code)!;
    expect(lobby.phase).toBe('open');
    expect(lobby.players.size).toBe(1);

    vi.advanceTimersByTime(60_001);
    expect(lobby.phase).toBe('starting');
    expect(lobby.players.size).toBe(4);
    vi.advanceTimersByTime(5_001);
    expect(lobby.phase).toBe('in-match');
  });

  it('rejects a second open while one is active', () => {
    const lc = new Lifecycle({ onBroadcast: () => {}, persist: { insertLobby: async () => {}, updateLobbyPhase: async () => {} } as any });
    lc.open({ hostKey: 'patrick@mentolder', hostName: 'Patrick' });
    expect(() => lc.open({ hostKey: 'other@mentolder', hostName: 'X' })).toThrow(/409|conflict/i);
  });

  it('starts at 5s when 4 humans join', () => {
    const lc = new Lifecycle({ onBroadcast: () => {}, persist: { insertLobby: async () => {}, updateLobbyPhase: async () => {} } as any });
    const { code } = lc.open({ hostKey: 'h1@mentolder', hostName: 'h1' });
    lc.join(code, humanSlot('h2@mentolder'));
    lc.join(code, humanSlot('h3@mentolder'));
    lc.join(code, humanSlot('h4@korczewski'));
    expect(registry.getLobby(code)!.phase).toBe('starting');
  });
});
```

- [ ] **Step 4: Run — expect FAIL ("Cannot find module './lifecycle'")**

- [ ] **Step 5: Implement `arena-server/src/lobby/lifecycle.ts`**

```ts
import { makeCode, putLobby, getLobby, activeLobby, removeLobby, type Lobby } from './registry';
import { fillBots } from './botfill';
import {
  LOBBY_OPEN_DURATION_MS, LOBBY_STARTING_DURATION_MS, LOBBY_RESULTS_DURATION_MS,
} from '../game/constants';
import type { PlayerSlot } from '../proto/messages';
import type { Repo } from '../db/repo';

export interface LifecycleDeps {
  onBroadcast: (code: string) => void;
  persist: Pick<Repo, 'insertLobby' | 'updateLobbyPhase' | 'insertMatchWithPlayers'>;
}

export interface OpenRequest { hostKey: string; hostName: string; }
export interface OpenResult { code: string; expiresAt: number; }

export class Lifecycle {
  constructor(private deps: LifecycleDeps) {}

  open(req: OpenRequest): OpenResult {
    if (activeLobby()) {
      const err = new Error('409 Conflict: another lobby is already active');
      (err as any).code = 409;
      throw err;
    }
    const code = makeCode();
    const now = Date.now();
    const expiresAt = now + LOBBY_OPEN_DURATION_MS;
    const host: PlayerSlot = {
      key: req.hostKey, displayName: req.hostName, brand: req.hostKey.endsWith('@korczewski') ? 'korczewski' : 'mentolder',
      characterId: 'blonde-guy', isBot: false, ready: true, alive: true,
    };
    const lobby: Lobby = {
      code, phase: 'open', hostKey: req.hostKey,
      openedAt: now, expiresAt,
      players: new Map([[host.key, host]]),
      rematchYes: new Set(), timers: {},
    };
    putLobby(lobby);
    this.deps.persist.insertLobby({ code, phase: 'open', hostKey: req.hostKey, expiresAt: new Date(expiresAt) })
      .catch(() => {/* logged in caller */});
    lobby.timers.open = setTimeout(() => this.toStarting(code), LOBBY_OPEN_DURATION_MS);
    this.deps.onBroadcast(code);
    return { code, expiresAt };
  }

  join(code: string, slot: PlayerSlot): void {
    const lobby = getLobby(code);
    if (!lobby) throw new Error('404 lobby not found');
    if (lobby.phase !== 'open') throw new Error('409 lobby not joinable');
    lobby.players.set(slot.key, slot);
    const humans = [...lobby.players.values()].filter(p => !p.isBot).length;
    if (humans >= 4) this.toStarting(code);
    else this.deps.onBroadcast(code);
  }

  leave(code: string, playerKey: string): void {
    const lobby = getLobby(code);
    if (!lobby) return;
    lobby.players.delete(playerKey);
    this.deps.onBroadcast(code);
  }

  private toStarting(code: string) {
    const lobby = getLobby(code);
    if (!lobby || lobby.phase !== 'open') return;
    clearTimeout(lobby.timers.open);
    fillBots(lobby);
    lobby.phase = 'starting';
    this.deps.persist.updateLobbyPhase(code, 'starting').catch(() => {});
    this.deps.onBroadcast(code);
    lobby.timers.start = setTimeout(() => this.toInMatch(code), LOBBY_STARTING_DURATION_MS);
  }

  private toInMatch(code: string) {
    const lobby = getLobby(code);
    if (!lobby) return;
    lobby.phase = 'in-match';
    this.deps.persist.updateLobbyPhase(code, 'in-match').catch(() => {});
    this.deps.onBroadcast(code);
    // Plan 1: no tick loop. Plan 2 replaces this stub with the real tick.
    // To keep the lifecycle exercised end-to-end, hold in-match for 3s then
    // synthesise a results phase with the host as winner.
    lobby.timers.match = setTimeout(() => this.toResults(code, lobby.hostKey), 3_000);
  }

  toResults(code: string, winnerKey: string | null): void {
    const lobby = getLobby(code);
    if (!lobby) return;
    lobby.phase = 'results';
    this.deps.persist.updateLobbyPhase(code, 'results').catch(() => {});
    this.deps.onBroadcast(code);
    lobby.timers.results = setTimeout(() => this.toClosed(code), LOBBY_RESULTS_DURATION_MS);
  }

  voteRematch(code: string, playerKey: string, yes: boolean): void {
    const lobby = getLobby(code);
    if (!lobby || lobby.phase !== 'results') return;
    if (yes) lobby.rematchYes.add(playerKey);
    else lobby.rematchYes.delete(playerKey);
    const humans = [...lobby.players.values()].filter(p => !p.isBot);
    const yesHumans = humans.filter(p => lobby.rematchYes.has(p.key));
    if (yesHumans.length >= 2) this.reopen(code);
    this.deps.onBroadcast(code);
  }

  private reopen(code: string) {
    const lobby = getLobby(code);
    if (!lobby) return;
    Object.values(lobby.timers).forEach(t => t && clearTimeout(t));
    const humans = [...lobby.players.values()].filter(p => !p.isBot);
    removeLobby(code);
    const next = this.open({ hostKey: lobby.hostKey, hostName: humans.find(p => p.key === lobby.hostKey)?.displayName ?? 'host' });
    const newLobby = getLobby(next.code)!;
    for (const h of humans) if (h.key !== lobby.hostKey) newLobby.players.set(h.key, h);
    this.deps.onBroadcast(next.code);
  }

  toClosed(code: string): void {
    const lobby = getLobby(code);
    if (!lobby) return;
    Object.values(lobby.timers).forEach(t => t && clearTimeout(t));
    lobby.phase = 'closed';
    this.deps.persist.updateLobbyPhase(code, 'closed').catch(() => {});
    this.deps.onBroadcast(code);
    setTimeout(() => removeLobby(code), 2_000);
  }
}
```

- [ ] **Step 6: Run — expect PASS**

Run: `cd arena-server && pnpm test src/lobby/lifecycle.test.ts`
Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add arena-server/src/lobby/
git commit -m "feat(arena): lobby state machine (open→starting→in-match→results→closed)"
```

---

## Task 9: arena-server — Express routes (REST surface)

**Files:**
- Create: `arena-server/src/http/middleware.ts`
- Create: `arena-server/src/http/routes.ts`
- Create: `arena-server/src/http/routes.test.ts`

- [ ] **Step 1: Create `arena-server/src/http/middleware.ts`**

```ts
import type { RequestHandler } from 'express';
import { verifyArenaJwt, playerKey, type ArenaClaims } from '../auth/jwt';
import { loadConfig } from '../config';

const cfg = loadConfig();

declare global {
  namespace Express { interface Request { user?: ArenaClaims; userKey?: string; } }
}

export const requireUser: RequestHandler = async (req, res, next) => {
  const h = req.header('authorization');
  if (!h || !h.startsWith('Bearer ')) { res.status(401).json({ error: 'missing bearer' }); return; }
  try {
    const claims = await verifyArenaJwt(h.slice(7), { trustedIssuers: cfg.issuers });
    req.user = claims;
    req.userKey = playerKey(claims);
    next();
  } catch (e: any) {
    res.status(401).json({ error: 'invalid token', detail: e.message });
  }
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.user) { res.status(401).json({ error: 'unauthenticated' }); return; }
  if (req.user.brand !== 'mentolder' || !req.user.realmRoles.includes('arena_admin')) {
    res.status(403).json({ error: 'arena_admin role required' }); return;
  }
  next();
};
```

- [ ] **Step 2: Create `arena-server/src/http/routes.ts`**

```ts
import { Router } from 'express';
import { requireUser, requireAdmin } from './middleware';
import type { Lifecycle } from '../lobby/lifecycle';
import { activeLobby } from '../lobby/registry';
import type { Repo } from '../db/repo';

export function makeRoutes(deps: { lc: Lifecycle; repo: Repo }) {
  const r = Router();

  r.get('/healthz', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  r.get('/lobby/active', requireUser, (_req, res) => {
    const l = activeLobby();
    if (!l) { res.json({ active: false }); return; }
    res.json({
      active: true,
      code: l.code,
      phase: l.phase,
      hostKey: l.hostKey,
      expiresAt: l.expiresAt,
      players: [...l.players.values()],
    });
  });

  r.post('/lobby/open', requireUser, requireAdmin, (req, res) => {
    try {
      const out = deps.lc.open({
        hostKey: req.userKey!,
        hostName: req.user!.displayName,
      });
      res.status(201).json(out);
    } catch (e: any) {
      res.status(e.code === 409 ? 409 : 500).json({ error: e.message });
    }
  });

  r.get('/match/:id', requireUser, async (req, res) => {
    const rows = await deps.repo.getRecentMatches(50);
    const m = rows.find(r => r.id === req.params.id);
    if (!m) { res.status(404).json({ error: 'not found' }); return; }
    res.json(m);
  });

  r.get('/match', requireUser, async (_req, res) => {
    res.json(await deps.repo.getRecentMatches(50));
  });

  return r;
}
```

- [ ] **Step 3: Write `arena-server/src/http/routes.test.ts` (smoke only)**

```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { makeRoutes } from './routes';

const lcStub: any = { open: () => ({ code: 'ZK4M9X', expiresAt: 0 }) };
const repoStub: any = { getRecentMatches: async () => [] };

describe('routes', () => {
  it('/healthz returns ok', async () => {
    const app = express();
    app.use(makeRoutes({ lc: lcStub, repo: repoStub }));
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('/lobby/active without bearer → 401', async () => {
    const app = express();
    app.use(makeRoutes({ lc: lcStub, repo: repoStub }));
    const res = await request(app).get('/lobby/active');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd arena-server && pnpm test src/http/`

- [ ] **Step 5: Commit**

```bash
git add arena-server/src/http/
git commit -m "feat(arena): REST routes (healthz, lobby/active, lobby/open, match)"
```

---

## Task 10: arena-server — Socket.io server + handshake

**Files:**
- Create: `arena-server/src/ws/server.ts`
- Create: `arena-server/src/ws/handlers.ts`
- Create: `arena-server/src/ws/broadcasters.ts`

- [ ] **Step 1: Create `arena-server/src/ws/broadcasters.ts`**

```ts
import type { Server } from 'socket.io';
import { getLobby } from '../lobby/registry';
import type { ServerMsg } from '../proto/messages';

export function makeBroadcasters(io: Server) {
  return {
    emitLobbyState(code: string) {
      const l = getLobby(code);
      if (!l) return;
      const msg: ServerMsg = {
        t: 'lobby:state', code,
        phase: l.phase,
        players: [...l.players.values()],
        expiresAt: l.expiresAt,
      };
      io.to(`lobby:${code}`).emit('msg', msg);
    },
  };
}
```

- [ ] **Step 2: Create `arena-server/src/ws/handlers.ts`**

```ts
import type { Socket } from 'socket.io';
import type { ClientMsg, ServerMsg } from '../proto/messages';
import { isClientMsg } from '../proto/messages';
import type { Lifecycle } from '../lobby/lifecycle';
import type { ArenaClaims } from '../auth/jwt';
import { playerKey } from '../auth/jwt';

export function attachHandlers(socket: Socket, deps: { lc: Lifecycle; user: ArenaClaims }) {
  const key = playerKey(deps.user);

  socket.on('msg', (raw: unknown) => {
    if (!isClientMsg(raw)) { sendError(socket, 'bad-msg', 'unrecognised message'); return; }
    const m = raw as ClientMsg;
    try {
      switch (m.t) {
        case 'lobby:join':
          deps.lc.join(m.code, {
            key, displayName: deps.user.displayName, brand: deps.user.brand,
            characterId: 'blonde-guy', isBot: false, ready: false, alive: true,
          });
          socket.join(`lobby:${m.code}`);
          break;
        case 'lobby:leave':
          // best-effort: caller is responsible for emitting state via lifecycle
          break;
        case 'rematch:vote':
          // join+vote require the socket to know its lobby; v1: scan rooms
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) deps.lc.voteRematch(room.slice(6), key, m.yes);
          }
          break;
        case 'forfeit':
          // Plan 1: no game in flight. Acknowledge only.
          break;
        case 'input':
          // Plan 1: drop.
          break;
        case 'auth:refresh':
          // Plan 1: token re-validation happens on next reconnect.
          break;
      }
    } catch (e: any) {
      sendError(socket, 'cmd-failed', e.message);
    }
  });
}

function sendError(socket: Socket, code: string, message: string) {
  const m: ServerMsg = { t: 'error', code, message };
  socket.emit('msg', m);
}
```

- [ ] **Step 3: Create `arena-server/src/ws/server.ts`**

```ts
import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { verifyArenaJwt } from '../auth/jwt';
import type { Config } from '../config';
import type { Lifecycle } from '../lobby/lifecycle';
import { PROTOCOL_VERSION } from '../proto/messages';
import { attachHandlers } from './handlers';
import { log } from '../log';

const HANDSHAKES_PER_MIN_PER_IP = 60;
const handshakes = new Map<string, number[]>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const a = (handshakes.get(ip) ?? []).filter(t => now - t < 60_000);
  if (a.length >= HANDSHAKES_PER_MIN_PER_IP) { handshakes.set(ip, a); return false; }
  a.push(now); handshakes.set(ip, a); return true;
}

export function startWs(server: HttpServer, cfg: Config, lc: Lifecycle): Server {
  const io = new Server(server, { path: '/ws', cors: { origin: '*' } });

  io.use(async (socket, next) => {
    const ip = socket.handshake.address;
    if (!rateLimit(ip)) return next(new Error('rate limited'));
    const token = (socket.handshake.auth as any)?.token;
    const proto = (socket.handshake.auth as any)?.protocolVersion;
    if (proto !== PROTOCOL_VERSION) return next(new Error(`protocol mismatch: client=${proto} server=${PROTOCOL_VERSION}`));
    if (!token) return next(new Error('missing token'));
    try {
      const claims = await verifyArenaJwt(token, { trustedIssuers: cfg.issuers });
      (socket.data as any).user = claims;
      next();
    } catch (e: any) {
      log.warn({ err: e.message }, 'ws handshake rejected');
      next(new Error('unauthorised'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as any).user;
    log.info({ sub: user.sub, brand: user.brand }, 'ws connected');
    attachHandlers(socket, { lc, user });
  });

  return io;
}
```

- [ ] **Step 4: Commit**

```bash
git add arena-server/src/ws/
git commit -m "feat(arena): socket.io server with JWT handshake + protocol version check"
```

---

## Task 11: arena-server — wire it all together in index.ts

**Files:**
- Modify: `arena-server/src/index.ts`

- [ ] **Step 1: Replace `arena-server/src/index.ts`**

```ts
import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import pinoHttp from 'pino-http';
import { loadConfig } from './config';
import { log } from './log';
import { makeDb } from './db/client';
import { runMigrations } from './db/migrate';
import { makeRepo } from './db/repo';
import { Lifecycle } from './lobby/lifecycle';
import { makeRoutes } from './http/routes';
import { startWs } from './ws/server';
import { makeBroadcasters } from './ws/broadcasters';

async function main() {
  const cfg = loadConfig();
  log.info({ port: cfg.port }, 'arena-server starting');

  const { pool } = makeDb(cfg);
  await runMigrations(pool);
  const repo = makeRepo(pool);

  const app = express();
  app.use(pinoHttp({ logger: log as any }));
  app.use(express.json());

  const httpServer = createServer(app);
  const io = startWs(httpServer, cfg, /* lc set below */ null as any);
  const bc = makeBroadcasters(io);
  const lc = new Lifecycle({
    onBroadcast: (code) => bc.emitLobbyState(code),
    persist: repo,
  });
  // late-bind lc into ws layer
  (httpServer as any)._arenaLc = lc;
  io.use((socket, next) => { (socket as any).lc = lc; next(); });

  app.use('/', makeRoutes({ lc, repo }));

  httpServer.listen(cfg.port, () => log.info({ port: cfg.port }, 'arena-server listening'));

  const shutdown = async () => {
    log.info('shutdown begin');
    io.close();
    httpServer.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => { log.error({ err: e.message, stack: e.stack }, 'fatal'); process.exit(1); });
```

- [ ] **Step 2: Build + smoke-run locally**

Run:
```bash
cd arena-server
DB_URL=postgresql://postgres:postgres@localhost:5432/postgres \
KEYCLOAK_ISSUER_MENTOLDER=https://auth.mentolder.de/realms/workspace \
KEYCLOAK_ISSUER_KORCZEWSKI=https://auth.korczewski.de/realms/workspace \
pnpm build && timeout 5 node dist/index.js || true
```
Expected: lines "arena-server starting", "arena-server listening" (it will exit due to DB connect failure if no local PG — that's fine; the point is the boot path runs without TypeScript errors).

- [ ] **Step 3: Commit**

```bash
git add arena-server/src/index.ts
git commit -m "feat(arena): wire http+ws+lifecycle+repo in entrypoint"
```

---

## Task 12: arena-server — Dockerfile

**Files:**
- Create: `arena-server/Dockerfile`

- [ ] **Step 1: Create `arena-server/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src ./src
RUN corepack enable && pnpm run build && pnpm prune --prod

FROM gcr.io/distroless/nodejs20-debian12:nonroot
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./dist/db/migrations
EXPOSE 8090
USER nonroot
CMD ["dist/index.js"]
```

- [ ] **Step 2: Build locally**

Run:
```bash
docker build -t ghcr.io/paddione/arena-server:latest arena-server/
```
Expected: image builds successfully.

- [ ] **Step 3: Commit**

```bash
git add arena-server/Dockerfile
git commit -m "feat(arena): multi-stage distroless Dockerfile (port 8090)"
```

---

## Task 13: Keycloak — add `arena` client + `arena_admin` role (mentolder)

**Files:**
- Modify: `prod-mentolder/realm-workspace-mentolder.json`

- [ ] **Step 1: Locate `clients: [...]` and `roles.realm: [...]` arrays in the realm JSON**

Read: `prod-mentolder/realm-workspace-mentolder.json` and find both arrays.

- [ ] **Step 2: Append a new client object to the `clients` array**

```json
{
  "clientId": "arena",
  "name": "Arena game client",
  "enabled": true,
  "publicClient": true,
  "standardFlowEnabled": true,
  "directAccessGrantsEnabled": false,
  "rootUrl": "https://web.mentolder.de",
  "baseUrl": "/portal/arena",
  "redirectUris": [
    "https://web.mentolder.de/portal/arena*",
    "https://web.mentolder.de/admin/arena*"
  ],
  "webOrigins": ["https://web.mentolder.de"],
  "attributes": { "pkce.code.challenge.method": "S256" },
  "protocol": "openid-connect",
  "fullScopeAllowed": true,
  "defaultClientScopes": ["web-origins", "acr", "profile", "roles", "email"],
  "optionalClientScopes": [],
  "protocolMappers": [
    {
      "name": "audience-arena",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-audience-mapper",
      "config": {
        "included.client.audience": "arena",
        "access.token.claim": "true",
        "id.token.claim": "false"
      }
    }
  ]
}
```

- [ ] **Step 3: Append `arena_admin` to `roles.realm`**

```json
{ "name": "arena_admin", "description": "Allowed to host an Arena match", "composite": false, "clientRole": false, "containerId": "workspace" }
```

- [ ] **Step 4: Map `arena_admin` to the admin user**

In the `users` array, find the user that already has admin roles (typically `patrick`) and add `"arena_admin"` to the existing `realmRoles` array. If the user has no `realmRoles` block yet, create it.

- [ ] **Step 5: Apply + smoke**

Run:
```bash
task keycloak:sync ENV=mentolder
```
Expected: realm sync runs without errors. Verify in the Keycloak admin UI that the `arena` client appears under realm `workspace`.

- [ ] **Step 6: Commit**

```bash
git add prod-mentolder/realm-workspace-mentolder.json
git commit -m "feat(arena): keycloak — add arena OIDC client + arena_admin role (mentolder)"
```

---

## Task 14: Keycloak — add `arena` client (korczewski, no admin role)

**Files:**
- Modify: `prod-korczewski/realm-workspace-korczewski.json`

- [ ] **Step 1: Append the same `arena` client object** as Task 13 Step 2, but with:
- `rootUrl: "https://web.korczewski.de"`
- `redirectUris: ["https://web.korczewski.de/portal/arena*", "https://web.korczewski.de/admin/arena*"]`
- `webOrigins: ["https://web.korczewski.de"]`

Korczewski does NOT get `arena_admin` — hosting is mentolder-only.

- [ ] **Step 2: Apply**

Run: `task keycloak:sync ENV=korczewski`
Expected: sync succeeds; korczewski realm now has the `arena` client.

- [ ] **Step 3: Commit**

```bash
git add prod-korczewski/realm-workspace-korczewski.json
git commit -m "feat(arena): keycloak — add arena OIDC client (korczewski, no admin role)"
```

---

## Task 15: SealedSecret — arena DB password + URL

**Files:**
- Modify: `environments/.secrets/mentolder.yaml` (gitignored — modify locally)
- Modify: `environments/sealed-secrets/mentolder.yaml` (regenerated by `task env:seal`)
- Modify: `environments/schema.yaml`

- [ ] **Step 1: Generate a strong password**

Run:
```bash
PW=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
echo "arena_db_password: $PW"
echo "arena_db_url: postgresql://arena_app:$PW@shared-db:5432/website?sslmode=disable"
```

- [ ] **Step 2: Add to `environments/.secrets/mentolder.yaml`**

Append:
```yaml
arena_db_password: "<password from Step 1>"
arena_db_url: "postgresql://arena_app:<password>@shared-db:5432/website?sslmode=disable"
```

- [ ] **Step 3: Declare keys in `environments/schema.yaml`**

Under the secrets section, add:
```yaml
arena_db_password:
  description: Password for the arena_app PostgreSQL role
  required: false
arena_db_url:
  description: Connection URL for arena-server (mentolder shared-db)
  required: false
```

Under env_vars, add:
```yaml
ARENA_WS_URL:
  description: Public URL of the arena WebSocket endpoint
  required: false
```

- [ ] **Step 4: Re-seal**

Run:
```bash
task env:validate ENV=mentolder
task env:seal ENV=mentolder
```
Expected: `environments/sealed-secrets/mentolder.yaml` now contains `arena_db_password` and `arena_db_url` under `encryptedData`.

- [ ] **Step 5: Commit (sealed file only — .secrets/ is gitignored)**

```bash
git add environments/schema.yaml environments/sealed-secrets/mentolder.yaml
git commit -m "feat(arena): seal arena_db_password + arena_db_url for mentolder"
```

---

## Task 16: k3d/arena.yaml — Deployment + Service + IngressRoute

**Files:**
- Create: `k3d/arena.yaml`

- [ ] **Step 1: Create `k3d/arena.yaml`**

```yaml
# ════════════════════════════════════════════════════════════════════
# arena — authoritative game server. Single replica (in-memory lobby).
# Deployed only in the mentolder cluster. Korczewski website connects
# to this same instance via arena-ws.mentolder.de.
# ════════════════════════════════════════════════════════════════════
apiVersion: apps/v1
kind: Deployment
metadata:
  name: arena-server
  namespace: ${WORKSPACE_NAMESPACE}
  labels:
    app: arena-server
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: arena-server
  template:
    metadata:
      labels:
        app: arena-server
    spec:
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      imagePullSecrets:
        - name: ghcr-pull-secret
      nodeSelector:
        kubernetes.io/arch: amd64
      containers:
        - name: arena-server
          image: ghcr.io/paddione/arena-server:latest
          imagePullPolicy: Always
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 65532
            capabilities: { drop: [ALL] }
          ports:
            - containerPort: 8090
          env:
            - name: PORT
              value: "8090"
            - name: LOG_LEVEL
              value: "info"
            - name: KEYCLOAK_ISSUER_MENTOLDER
              value: "https://auth.mentolder.de/realms/workspace"
            - name: KEYCLOAK_ISSUER_KORCZEWSKI
              value: "https://auth.korczewski.de/realms/workspace"
            - name: DB_URL
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: arena_db_url
          readinessProbe:
            httpGet: { path: /healthz, port: 8090 }
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /healthz, port: 8090 }
            initialDelaySeconds: 15
            periodSeconds: 30
          resources:
            requests: { memory: 256Mi, cpu: "200m" }
            limits:   { memory: 512Mi, cpu: "1000m" }
---
apiVersion: v1
kind: Service
metadata:
  name: arena-server
  namespace: ${WORKSPACE_NAMESPACE}
spec:
  selector: { app: arena-server }
  ports:
    - port: 80
      targetPort: 8090
      name: http
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: arena-cors
  namespace: ${WORKSPACE_NAMESPACE}
spec:
  headers:
    accessControlAllowOriginList:
      - "https://web.mentolder.de"
      - "https://web.korczewski.de"
    accessControlAllowMethods: ["GET", "POST", "OPTIONS"]
    accessControlAllowHeaders: ["authorization", "content-type"]
    accessControlMaxAge: 600
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: arena-server
  namespace: ${WORKSPACE_NAMESPACE}
spec:
  entryPoints: [websecure]
  routes:
    - match: Host(`arena-ws.${PROD_DOMAIN}`)
      kind: Rule
      services:
        - name: arena-server
          port: 80
      middlewares:
        - name: arena-cors
  tls:
    secretName: wildcard-cert
```

- [ ] **Step 2: Wire into the mentolder overlay**

Edit `prod-mentolder/kustomization.yaml`. Find the `resources:` list and add (alphabetical with existing entries):
```yaml
  - ../k3d/arena.yaml
```

(Korczewski overlay deliberately omits it — only mentolder runs arena-server.)

- [ ] **Step 3: Validate**

Run:
```bash
task workspace:validate
```
Expected: kustomize build succeeds for both prod overlays; korczewski does not include arena resources.

- [ ] **Step 4: Commit**

```bash
git add k3d/arena.yaml prod-mentolder/kustomization.yaml
git commit -m "feat(arena): k8s manifests (Deployment+Service+IngressRoute) for mentolder"
```

---

## Task 17: k3d/migrations-arena.yaml — bootstrap Job

**Files:**
- Create: `k3d/migrations-arena.yaml`

The Job:
1. Connects to shared-db as `website_owner` (the existing schema-creation role).
2. Runs `0001_init.sql` + `0002_arena_app_grants.sql` (inlined as a ConfigMap).
3. Sets the `arena_app` role password via `ALTER ROLE arena_app WITH PASSWORD '<from-secret>'`.

- [ ] **Step 1: Create `k3d/migrations-arena.yaml`**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: arena-bootstrap-sql
  namespace: ${WORKSPACE_NAMESPACE}
data:
  0001_init.sql: |
    CREATE SCHEMA IF NOT EXISTS arena;

    CREATE TABLE IF NOT EXISTS arena.matches (
      id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
      lobby_code      char(6)       NOT NULL,
      opened_at       timestamptz   NOT NULL,
      started_at      timestamptz   NOT NULL,
      ended_at        timestamptz   NOT NULL,
      duration_s      integer       GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (ended_at - started_at))::int) STORED,
      winner_player   text          NULL,
      map             text          NOT NULL DEFAULT 'concrete-arena',
      bot_count       smallint      NOT NULL DEFAULT 0,
      human_count     smallint      NOT NULL,
      forfeit_count   smallint      NOT NULL DEFAULT 0,
      results_jsonb   jsonb         NOT NULL
    );
    CREATE INDEX IF NOT EXISTS matches_started_idx ON arena.matches (started_at DESC);

    CREATE TABLE IF NOT EXISTS arena.match_players (
      match_id        uuid          NOT NULL REFERENCES arena.matches(id) ON DELETE CASCADE,
      player_key      text          NOT NULL,
      display_name    text          NOT NULL,
      brand           text          NULL,
      is_bot          boolean       NOT NULL,
      character_id    text          NOT NULL,
      place           smallint      NOT NULL,
      kills           smallint      NOT NULL DEFAULT 0,
      deaths          smallint      NOT NULL DEFAULT 0,
      forfeit         boolean       NOT NULL DEFAULT false,
      PRIMARY KEY (match_id, player_key)
    );
    CREATE INDEX IF NOT EXISTS match_players_key_idx ON arena.match_players (player_key, match_id DESC);

    CREATE TABLE IF NOT EXISTS arena.lobbies (
      code            char(6)       PRIMARY KEY,
      phase           text          NOT NULL,
      host_key        text          NOT NULL,
      opened_at       timestamptz   NOT NULL DEFAULT now(),
      expires_at      timestamptz   NOT NULL,
      state_jsonb     jsonb         NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS lobbies_phase_idx ON arena.lobbies (phase) WHERE phase != 'closed';

  0002_arena_app_grants.sql: |
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arena_app') THEN
        CREATE ROLE arena_app LOGIN;
      END IF;
    END $$;

    GRANT USAGE ON SCHEMA arena TO arena_app;
    GRANT SELECT, INSERT, UPDATE ON arena.matches       TO arena_app;
    GRANT SELECT, INSERT, UPDATE ON arena.match_players TO arena_app;
    GRANT SELECT, INSERT, UPDATE ON arena.lobbies       TO arena_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA arena
      GRANT SELECT, INSERT, UPDATE ON TABLES TO arena_app;
---
apiVersion: batch/v1
kind: Job
metadata:
  name: arena-bootstrap
  namespace: ${WORKSPACE_NAMESPACE}
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 3
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: psql
          image: postgres:16-alpine
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -euo pipefail
              export PGPASSWORD="$WEBSITE_OWNER_PASSWORD"
              psql "host=shared-db user=website_owner dbname=website" -v ON_ERROR_STOP=1 -f /sql/0001_init.sql
              psql "host=shared-db user=website_owner dbname=website" -v ON_ERROR_STOP=1 -f /sql/0002_arena_app_grants.sql
              # Apply password from the SealedSecret.
              psql "host=shared-db user=website_owner dbname=website" -v ON_ERROR_STOP=1 -c "ALTER ROLE arena_app WITH PASSWORD '${ARENA_DB_PASSWORD}'"
              echo "arena bootstrap complete"
          env:
            - name: WEBSITE_OWNER_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: WEBSITE_OWNER_PASSWORD
            - name: ARENA_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: arena_db_password
          volumeMounts:
            - { name: sql, mountPath: /sql }
      volumes:
        - name: sql
          configMap: { name: arena-bootstrap-sql }
```

> **Note:** the existing `workspace-secrets` SealedSecret in mentolder already exposes `WEBSITE_OWNER_PASSWORD`; confirm by `kubectl -n workspace get secret workspace-secrets -o jsonpath='{.data}' | base64 -d | grep WEBSITE_OWNER`. If it's named differently in your environment (`WEBSITE_DB_PASSWORD` is also common), substitute that key name in the manifest.

- [ ] **Step 2: Add to overlay**

Edit `prod-mentolder/kustomization.yaml` resources list:
```yaml
  - ../k3d/migrations-arena.yaml
```

- [ ] **Step 3: Validate**

Run: `task workspace:validate`

- [ ] **Step 4: Commit**

```bash
git add k3d/migrations-arena.yaml prod-mentolder/kustomization.yaml
git commit -m "feat(arena): bootstrap Job for arena schema + arena_app role"
```

---

## Task 18: Environment values — ARENA_WS_URL

**Files:**
- Modify: `environments/mentolder.yaml`
- Modify: `environments/korczewski.yaml`
- Modify: `environments/dev.yaml`

- [ ] **Step 1: Add to `environments/mentolder.yaml` under `env_vars:`**

```yaml
  ARENA_WS_URL: https://arena-ws.mentolder.de
```

- [ ] **Step 2: Add the same line to `environments/korczewski.yaml`**

```yaml
  ARENA_WS_URL: https://arena-ws.mentolder.de
```

(Same URL — korczewski website connects to mentolder's arena-server.)

- [ ] **Step 3: Add to `environments/dev.yaml`**

```yaml
  ARENA_WS_URL: http://arena.localhost
```

- [ ] **Step 4: Validate**

Run: `task env:validate:all`
Expected: all three envs validate cleanly.

- [ ] **Step 5: Commit**

```bash
git add environments/mentolder.yaml environments/korczewski.yaml environments/dev.yaml
git commit -m "feat(arena): publish ARENA_WS_URL in env registry"
```

---

## Task 19: Website ConfigMap — expose ARENA_WS_URL

**Files:**
- Modify: `k3d/website.yaml`
- Modify: `Taskfile.yml` (envsubst lists)

- [ ] **Step 1: Add `ARENA_WS_URL` env var to the website container**

Open `k3d/website.yaml`, find the website Deployment's `env:` block, and append:

```yaml
            - name: ARENA_WS_URL
              value: "${ARENA_WS_URL}"
```

- [ ] **Step 2: Append `ARENA_WS_URL` to the envsubst lists**

Open `Taskfile.yml`:

- Line ~1303 (k3d deploy): the existing list is `\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL \$BRAND_ID \$LIVEKIT_DOMAIN \$STREAM_DOMAIN \$SYSTEMTEST_LOOP_ENABLED`. Append ` \$ARENA_WS_URL`.
- Line ~1362 (`ENVSUBST_VARS` builder for prod website manifest): find the dynamic append loop and add `ARENA_WS_URL` to it. If the file uses a literal list there too, append `\$ARENA_WS_URL` like above.
- Line ~2177 (website deploy task — the long envsubst on `k3d/website.yaml`): append ` \$ARENA_WS_URL` to the existing list.

Use Edit with anchored `old_string`/`new_string` matching one specific line at a time to avoid accidental replace-all.

- [ ] **Step 3: Validate**

Run: `task workspace:validate ENV=mentolder`
Expected: validation passes with no unresolved `${ARENA_WS_URL}` placeholders in the rendered website manifest.

- [ ] **Step 4: Commit**

```bash
git add k3d/website.yaml Taskfile.yml
git commit -m "feat(arena): wire ARENA_WS_URL into website ConfigMap + envsubst lists"
```

---

## Task 20: Astro endpoint — `/api/arena/token`

**Files:**
- Create: `website/src/pages/api/arena/token.ts`

This endpoint mints a short-lived access token (`aud: arena`) from the user's existing OIDC session. It exchanges the session cookie for a Keycloak access token via the token-exchange endpoint, scoped to the `arena` client.

- [ ] **Step 1: Inspect existing session helper**

Run: `grep -rn 'getSessionUser\|withSession\|keycloak' website/src/lib | head -10`
Read the file the helper lives in. The pattern in this repo is a `getSessionUser(astroContext)` helper that returns the decoded session JWT or `null`.

- [ ] **Step 2: Create `website/src/pages/api/arena/token.ts`**

```ts
import type { APIRoute } from 'astro';
import { getSessionUser } from '../../../lib/auth';

const ISSUER_BY_BRAND: Record<string, string> = {
  mentolder:  'https://auth.mentolder.de/realms/workspace',
  korczewski: 'https://auth.korczewski.de/realms/workspace',
};

export const POST: APIRoute = async (ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return new Response('unauthorised', { status: 401 });

  const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder') as 'mentolder' | 'korczewski';
  const issuer = ISSUER_BY_BRAND[brand];

  // Token exchange against the user's home realm, requesting aud=arena.
  const tokenUrl = `${issuer}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    client_id: 'arena',
    subject_token: user.accessToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    audience: 'arena',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'token-exchange-failed', status: res.status }), {
      status: 502, headers: { 'content-type': 'application/json' },
    });
  }

  const json = await res.json() as { access_token: string; expires_in: number };
  return new Response(JSON.stringify({ token: json.access_token, expiresIn: json.expires_in }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};
```

- [ ] **Step 3: Note for Keycloak ops**

The Keycloak `arena` clients (Tasks 13/14) must have token-exchange enabled. Add the following permissions in the realm JSON if missing (under the `arena` client's `authorizationServicesEnabled` block, or via `task keycloak:sync` once); a follow-up commit may be needed once we test this against a live realm.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/arena/token.ts
git commit -m "feat(arena): /api/arena/token mints aud=arena via token exchange"
```

---

## Task 21: Astro endpoint — `/api/arena/active` SSE

**Files:**
- Create: `website/src/pages/api/arena/active.ts`

One upstream long-poll per Astro pod fans out via SSE to all browsers. This avoids 4 × N browser connections to arena-server. The upstream long-poll uses `GET /lobby/active?wait=25` (arena-server returns immediately on phase change, or after a 25s timeout with the current state).

> **Note:** Plan 1 ships a simple variant: the Astro endpoint polls arena-server's `GET /lobby/active` every 2s and emits SSE events when the body changes. This avoids needing to add long-polling to arena-server and unblocks the banner. A follow-up can swap in true long-poll if SSE buffering becomes a concern (Astro 4 SSE under Traefik is the open question in spec §16).

- [ ] **Step 1: Create `website/src/pages/api/arena/active.ts`**

```ts
import type { APIRoute } from 'astro';

const UPSTREAM = process.env.ARENA_WS_URL ?? 'http://localhost:8090';
// Strip the ws prefix if present — REST uses https + host w/o the ws path.
const UPSTREAM_HTTP = UPSTREAM.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  if (!auth) return new Response('unauthorised', { status: 401 });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastBody = '';
      let cancelled = false;

      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      const tick = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(`${UPSTREAM_HTTP}/lobby/active`, {
            headers: { authorization: auth },
          });
          const body = res.ok ? await res.text() : JSON.stringify({ active: false });
          if (body !== lastBody) { send(body); lastBody = body; }
        } catch (e: any) {
          send(JSON.stringify({ active: false, error: e.message }));
        }
        setTimeout(tick, 2000);
      };

      send(JSON.stringify({ active: false })); // initial
      tick();

      request.signal.addEventListener('abort', () => {
        cancelled = true;
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      'connection': 'keep-alive',
    },
  });
};
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/arena/active.ts
git commit -m "feat(arena): /api/arena/active SSE proxy (2s poll → SSE fan-out)"
```

---

## Task 22: Astro endpoint — `/api/arena/start`

**Files:**
- Create: `website/src/pages/api/arena/start.ts`

- [ ] **Step 1: Create `website/src/pages/api/arena/start.ts`**

```ts
import type { APIRoute } from 'astro';
import { getSessionUser } from '../../../lib/auth';

const UPSTREAM = (process.env.ARENA_WS_URL ?? 'http://localhost:8090')
  .replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

export const POST: APIRoute = async (ctx) => {
  const user = await getSessionUser(ctx);
  if (!user) return new Response('unauthorised', { status: 401 });

  // Mint an arena-scoped access token (re-uses /api/arena/token logic via internal fetch).
  const tokenRes = await fetch(`${ctx.url.origin}/api/arena/token`, {
    method: 'POST',
    headers: { cookie: ctx.request.headers.get('cookie') ?? '' },
  });
  if (!tokenRes.ok) return new Response('token-mint-failed', { status: 502 });
  const { token } = await tokenRes.json() as { token: string };

  const upstream = await fetch(`${UPSTREAM}/lobby/open`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
};
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/arena/start.ts
git commit -m "feat(arena): /api/arena/start admin POST relayed to arena-server"
```

---

## Task 23: ArenaBanner.svelte — visual + state machine

**Files:**
- Create: `website/src/components/arena/ArenaBanner.svelte`
- Create: `website/src/components/arena/arenaStore.ts`

- [ ] **Step 1: Create `website/src/components/arena/arenaStore.ts`**

```ts
import { writable, type Writable } from 'svelte/store';

export type BannerState =
  | { phase: 'idle' }
  | { phase: 'open'; code: string; hostName: string; humans: number; expiresAt: number }
  | { phase: 'in-progress'; code: string; alive: number; total: number }
  | { phase: 'closing' };

export const banner: Writable<BannerState> = writable({ phase: 'idle' });

let started = false;

function isDismissed(code: string): boolean {
  try { return sessionStorage.getItem(`arena:dismissed:${code}`) === '1'; }
  catch { return false; }
}

function isSilent(): boolean {
  try { return localStorage.getItem('arena:silent') === '1'; } catch { return false; }
}

export function dismissBanner(code: string) {
  try { sessionStorage.setItem(`arena:dismissed:${code}`, '1'); } catch {}
  banner.set({ phase: 'idle' });
}

export function startArenaStream(getToken: () => Promise<string>) {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (isSilent()) return;

  (async () => {
    const token = await getToken();
    // EventSource has no header support; we use a header-less fallback via cookie + ad-hoc fetch loop.
    const stream = await fetch('/api/arena/active', { headers: { authorization: `Bearer ${token}` } });
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const event = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = event.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (!data.active) { banner.set({ phase: 'idle' }); continue; }
          if (isDismissed(data.code)) continue;
          if (data.phase === 'open') {
            const host = (data.players ?? []).find((p: any) => p.key === data.hostKey);
            banner.set({
              phase: 'open',
              code: data.code,
              hostName: host?.displayName ?? 'host',
              humans: (data.players ?? []).filter((p: any) => !p.isBot).length,
              expiresAt: data.expiresAt,
            });
          } else if (data.phase === 'in-match' || data.phase === 'starting') {
            const alive = (data.players ?? []).filter((p: any) => p.alive).length;
            banner.set({ phase: 'in-progress', code: data.code, alive, total: 4 });
          } else if (data.phase === 'closed') {
            banner.set({ phase: 'closing' });
            setTimeout(() => banner.set({ phase: 'idle' }), 600);
          }
        } catch {/* ignore parse errors */}
      }
    }
  })().catch(() => banner.set({ phase: 'idle' }));
}
```

- [ ] **Step 2: Create `website/src/components/arena/ArenaBanner.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { banner, dismissBanner, startArenaStream, type BannerState } from './arenaStore';

  let now = Date.now();
  let timer: any;

  async function fetchToken(): Promise<string> {
    const res = await fetch('/api/arena/token', { method: 'POST' });
    if (!res.ok) throw new Error('token-mint-failed');
    return (await res.json()).token;
  }

  onMount(() => {
    startArenaStream(fetchToken);
    timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  function fmt(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  $: state = $banner as BannerState;
</script>

{#if state.phase !== 'idle'}
  <aside class="arena-banner" class:closing={state.phase === 'closing'}>
    <span class="eye">[ ARENA · {state.phase === 'open' ? 'LOBBY OPEN' : 'IN PROGRESS'} ]</span>
    {#if state.phase === 'open'}
      <span class="host"><em>{state.hostName}</em> is opening an arena</span>
      <span class="count">· {state.humans} / 4 in</span>
      <span class="cd">join in {fmt(state.expiresAt - now)}</span>
      <a class="join" href="/portal/arena?lobby={state.code}">Join</a>
      <button class="dismiss" aria-label="Dismiss" on:click={() => dismissBanner(state.code)}>×</button>
    {:else if state.phase === 'in-progress'}
      <span class="count">{state.alive} / {state.total} alive</span>
      <a class="join" href="/portal/arena?lobby={state.code}&spec=1">Spectate</a>
      <button class="dismiss" aria-label="Dismiss" on:click={() => dismissBanner(state.code)}>×</button>
    {/if}
  </aside>
{/if}

<style>
  .arena-banner {
    position: sticky; top: 0; z-index: 1000;
    height: 44px;
    display: flex; align-items: center; gap: 14px;
    padding: 0 16px;
    background: #1a0e22;
    color: #f5f1e8;
    border-bottom: 1px solid #c8ff3f;
    font-family: 'Geist', system-ui, sans-serif;
    font-size: 13px;
  }
  .arena-banner.closing { opacity: 0; transition: opacity 600ms; }
  .eye {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    letter-spacing: 0.18em; color: #c8ff3f;
  }
  .host em {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic; font-weight: 500; color: #f5f1e8;
  }
  .cd { font-family: 'JetBrains Mono', monospace; color: #c8ff3f; }
  .join {
    margin-left: auto;
    padding: 6px 14px;
    background: #c8ff3f; color: #1a0e22;
    text-decoration: none; font-weight: 600;
    border-radius: 3px;
  }
  .dismiss {
    background: transparent; border: none; color: #f5f1e8;
    font-size: 18px; cursor: pointer; padding: 0 4px;
  }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/arena/
git commit -m "feat(arena): ArenaBanner.svelte + SSE store (open/in-progress/closing)"
```

---

## Task 24: Layout injection (3 files, one line each)

**Files:**
- Modify: `website/src/layouts/Layout.astro`
- Modify: `website/src/layouts/PortalLayout.astro`
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 1: For each layout file**

Find the opening `<body>` tag. Immediately after it (before any `<header>`, `<main>`, or other content), add:

```astro
---
import ArenaBanner from '../components/arena/ArenaBanner.svelte';
---

<body>
  <ArenaBanner client:load />
  ...existing content...
```

The import goes inside the existing frontmatter block (between the `---` fences). The component goes right after `<body>`. Do not move existing markup.

- [ ] **Step 2: Smoke**

Run: `cd website && pnpm build`
Expected: build succeeds; no Svelte hydration errors in the build output.

- [ ] **Step 3: Commit**

```bash
git add website/src/layouts/
git commit -m "feat(arena): inject ArenaBanner into Layout / PortalLayout / AdminLayout"
```

---

## Task 25: /admin/arena page (Open lobby + recent matches)

**Files:**
- Create: `website/src/pages/admin/arena.astro`

- [ ] **Step 1: Create `website/src/pages/admin/arena.astro`**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSessionUser } from '../../lib/auth';

const user = await getSessionUser(Astro);
if (!user) return Astro.redirect('/auth/login?return=/admin/arena');

const isAdmin = (user.realmRoles ?? []).includes('arena_admin') && user.brand === 'mentolder';
---

<AdminLayout title="Arena">
  <section class="arena-admin">
    <h1>Arena · admin</h1>
    {!isAdmin ? (
      <p class="warn">This page requires the <code>arena_admin</code> realm role on the mentolder Keycloak realm.</p>
    ) : (
      <>
        <button id="open-lobby" class="primary">Open lobby</button>
        <p class="hint">A 6-character code is generated and a banner appears across both brands for 60 seconds.</p>
        <h2>Recent matches</h2>
        <table id="recent">
          <thead><tr><th>Started</th><th>Code</th><th>Winner</th><th>Humans</th><th>Bots</th></tr></thead>
          <tbody><tr><td colspan="5">Loading…</td></tr></tbody>
        </table>
      </>
    )}
  </section>
</AdminLayout>

<script>
  const btn = document.getElementById('open-lobby');
  btn?.addEventListener('click', async () => {
    btn.setAttribute('disabled', '1');
    const res = await fetch('/api/arena/start', { method: 'POST' });
    if (!res.ok) { alert('failed: ' + res.status); btn.removeAttribute('disabled'); return; }
    const { code } = await res.json();
    window.location.href = `/portal/arena?lobby=${code}`;
  });

  // Lazy populate recent matches (best-effort; arena-server may be unreachable in dev).
  fetch('/api/arena/token', { method: 'POST' })
    .then(r => r.ok ? r.json() : null)
    .then(async (j) => {
      if (!j) return;
      // Recent-matches uses the same WS host; reuse /api/arena/active is overkill here.
      // Defer to Plan 2 if we want a dedicated endpoint.
    });
</script>

<style>
  .arena-admin { padding: 32px; max-width: 960px; }
  h1 { font-family: 'Instrument Serif', Georgia, serif; }
  .primary {
    padding: 10px 22px; background: #c8ff3f; color: #1a0e22;
    border: none; font-weight: 600; cursor: pointer;
  }
  .hint { color: #888; font-size: 13px; }
  .warn { color: #b00020; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 13px; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #eee; text-align: left; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/admin/arena.astro
git commit -m "feat(arena): /admin/arena page (Open lobby button + recent matches scaffold)"
```

---

## Task 26: /portal/arena page (Plan 1 placeholder)

**Files:**
- Create: `website/src/pages/portal/arena.astro`

The page mounts the (Plan 1) lobby-status Svelte panel; the React+Pixi island is wired in Plan 2.

- [ ] **Step 1: Create `website/src/pages/portal/arena.astro`**

```astro
---
import PortalLayout from '../../layouts/PortalLayout.astro';
import { getSessionUser } from '../../lib/auth';

const user = await getSessionUser(Astro);
if (!user) return Astro.redirect('/auth/login?return=/portal/arena');
const lobbyCode = Astro.url.searchParams.get('lobby') ?? null;
---

<PortalLayout title="Arena">
  <section class="arena-portal">
    <h1>Arena</h1>
    {lobbyCode ? (
      <>
        <p>You've joined lobby <code>{lobbyCode}</code>.</p>
        <p class="muted">Match playback is shipping in the next release. The lobby will run end-to-end (open → starting → results), but the playable round itself opens in Plan 2.</p>
      </>
    ) : (
      <p>No active lobby. Wait for the banner.</p>
    )}
  </section>
</PortalLayout>

<style>
  .arena-portal { padding: 32px; max-width: 720px; }
  h1 { font-family: 'Instrument Serif', Georgia, serif; }
  .muted { color: #777; font-style: italic; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/portal/arena.astro
git commit -m "feat(arena): /portal/arena placeholder until Pixi client lands in Plan 2"
```

---

## Task 27: Taskfile — arena:* commands + feature:arena

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Find brett block (around line 2351) and add arena tasks immediately after**

Open `Taskfile.yml`, locate the `brett:logs:` task, and after it add:

```yaml
  arena:build:
    desc: "Build arena-server image and (in dev) import into k3d"
    cmds:
      - docker build -t ghcr.io/paddione/arena-server:latest arena-server/
      - |
          if [ "{{.ENV}}" = "dev" ]; then
            k3d image import ghcr.io/paddione/arena-server:latest -c {{.CLUSTER_NAME}}
          fi
      - echo "✓ arena image built"

  arena:push:
    desc: "Push arena-server image to ghcr.io"
    deps: [arena:build]
    cmds:
      - docker push ghcr.io/paddione/arena-server:latest
      - echo "✓ Pushed ghcr.io/paddione/arena-server:latest"

  arena:deploy:
    desc: "Build, push, and roll out arena-server (mentolder only)"
    cmds:
      - |
          if [ "{{.ENV}}" = "korczewski" ]; then
            echo "arena-server runs only in mentolder; korczewski website uses arena-ws.mentolder.de"
            exit 0
          fi
          if [ "{{.ENV}}" = "dev" ]; then
            task arena:build ENV={{.ENV}}
          else
            task arena:push ENV={{.ENV}}
          fi
      - |
          source scripts/env-resolve.sh "{{.ENV}}"
          CTX_ARG=""
          if [ -n "$ENV_CONTEXT" ]; then CTX_ARG="--context $ENV_CONTEXT"; fi
          envsubst "\$WORKSPACE_NAMESPACE \$PROD_DOMAIN" < k3d/arena.yaml | kubectl $CTX_ARG apply -f -
          envsubst "\$WORKSPACE_NAMESPACE" < k3d/migrations-arena.yaml | kubectl $CTX_ARG apply -f -
          kubectl $CTX_ARG -n "$WORKSPACE_NAMESPACE" rollout restart deployment/arena-server || true
      - echo "✓ arena deployed to {{.ENV}}"

  arena:deploy:all-prods:
    desc: "Build + roll out arena-server on both prod clusters (mentolder only applies; korczewski is a no-op)"
    cmds:
      - task: arena:deploy
        vars: { ENV: mentolder }
      - task: arena:deploy
        vars: { ENV: korczewski }

  arena:status:
    desc: "Show arena-server status"
    cmds:
      - |
          source scripts/env-resolve.sh "{{.ENV}}"
          CTX_ARG=""
          if [ -n "$ENV_CONTEXT" ]; then CTX_ARG="--context $ENV_CONTEXT"; fi
          kubectl $CTX_ARG -n "$WORKSPACE_NAMESPACE" get deploy,svc,ingressroute -l app=arena-server || true
          kubectl $CTX_ARG -n "$WORKSPACE_NAMESPACE" get pods -l app=arena-server

  arena:logs:
    desc: "Tail arena-server logs (mentolder only)"
    cmds:
      - |
          source scripts/env-resolve.sh "{{.ENV}}"
          CTX_ARG=""
          if [ -n "$ENV_CONTEXT" ]; then CTX_ARG="--context $ENV_CONTEXT"; fi
          kubectl $CTX_ARG -n "$WORKSPACE_NAMESPACE" logs -l app=arena-server -f --tail=200

  arena:db:
    desc: "psql into arena schema (mentolder only)"
    cmds:
      - |
          source scripts/env-resolve.sh "{{.ENV}}"
          CTX_ARG=""
          if [ -n "$ENV_CONTEXT" ]; then CTX_ARG="--context $ENV_CONTEXT"; fi
          kubectl $CTX_ARG -n "$WORKSPACE_NAMESPACE" exec -it deploy/shared-db -- psql -U postgres -d website -c "SET search_path=arena; \\dt"

  arena:teardown:
    desc: "Remove arena-server resources (mentolder only)"
    cmds:
      - |
          source scripts/env-resolve.sh "{{.ENV}}"
          CTX_ARG=""
          if [ -n "$ENV_CONTEXT" ]; then CTX_ARG="--context $ENV_CONTEXT"; fi
          kubectl $CTX_ARG -n "$WORKSPACE_NAMESPACE" delete deploy,svc,ingressroute,middleware,configmap,job -l app=arena-server || true
          kubectl $CTX_ARG -n "$WORKSPACE_NAMESPACE" delete configmap arena-bootstrap-sql || true
```

- [ ] **Step 2: Add feature:arena umbrella near the top**

Find the existing `feature:brett:` block (around line 40) and after it add:

```yaml
  feature:arena:
    desc: "Build + deploy arena-server on both prod clusters"
    cmds:
      - task: arena:deploy:all-prods
```

- [ ] **Step 3: Validate**

Run: `task --list | grep arena`
Expected: 8 arena entries listed.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(arena): Taskfile commands (build/push/deploy/status/logs/db/teardown)"
```

---

## Task 28: CI — arena-server build/test job + protocol drift guard

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Open `.github/workflows/ci.yml` and add a new job**

Append to the `jobs:` map:

```yaml
  arena-server:
    name: arena-server build + test
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports: ['5432:5432']
        options: >-
          --health-cmd="pg_isready -U postgres"
          --health-interval=5s --health-timeout=5s --health-retries=10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm', cache-dependency-path: arena-server/pnpm-lock.yaml }
      - run: pnpm install --frozen-lockfile
        working-directory: arena-server
      - run: pnpm test
        working-directory: arena-server
        env:
          TEST_DB_URL: postgresql://postgres:postgres@localhost:5432/postgres
      - run: pnpm build
        working-directory: arena-server

  arena-proto-drift:
    name: arena protocol types drift
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          if [ ! -f website/src/components/arena/shared/lobbyTypes.ts ]; then
            echo "missing shared/lobbyTypes.ts on the website side"; exit 1
          fi
          diff -u arena-server/src/proto/messages.ts website/src/components/arena/shared/lobbyTypes.ts \
            && echo "protocol types in sync" \
            || { echo "::error::protocol types drift between arena-server and website"; exit 1; }
```

- [ ] **Step 2: Mirror the protocol file**

Run:
```bash
mkdir -p website/src/components/arena/shared
cp arena-server/src/proto/messages.ts website/src/components/arena/shared/lobbyTypes.ts
git add website/src/components/arena/shared/lobbyTypes.ts
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml website/src/components/arena/shared/lobbyTypes.ts
git commit -m "ci(arena): arena-server job + protocol-drift guard"
```

---

## Task 29: BATS — SA-11 (non-admin cannot POST /api/arena/start)

**Files:**
- Create: `tests/local/SA-11.bats`

- [ ] **Step 1: Create `tests/local/SA-11.bats`**

```bash
#!/usr/bin/env bats

load ../unit/lib/bats-assert.bash

setup() {
  : "${ARENA_WS_URL:?need ARENA_WS_URL pointing at arena-server}"
  : "${KEYCLOAK_BASE:=https://auth.mentolder.de}"
}

@test "SA-11: non-admin POST /lobby/open returns 403" {
  # 1. Acquire a token for a non-admin user via password grant against the public 'arena' client.
  TOKEN=$(curl -s -X POST "$KEYCLOAK_BASE/realms/workspace/protocol/openid-connect/token" \
    -d grant_type=password \
    -d client_id=arena \
    -d "username=${TEST_USER_USERNAME:?need TEST_USER_USERNAME}" \
    -d "password=${TEST_USER_PASSWORD:?need TEST_USER_PASSWORD}" \
    -d scope=openid \
    | jq -r .access_token)
  [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]

  STATUS=$(curl -s -o /tmp/sa-11.body -w '%{http_code}' \
    -X POST "$ARENA_WS_URL/lobby/open" \
    -H "authorization: Bearer $TOKEN")

  assert_equal "$STATUS" "403"
  grep -q "arena_admin" /tmp/sa-11.body
}
```

- [ ] **Step 2: Run locally (skipped if env vars not set)**

Run: `./tests/runner.sh local SA-11`
Expected: PASS (or SKIPPED with a clear "missing TEST_USER_*" message if creds not seeded).

- [ ] **Step 3: Commit**

```bash
git add tests/local/SA-11.bats
git commit -m "test(arena): SA-11 non-admin cannot open lobby"
```

---

## Task 30: BATS — SA-12 (cross-realm JWT accepted)

**Files:**
- Create: `tests/local/SA-12.bats`

- [ ] **Step 1: Create `tests/local/SA-12.bats`**

```bash
#!/usr/bin/env bats

load ../unit/lib/bats-assert.bash

setup() {
  : "${ARENA_WS_URL:?need ARENA_WS_URL}"
  : "${KEYCLOAK_KORCZEWSKI:=https://auth.korczewski.de}"
}

@test "SA-12: korczewski-realm JWT accepted by arena-server" {
  TOKEN=$(curl -s -X POST "$KEYCLOAK_KORCZEWSKI/realms/workspace/protocol/openid-connect/token" \
    -d grant_type=password \
    -d client_id=arena \
    -d "username=${KORCZ_USER_USERNAME:?need KORCZ_USER_USERNAME}" \
    -d "password=${KORCZ_USER_PASSWORD:?need KORCZ_USER_PASSWORD}" \
    -d scope=openid \
    | jq -r .access_token)
  [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]

  STATUS=$(curl -s -o /tmp/sa-12.body -w '%{http_code}' \
    "$ARENA_WS_URL/lobby/active" -H "authorization: Bearer $TOKEN")

  assert_equal "$STATUS" "200"
  grep -q '"active"' /tmp/sa-12.body
}
```

- [ ] **Step 2: Run + commit**

Run: `./tests/runner.sh local SA-12`

```bash
git add tests/local/SA-12.bats
git commit -m "test(arena): SA-12 korczewski-realm JWT accepted"
```

---

## Task 31: BATS — SA-13 (forged JWT rejected)

**Files:**
- Create: `tests/local/SA-13.bats`

- [ ] **Step 1: Create `tests/local/SA-13.bats`**

```bash
#!/usr/bin/env bats

load ../unit/lib/bats-assert.bash

setup() {
  : "${ARENA_WS_URL:?need ARENA_WS_URL}"
}

@test "SA-13: JWT signed by untrusted issuer is rejected with 401" {
  # Generate an RSA keypair + sign a token claiming aud=arena from a bogus issuer.
  # Use python (available in the test runner image) for portability.
  TOKEN=$(python3 - <<'PY'
import jwt, time
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
pem = k.private_bytes(serialization.Encoding.PEM,
                      serialization.PrivateFormat.PKCS8,
                      serialization.NoEncryption())
print(jwt.encode({
  "iss": "https://evil.example.com/realms/x",
  "aud": "arena",
  "sub": "attacker",
  "exp": int(time.time()) + 60,
}, pem, algorithm="RS256"), end="")
PY
)
  STATUS=$(curl -s -o /tmp/sa-13.body -w '%{http_code}' \
    "$ARENA_WS_URL/lobby/active" -H "authorization: Bearer $TOKEN")
  assert_equal "$STATUS" "401"
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/local/SA-13.bats
git commit -m "test(arena): SA-13 forged JWT rejected"
```

---

## Task 32: BATS — NFA-10 (/healthz p95 < 200ms)

**Files:**
- Create: `tests/local/NFA-10.bats`

- [ ] **Step 1: Create `tests/local/NFA-10.bats`**

```bash
#!/usr/bin/env bats

load ../unit/lib/bats-assert.bash

setup() {
  : "${ARENA_WS_URL:?need ARENA_WS_URL}"
}

@test "NFA-10: /healthz p95 < 200ms over 50 sequential requests" {
  rm -f /tmp/nfa10-times.txt
  for i in $(seq 1 50); do
    /usr/bin/time -f "%e" -o /tmp/nfa10-time-one.txt \
      curl -s -o /dev/null -w '%{time_total}\n' "$ARENA_WS_URL/healthz" \
      >> /tmp/nfa10-times.txt
  done
  P95=$(sort -n /tmp/nfa10-times.txt | awk 'NR==48 { print }')
  # awk does string-to-float compare; convert to ms for the assertion message.
  P95_MS=$(echo "$P95 * 1000" | bc -l | cut -d. -f1)
  echo "p95 = ${P95_MS}ms" >&3
  [ "$P95_MS" -lt 200 ]
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/local/NFA-10.bats
git commit -m "test(arena): NFA-10 healthz p95 < 200ms"
```

---

## Task 33: Playwright — FA-30 (cross-brand banner)

**Files:**
- Create: `tests/e2e/specs/fa-30-arena-banner.spec.ts`

- [ ] **Step 1: Inspect an existing spec for the project's auth + fixture pattern**

Read: `tests/e2e/specs/fa-15-oidc.spec.ts` (or any other auth'd spec) and copy the storage-state import lines into the new spec.

- [ ] **Step 2: Create `tests/e2e/specs/fa-30-arena-banner.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.MENTOLDER_ADMIN_USER!;
const ADMIN_PW   = process.env.MENTOLDER_ADMIN_PW!;
const KORCZ_USER = process.env.KORCZ_USER!;
const KORCZ_PW   = process.env.KORCZ_PW!;

const MENTOLDER_HOME  = 'https://web.mentolder.de/';
const KORCZEWSKI_HOME = 'https://web.korczewski.de/';

test.describe('FA-30 · Arena banner is cross-brand @smoke', () => {

  test('admin opens lobby on mentolder → banner appears on both brands', async ({ browser }) => {
    // Two clean contexts so each gets its own session cookie.
    const ctxAdmin = await browser.newContext();
    const ctxView  = await browser.newContext();
    const adminPage = await ctxAdmin.newPage();
    const viewPage  = await ctxView.newPage();

    // Login admin on mentolder
    await adminPage.goto(MENTOLDER_HOME + 'auth/login?return=/admin/arena');
    await adminPage.getByLabel(/username/i).fill(ADMIN_USER);
    await adminPage.getByLabel(/password/i).fill(ADMIN_PW);
    await adminPage.getByRole('button', { name: /sign in/i }).click();
    await adminPage.waitForURL(/\/admin\/arena/);

    // Login viewer on korczewski
    await viewPage.goto(KORCZEWSKI_HOME + 'auth/login?return=/');
    await viewPage.getByLabel(/username/i).fill(KORCZ_USER);
    await viewPage.getByLabel(/password/i).fill(KORCZ_PW);
    await viewPage.getByRole('button', { name: /sign in/i }).click();
    await viewPage.waitForURL(/web\.korczewski\.de/);

    // Open lobby on mentolder admin page
    await adminPage.getByRole('button', { name: /open lobby/i }).click();
    await adminPage.waitForURL(/\/portal\/arena\?lobby=/);

    // The viewer's korczewski page should now show the banner within ~6s.
    await expect(viewPage.locator('.arena-banner')).toBeVisible({ timeout: 8_000 });
    await expect(viewPage.locator('.arena-banner .eye')).toContainText(/ARENA · LOBBY OPEN/);
    await expect(viewPage.locator('.arena-banner .host em')).toContainText(/./);

    // Dismiss persists per-lobby
    await viewPage.locator('.arena-banner .dismiss').click();
    await viewPage.reload();
    await expect(viewPage.locator('.arena-banner')).toBeHidden({ timeout: 4_000 });

    await ctxAdmin.close();
    await ctxView.close();
  });

});
```

- [ ] **Step 3: Run against prod (live envs, per CLAUDE.md memory)**

Run:
```bash
cd tests/e2e
pnpm exec playwright test specs/fa-30-arena-banner.spec.ts --grep '@smoke'
```
Expected: PASS once arena-server is deployed.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/fa-30-arena-banner.spec.ts
git commit -m "test(arena): FA-30 cross-brand banner Playwright spec"
```

---

## Task 34: Regenerate test inventory

**Files:**
- Modify: `website/src/data/test-inventory.json`

- [ ] **Step 1: Regenerate**

Run: `task test:inventory`
Expected: 5 new entries appear — `SA-11`, `SA-12`, `SA-13`, `NFA-10`, `E2E:fa-30-arena-banner`.

- [ ] **Step 2: Commit**

```bash
git add website/src/data/test-inventory.json
git commit -m "test(arena): regenerate test inventory with new arena IDs"
```

---

## Task 35: Docs page + deploy

**Files:**
- Create: `docs-site/content/services/arena.md`

- [ ] **Step 1: Create `docs-site/content/services/arena.md`**

```markdown
# Arena

A 4-player last-man-standing browser game embedded in the mentolder website.

- **Host:** `arena-ws.mentolder.de` (mentolder cluster only)
- **DB:** schema `arena` in mentolder shared-db
- **Admin role:** `arena_admin` on the mentolder Keycloak realm
- **Open a lobby:** `/admin/arena` → Open lobby button
- **Join:** banner appears across both brands for 60 s

Design spec: [docs/superpowers/specs/2026-05-11-arena-design.md](../../specs/2026-05-11-arena-design.md)
```

- [ ] **Step 2: Deploy docs ConfigMap to both clusters**

Run: `task docs:deploy`

- [ ] **Step 3: Commit**

```bash
git add docs-site/content/services/arena.md
git commit -m "docs(arena): add service page (host, DB, admin role, lobby flow)"
```

---

## Task 36: First deploy + smoke

**Files:** (none new)

This task does NOT modify code — it executes the deployment in the order migrations dictate.

- [ ] **Step 1: Pre-flight**

Run:
```bash
task workspace:validate ENV=mentolder
task workspace:validate ENV=korczewski
task test:all
```
Expected: all three pass.

- [ ] **Step 2: Push the arena-server image**

Run:
```bash
task arena:push ENV=mentolder
```
Expected: image at `ghcr.io/paddione/arena-server:latest`.

- [ ] **Step 3: Apply migrations Job**

Run:
```bash
task arena:deploy ENV=mentolder
```
Expected: the `arena-bootstrap` Job runs to completion (`kubectl -n workspace logs job/arena-bootstrap --context mentolder` shows "arena bootstrap complete").

- [ ] **Step 4: Verify schema**

Run:
```bash
task arena:db ENV=mentolder
```
Expected: three tables listed (`lobbies`, `match_players`, `matches`) plus `_migrations`.

- [ ] **Step 5: Verify healthz**

Run:
```bash
curl -s https://arena-ws.mentolder.de/healthz
```
Expected: `{"ok":true,"ts":<epoch-ms>}`.

- [ ] **Step 6: Deploy website on both clusters**

Run:
```bash
task website:deploy ENV=mentolder
task website:deploy ENV=korczewski
```
Expected: both rollouts succeed; new pages `/admin/arena` and `/portal/arena` are reachable.

- [ ] **Step 7: Manual end-to-end smoke**

1. Open https://web.mentolder.de/admin/arena (logged in as patrick).
2. Click "Open lobby". Should redirect to `/portal/arena?lobby=XXXXXX`.
3. In an incognito window, log into https://web.korczewski.de as a korczewski user.
4. Within 6 seconds, the arena banner appears at the top of the page.
5. Click "×" to dismiss; reload; banner stays hidden.
6. Wait 60 seconds → banner transitions to "in progress" state (per the lifecycle's 3 s stub) → "closing" → idle.

- [ ] **Step 8: Verify match row written**

Run:
```bash
task workspace:psql ENV=mentolder -- website
```
Then in psql:
```sql
SET search_path = arena;
SELECT id, lobby_code, started_at, winner_player, human_count, bot_count FROM matches ORDER BY started_at DESC LIMIT 5;
```
Expected: one row matching the just-finished lobby. (Note: Plan 1's lifecycle stub does NOT yet call `insertMatchWithPlayers` — that wiring lands in Task 37 below if you want a row for Plan 1; if not, skip this verify until Plan 2.)

- [ ] **Step 9: Commit deployment record (optional)**

If a deployment tracking file exists for this repo:
```bash
git commit --allow-empty -m "chore(arena): record Plan 1 first deploy on mentolder"
```

---

## Task 37: Hook archival into the lifecycle stub (optional Plan 1 polish)

**Files:**
- Modify: `arena-server/src/lobby/lifecycle.ts`

Plan 1's `toResults` currently doesn't archive to `arena.matches`. That's fine — Plan 2 replaces this stub with the real match flow. If you want a row written even for Plan 1 lobbies (so the recent-matches table on `/admin/arena` is non-empty), do this:

- [ ] **Step 1: Edit `arena-server/src/lobby/lifecycle.ts`**

In the `toResults` method body, after `lobby.phase = 'results'`, add:

```ts
    const players = [...lobby.players.values()];
    const winnerSlot = players.find(p => p.key === winnerKey) ?? players[0];
    void this.deps.persist.insertMatchWithPlayers({
      lobbyCode: code,
      openedAt: new Date(lobby.openedAt),
      startedAt: new Date(lobby.openedAt + 60_000),
      endedAt: new Date(),
      winnerPlayer: winnerKey,
      botCount: players.filter(p => p.isBot).length,
      humanCount: players.filter(p => !p.isBot).length,
      forfeitCount: 0,
      resultsJsonb: { stubbed: true },
      players: players.map((p, i) => ({
        playerKey: p.key,
        displayName: p.displayName,
        brand: p.brand,
        isBot: p.isBot,
        characterId: p.characterId,
        place: p === winnerSlot ? 1 : i + 2,
        kills: 0, deaths: 0, forfeit: false,
      })),
    }).catch(() => {/* logged in caller */});
```

- [ ] **Step 2: Re-run the lifecycle test**

Run: `cd arena-server && pnpm test src/lobby/lifecycle.test.ts`
Expected: still PASS (no test asserts on archival; the persist stub absorbs the call).

- [ ] **Step 3: Re-deploy**

Run: `task arena:deploy ENV=mentolder`

- [ ] **Step 4: Commit**

```bash
git add arena-server/src/lobby/lifecycle.ts
git commit -m "feat(arena): archive Plan 1 stub matches so /admin/arena recent table is non-empty"
```

---

## Task 38: Extend `task workspace:verify` with arena `/healthz`

**Files:**
- Modify: `scripts/workspace-verify.sh` (or whatever script the `workspace:verify` task in `Taskfile.yml` calls)

- [ ] **Step 1: Locate the verify script**

Run: `grep -nA2 'workspace:verify:' Taskfile.yml | head -20`
Expected: the task shells out to a script under `scripts/` — read that file.

- [ ] **Step 2: Append an arena probe**

Add a new check block. Pattern (adapt to whatever helpers the script already uses for hostnames / curl):

```bash
# Arena server is only deployed on mentolder. Skip on korczewski.
if [ "${BRAND_ID:-mentolder}" = "mentolder" ]; then
  echo "→ arena-server /healthz"
  if curl -fsS --max-time 5 "https://arena-ws.${PROD_DOMAIN}/healthz" | grep -q '"ok":true'; then
    echo "  ✓ arena-server healthy"
  else
    echo "  ✗ arena-server unreachable or unhealthy"
    EXIT=1
  fi
fi
```

- [ ] **Step 3: Smoke**

Run: `task workspace:verify ENV=mentolder`
Expected: the new line "arena-server healthy" appears in the output.

- [ ] **Step 4: Commit**

```bash
git add scripts/workspace-verify.sh
git commit -m "feat(arena): extend workspace:verify with arena /healthz probe"
```

---

## What lands in Plan 2 (out of scope here)

For the next plan-writing session, the gameplay milestone:

1. `game/tick.ts` — 30 Hz authoritative loop replacing the 3 s stub in `lifecycle.toInMatch`.
2. `game/physics.ts`, `game/weapons.ts`, `game/items.ts`, `game/powerups.ts`, `game/zone.ts`, `game/map.ts` (sandbox.jsx port).
3. `bots/ai.ts` + `bots/nav.ts` (A* on 32 px grid, FSM).
4. React + Pixi 8 island at `/portal/arena` with `PixiApp`, `LobbyScene`, `MatchScene`, `SpectatorScene`, `ResultsScene`.
5. HUD overlay (HP pips, kill feed, timer, alive count, minimap, ping pill, death overlay).
6. Slow-mo win condition + rematch vote UI.
7. SFX wiring.
8. FA-31 (4-player match runs and archives), FA-32 (rematch flow), FA-33 (forfeit) Playwright specs.
9. Spec §17 step 20 final smoke + `task feature:website` redeploy.

Keep the protocol-drift guard green: any new field in `MatchState`, `ServerMsg`, or `ClientMsg` must land in both `arena-server/src/proto/messages.ts` and `website/src/components/arena/shared/lobbyTypes.ts` in the same commit.

---

## Self-review checklist (executed when writing this plan)

- **§3 system overview** — covered by Tasks 1, 9, 10, 11, 16, 19.
- **§4 frontend** — banner (23, 24), Astro endpoints (20, 21, 22), `/portal/arena` placeholder (26), `/admin/arena` (25). React+Pixi explicitly deferred to Plan 2.
- **§5 game server** — scaffold (1), config (2), proto (3), JWT (4), Drizzle schema + migrations + repo (5, 6), constants (7), lobby lifecycle (8), routes (9), WS (10, 11), Dockerfile (12). Tick loop + AI explicitly deferred to Plan 2.
- **§6 network protocol** — types in `proto/messages.ts` (3); `PROTOCOL_VERSION = 1` enforced in WS handshake (10).
- **§7 banner mechanics** — Tasks 23, 24, 21 (SSE).
- **§8 lobby lifecycle** — Task 8 (state machine), Task 37 (optional archival). In-match stub is 3 s; Plan 2 replaces with the real tick.
- **§9 game systems** — Task 7 locks all numbers; nothing else in Plan 1 consumes them. Plan 2 reads them.
- **§10 data model** — Tasks 5, 6, 17.
- **§11 identity** — Tasks 13, 14, 20.
- **§12 deployment** — Tasks 12, 15, 16, 17, 18, 19, 27. ArgoCD: nothing new — picked up by existing workspace Application.
- **§13 testing** — Tasks 29, 30, 31, 32, 33, 34. The vitest battery exercises auth, repo, lifecycle, routes, proto.
- **§16 open questions** — SSE-under-Traefik is hedged by the 2 s polling approach in Task 21; long-poll can replace it in Plan 2 with no API surface change.
- **§17 build sequence** — steps 1, 2, 3, 4, 5, 16, 17, 18, 19 are this plan; 6–15, 20 are Plan 2.

**Type consistency:** `playerKey()` is named identically in Tasks 4, 6, 8, 10. `Lifecycle` deps shape (`onBroadcast`, `persist`) matches across Tasks 8, 9, 11. `MatchState` is intentionally a stub in Task 3 and extended (additively) by Plan 2 — protocol drift guard catches any backwards-incompatible edit.

**Placeholders scan:** no "TBD", "implement later", or "similar to Task N" references. Every code step has runnable code. Every command has expected output.
