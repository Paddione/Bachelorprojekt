---
title: Brett Duel-Mode WS Integration Tests Implementation Plan
domains: []
status: active
pr_number: null
---

# Brett Duel-Mode WS Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 WebSocket integration tests for the arena-server Duel-Mode, plus a spectator death guard fix that prevents lobby players from re-joining as spectators.

**Architecture:** Spin up a real HTTP + Socket.IO server on a random port in `beforeAll`, generate test JWTs with an in-memory RSA key (same pattern as `jwt.test.ts`), wire in a stub persistence layer (no real DB), and connect via `socket.io-client`. Each test pre-builds the exact lobby state it needs via `putLobby`, avoiding timer-dependent phase transitions.

**Tech Stack:** Vitest, socket.io-client, jose (SignJWT/generateKeyPair), socket.io Server, Express

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `arena-server/package.json` | Add `socket.io-client` devDependency |
| Modify | `arena-server/src/ws/server.ts` | Add optional `opts.keyResolver` 4th param; thread through to `verifyArenaJwt` |
| Modify | `arena-server/src/ws/handlers.ts` | Add `spectator:join` guard: reject if player already in `lobby.players` |
| Create | `arena-server/src/ws/integration.test.ts` | 8 WS integration tests (T1–T8) |

---

## Task 1: Install socket.io-client

**Files:**
- Modify: `arena-server/package.json`

- [ ] **Step 1: Add the devDependency**

In `arena-server/package.json`, add to `"devDependencies"`:
```json
"socket.io-client": "^4.8.3"
```

The `devDependencies` block should look like:
```json
"devDependencies": {
    "@types/express": "^5.0.6",
    "@types/node": "^25.9.1",
    "@types/pg": "^8.20.0",
    "@types/supertest": "^7.2.0",
    "socket.io-client": "^4.8.3",
    "supertest": "^7.2.2",
    "tsx": "^4.22.3",
    "typescript": "^6.0.3",
    "vite": "^8.0.14",
    "vitest": "^4.1.7"
}
```

- [ ] **Step 2: Install**

```bash
cd arena-server && pnpm install
```

Expected: pnpm lockfile updated, `node_modules/socket.io-client/` present.

- [ ] **Step 3: Verify import resolves**

```bash
cd arena-server && node -e "require('socket.io-client'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add arena-server/package.json arena-server/pnpm-lock.yaml
git commit -m "chore(arena-server): add socket.io-client devDependency for WS integration tests"
```

---

## Task 2: Add keyResolver test seam to startWs

**Files:**
- Modify: `arena-server/src/ws/server.ts`

The `verifyArenaJwt` function already accepts a `keyResolver` option (used in `jwt.test.ts`) that skips the live JWKS network fetch. `startWs` doesn't expose this seam yet.

- [ ] **Step 1: Write a failing skeleton test (T1) to confirm the seam is needed**

Create `arena-server/src/ws/integration.test.ts` with just T1:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioc, type Socket } from 'socket.io-client';
import express from 'express';
import { generateKeyPair, SignJWT } from 'jose';
import { startWs } from './server';
import { Lifecycle } from '../lobby/lifecycle';
import { makeBroadcasters } from './broadcasters';
import { listLobbies, removeLobby } from '../lobby/registry';
import { PROTOCOL_VERSION } from '../proto/messages';

const ISSUER = 'https://auth.test.local/realms/test';

let port: number;
let httpServer: ReturnType<typeof createServer>;
let lc: Lifecycle;
let publicKey: CryptoKey;
let privateKey: CryptoKey;

const persistStub: any = {
  insertLobby: async () => {},
  updateLobbyPhase: async () => {},
  insertMatchWithPlayers: async () => {},
};

async function makeToken(sub: string): Promise<string> {
  return new SignJWT({
    realm_access: { roles: [] },
    preferred_username: sub,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(ISSUER)
    .setAudience('arena')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(privateKey);
}

function connect(token: string, proto: number = PROTOCOL_VERSION): Socket {
  return ioc(`http://localhost:${port}`, {
    path: '/ws',
    auth: { token, protocolVersion: proto },
    transports: ['websocket'],
    reconnection: false,
    timeout: 3000,
  });
}

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  publicKey = kp.publicKey;
  privateKey = kp.privateKey;

  const app = express();
  httpServer = createServer(app);
  const io = startWs(
    httpServer,
    { port: 0, dbUrl: 'unused', issuers: [{ url: ISSUER, brand: 'mentolder' }], logLevel: 'silent' },
    null as any,
    { keyResolver: async () => publicKey },
  );
  const bc = makeBroadcasters(io);
  lc = new Lifecycle({
    onBroadcast: (code) => bc.emitLobbyState(code),
    persist: persistStub,
    bc,
  });
  io.use((socket: any, next: any) => { socket.lc = lc; next(); });

  await new Promise<void>((res) => httpServer.listen(0, res));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((res) => httpServer.close(() => res()));
});

beforeEach(() => {
  for (const l of listLobbies()) removeLobby(l.code);
});

describe('WS integration', () => {
  it('T1: accepts connection with valid JWT', async () => {
    const token = await makeToken('alice');
    const socket = connect(token);
    await new Promise<void>((res, rej) => {
      socket.on('connect', res);
      socket.on('connect_error', (e: Error) => rej(e));
    });
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });
});
```

- [ ] **Step 2: Run to confirm T1 fails (keyResolver not wired yet)**

```bash
cd arena-server && pnpm test src/ws/integration.test.ts
```

Expected: T1 FAILS — `connect_error: unauthorised` (the 4th arg is ignored, `verifyArenaJwt` tries live JWKS fetch and fails).

- [ ] **Step 3: Add the keyResolver seam to startWs**

In `arena-server/src/ws/server.ts`, change the function signature and the `verifyArenaJwt` call:

```typescript
export function startWs(
  server: HttpServer,
  cfg: Config,
  lc: Lifecycle,
  opts?: { keyResolver?: (issuer: string) => Promise<any> },
): Server {
  const io = new Server(server, { path: '/ws', cors: { origin: '*' } });

  io.use(async (socket, next) => {
    const ip = socket.handshake.address;
    if (!rateLimit(ip)) return next(new Error('rate limited'));
    const token = (socket.handshake.auth as any)?.token;
    const proto = (socket.handshake.auth as any)?.protocolVersion;
    if (proto !== PROTOCOL_VERSION) return next(new Error(`protocol mismatch: client=${proto} server=${PROTOCOL_VERSION}`));
    if (!token) return next(new Error('missing token'));
    try {
      const claims = await verifyArenaJwt(token, {
        trustedIssuers: cfg.issuers,
        keyResolver: opts?.keyResolver,
      });
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
    const effectiveLc: Lifecycle = (socket as any).lc ?? lc;
    attachHandlers(socket, { lc: effectiveLc, user });
  });

  return io;
}
```

The only changes from the original are: (a) the optional `opts` parameter, (b) adding `keyResolver: opts?.keyResolver` to the `verifyArenaJwt` call.

- [ ] **Step 4: Run T1 to confirm it passes**

```bash
cd arena-server && pnpm test src/ws/integration.test.ts
```

Expected: T1 PASSES — `socket.connected` is `true`.

- [ ] **Step 5: Commit**

```bash
git add arena-server/src/ws/server.ts arena-server/src/ws/integration.test.ts
git commit -m "feat(arena-server): add keyResolver seam to startWs for WS integration tests"
```

---

## Task 3: Write integration tests T2–T7

**Files:**
- Modify: `arena-server/src/ws/integration.test.ts`

These tests cover existing server behaviour (connection rejection, lobby join paths, late spectator join). All should pass without any further code changes.

- [ ] **Step 1: Replace the test file with the full T1–T7 suite**

Replace the entire contents of `arena-server/src/ws/integration.test.ts` with:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioc, type Socket } from 'socket.io-client';
import express from 'express';
import { generateKeyPair, SignJWT } from 'jose';
import { startWs } from './server';
import { Lifecycle } from '../lobby/lifecycle';
import { makeBroadcasters } from './broadcasters';
import { listLobbies, removeLobby, putLobby } from '../lobby/registry';
import { PROTOCOL_VERSION } from '../proto/messages';
import type { MatchState, PlayerSlot } from '../proto/messages';

const ISSUER = 'https://auth.test.local/realms/test';

let port: number;
let httpServer: ReturnType<typeof createServer>;
let lc: Lifecycle;
let publicKey: CryptoKey;
let privateKey: CryptoKey;

const persistStub: any = {
  insertLobby: async () => {},
  updateLobbyPhase: async () => {},
  insertMatchWithPlayers: async () => {},
};

async function makeToken(sub: string, brand: 'mentolder' | 'korczewski' = 'mentolder'): Promise<string> {
  return new SignJWT({
    realm_access: { roles: [] },
    preferred_username: sub,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(ISSUER)
    .setAudience('arena')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(privateKey);
}

function connect(token: string, proto: number = PROTOCOL_VERSION): Socket {
  return ioc(`http://localhost:${port}`, {
    path: '/ws',
    auth: { token, protocolVersion: proto },
    transports: ['websocket'],
    reconnection: false,
    timeout: 3000,
  });
}

/** Resolves when socket connects, rejects with connect_error. */
function waitConnect(socket: Socket): Promise<void> {
  return new Promise<void>((res, rej) => {
    socket.on('connect', res);
    socket.on('connect_error', (e: Error) => rej(e));
  });
}

/** Returns first 'msg' of the given type emitted by the server, then cleans up. */
function waitMsg(socket: Socket, type: string): Promise<any> {
  return new Promise<any>((res) => {
    const handler = (m: any) => { if (m.t === type) { socket.off('msg', handler); res(m); } };
    socket.on('msg', handler);
  });
}

function makeSlot(key: string, displayName: string): PlayerSlot {
  return { key, displayName, brand: 'mentolder', characterId: 'blonde-guy', isBot: false, ready: true, alive: true };
}

const stubState: MatchState = {
  matchId: 'test-match-id',
  tick: 1,
  phase: 'in-match',
  startedAt: 0,
  players: {},
  items: [],
  powerups: [],
  zone: { cx: 500, cy: 500, radius: 400, shrinking: false, nextDamageMs: 0 },
  doors: [],
  itemSpawnRemainingMs: 5000,
  powerupSpawnRemainingMs: 5000,
  aliveCount: 1,
  everAliveCount: 1,
  nextItemId: 0,
  eliminationOrder: [],
};

const stubTick: any = {
  getState: () => stubState,
  pushInput: () => {},
  forfeit: () => {},
  stop: () => {},
  start: () => {},
};

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  publicKey = kp.publicKey;
  privateKey = kp.privateKey;

  const app = express();
  httpServer = createServer(app);
  const io = startWs(
    httpServer,
    { port: 0, dbUrl: 'unused', issuers: [{ url: ISSUER, brand: 'mentolder' }], logLevel: 'silent' },
    null as any,
    { keyResolver: async () => publicKey },
  );
  const bc = makeBroadcasters(io);
  lc = new Lifecycle({
    onBroadcast: (code) => bc.emitLobbyState(code),
    persist: persistStub,
    bc,
  });
  io.use((socket: any, next: any) => { socket.lc = lc; next(); });

  await new Promise<void>((res) => httpServer.listen(0, res));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((res) => httpServer.close(() => res()));
});

beforeEach(() => {
  for (const l of listLobbies()) removeLobby(l.code);
});

describe('WS integration', () => {
  it('T1: accepts connection with valid JWT', async () => {
    const token = await makeToken('alice');
    const socket = connect(token);
    await waitConnect(socket);
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it('T2: rejects connection with wrong protocol version', async () => {
    const token = await makeToken('alice');
    const socket = connect(token, 999);
    const err = await new Promise<Error>((res, rej) => {
      socket.on('connect_error', res);
      socket.on('connect', () => rej(new Error('expected rejection')));
    });
    expect(err.message).toMatch(/protocol mismatch/i);
    socket.disconnect();
  });

  it('T3: rejects connection without token', async () => {
    const socket = ioc(`http://localhost:${port}`, {
      path: '/ws',
      auth: { protocolVersion: PROTOCOL_VERSION },
      transports: ['websocket'],
      reconnection: false,
      timeout: 3000,
    });
    const err = await new Promise<Error>((res, rej) => {
      socket.on('connect_error', res);
      socket.on('connect', () => rej(new Error('expected rejection')));
    });
    expect(err.message).toMatch(/missing token/i);
    socket.disconnect();
  });

  it('T4: lobby:join reconnecting player gets lobby:state', async () => {
    // Pre-register alice in an open lobby so the handler takes the reconnect path
    // and does a direct socket.emit rather than relying on room broadcast timing.
    putLobby({
      code: 'T4CODE',
      phase: 'open',
      hostKey: 'alice@mentolder',
      openedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      players: new Map([['alice@mentolder', makeSlot('alice@mentolder', 'Alice')]]),
      rematchYes: new Set(),
      mode: 'ffa',
      timers: {},
    });

    const token = await makeToken('alice');
    const socket = connect(token);
    await waitConnect(socket);

    const [state] = await Promise.all([
      waitMsg(socket, 'lobby:state'),
      Promise.resolve().then(() => socket.emit('msg', { t: 'lobby:join', code: 'T4CODE' })),
    ]);

    expect(state.code).toBe('T4CODE');
    expect(state.phase).toBe('open');
    socket.disconnect();
  });

  it('T5: lobby:join unknown code sends error not-found', async () => {
    const token = await makeToken('alice');
    const socket = connect(token);
    await waitConnect(socket);

    const [err] = await Promise.all([
      waitMsg(socket, 'error'),
      Promise.resolve().then(() => socket.emit('msg', { t: 'lobby:join', code: 'XXXXXX' })),
    ]);

    expect(err.code).toBe('not-found');
    socket.disconnect();
  });

  it('T6: lobby:join in-match lobby as non-player gives lobby:state', async () => {
    // Alice is NOT in players — she arrives mid-match as a late spectator via lobby:join.
    putLobby({
      code: 'T6CODE',
      phase: 'in-match',
      hostKey: 'host@mentolder',
      openedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      players: new Map([['host@mentolder', makeSlot('host@mentolder', 'Host')]]),
      rematchYes: new Set(),
      mode: 'ffa',
      timers: {},
      tick: stubTick,
    });

    const token = await makeToken('alice');
    const socket = connect(token);
    await waitConnect(socket);

    const [state] = await Promise.all([
      waitMsg(socket, 'lobby:state'),
      Promise.resolve().then(() => socket.emit('msg', { t: 'lobby:join', code: 'T6CODE' })),
    ]);

    expect(state.phase).toBe('in-match');
    socket.disconnect();
  });

  it('T7: spectator:join in-match delivers match:full-snapshot', async () => {
    putLobby({
      code: 'T7CODE',
      phase: 'in-match',
      hostKey: 'host@mentolder',
      openedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      players: new Map([['host@mentolder', makeSlot('host@mentolder', 'Host')]]),
      rematchYes: new Set(),
      mode: 'ffa',
      timers: {},
      tick: stubTick,
    });

    const token = await makeToken('alice');
    const socket = connect(token);
    await waitConnect(socket);

    const [snap] = await Promise.all([
      waitMsg(socket, 'match:full-snapshot'),
      Promise.resolve().then(() => socket.emit('msg', { t: 'spectator:join', code: 'T7CODE' })),
    ]);

    expect(snap.tick).toBe(1);
    expect(snap.state.matchId).toBe('test-match-id');
    socket.disconnect();
  });
});
```

- [ ] **Step 2: Run T1–T7 and confirm all pass**

```bash
cd arena-server && pnpm test src/ws/integration.test.ts
```

Expected: T1–T7 all PASS.

- [ ] **Step 3: Commit**

```bash
git add arena-server/src/ws/integration.test.ts
git commit -m "test(arena-server): add WS integration tests T1-T7 (connect, join, spectator)"
```

---

## Task 4: Write T8 (spectator death guard) — TDD red → green

**Files:**
- Modify: `arena-server/src/ws/integration.test.ts` (add T8)
- Modify: `arena-server/src/ws/handlers.ts` (add guard)

The bug: `spectator:join` in `handlers.ts` never checks whether the connecting player is already registered in `lobby.players`. A player who is alive or dead in the match could call `spectator:join` and get added to the `spectators` set, receiving duplicate state. The fix: reject with `already-player` if `specLobby.players.has(key)`.

- [ ] **Step 1: Write T8 (the failing test)**

Add `T8` inside the `describe('WS integration', ...)` block in `arena-server/src/ws/integration.test.ts`:

```typescript
  it('T8: spectator:join rejected when player is already in the lobby', async () => {
    // Alice is a registered player in an in-match lobby.
    putLobby({
      code: 'T8CODE',
      phase: 'in-match',
      hostKey: 'alice@mentolder',
      openedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      players: new Map([
        ['alice@mentolder', makeSlot('alice@mentolder', 'Alice')],
        ['host@mentolder', makeSlot('host@mentolder', 'Host')],
      ]),
      rematchYes: new Set(),
      mode: 'ffa',
      timers: {},
      tick: stubTick,
    });

    const token = await makeToken('alice');
    const socket = connect(token);
    await waitConnect(socket);

    const [err] = await Promise.all([
      waitMsg(socket, 'error'),
      Promise.resolve().then(() => socket.emit('msg', { t: 'spectator:join', code: 'T8CODE' })),
    ]);

    expect(err.code).toBe('already-player');
    socket.disconnect();
  });
```

- [ ] **Step 2: Run T8 to confirm it fails**

```bash
cd arena-server && pnpm test src/ws/integration.test.ts
```

Expected: T8 FAILS — the test times out waiting for an `error` message (the handler currently adds alice to spectators instead of rejecting).

- [ ] **Step 3: Add the spectator death guard in handlers.ts**

In `arena-server/src/ws/handlers.ts`, find the `spectator:join` case and add the guard after the phase check:

```typescript
        case 'spectator:join': {
          const specLobby = getLobby(m.code);
          if (!specLobby) { sendError(socket, 'not-found', 'lobby not found'); break; }
          if (specLobby.phase !== 'in-match' && specLobby.phase !== 'slow-mo') {
            sendError(socket, 'not-in-match', 'match not in progress'); break;
          }
          if (specLobby.players.has(key)) {
            sendError(socket, 'already-player', 'already registered as a match player'); break;
          }
          if (!specLobby.spectators) specLobby.spectators = new Set();
          specLobby.spectators.add(key);
          const currentState = specLobby.tick?.getState();
          if (currentState) {
            const snap: ServerMsg = { t: 'match:full-snapshot', tick: currentState.tick, state: currentState };
            socket.emit('msg', snap);
          }
          break;
        }
```

The full `handlers.ts` with the guard in place (complete file, do not omit other cases):

```typescript
import type { Socket } from 'socket.io';
import type { ClientMsg, ServerMsg } from '../proto/messages';
import { isClientMsg } from '../proto/messages';
import type { Lifecycle } from '../lobby/lifecycle';
import type { ArenaClaims } from '../auth/jwt';
import { playerKey } from '../auth/jwt';
import { getLobby } from '../lobby/registry';

export function attachHandlers(socket: Socket, deps: { lc: Lifecycle; user: ArenaClaims }) {
  const key = playerKey(deps.user);

  socket.on('msg', (raw: unknown) => {
    if (!isClientMsg(raw)) { sendError(socket, 'bad-msg', 'unrecognised message'); return; }
    const m = raw as ClientMsg;
    try {
      switch (m.t) {
        case 'lobby:join': {
          const targetLobby = getLobby(m.code);
          if (!targetLobby) { sendError(socket, 'not-found', 'lobby not found'); break; }
          // Existing player reconnecting (e.g. solo host) — send current state and, if mid-match, the live snapshot.
          if (targetLobby.players.has(key)) {
            socket.join(`lobby:${m.code}`);
            const stateMsg: ServerMsg = {
              t: 'lobby:state', code: m.code, phase: targetLobby.phase,
              players: [...targetLobby.players.values()], expiresAt: targetLobby.expiresAt,
              mode: targetLobby.mode,
            };
            socket.emit('msg', stateMsg);
            if ((targetLobby.phase === 'in-match' || targetLobby.phase === 'slow-mo') && targetLobby.tick) {
              const state = targetLobby.tick.getState();
              const snap: ServerMsg = { t: 'match:full-snapshot', tick: state.tick, state };
              socket.emit('msg', snap);
            }
            // one-v-three (and legacy solo) lobbies wait for the host's WS connect before counting down.
            if (targetLobby.mode === 'one-v-three' && targetLobby.phase === 'open' && targetLobby.hostKey === key) {
              deps.lc.startSolo(m.code);
            }
            break;
          }
          // Late spectator join: a non-player connecting mid-match.
          if (targetLobby.phase === 'in-match' || targetLobby.phase === 'slow-mo') {
            socket.join(`lobby:${m.code}`);
            const stateMsg: ServerMsg = {
              t: 'lobby:state', code: m.code, phase: targetLobby.phase,
              players: [...targetLobby.players.values()], expiresAt: targetLobby.expiresAt,
              mode: targetLobby.mode,
            };
            socket.emit('msg', stateMsg);
            break;
          }
          // Fresh join into an open lobby.
          deps.lc.join(m.code, {
            key, displayName: deps.user.displayName, brand: deps.user.brand,
            characterId: 'blonde-guy', isBot: false, ready: false, alive: true,
          });
          socket.join(`lobby:${m.code}`);
          break;
        }
        case 'lobby:start':
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) deps.lc.start(room.slice(6), key);
          }
          break;
        case 'lobby:leave':
          // best-effort: caller is responsible for emitting state via lifecycle
          break;
        case 'lobby:character':
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) deps.lc.setCharacter(room.slice(6), key, m.characterId);
          }
          break;
        case 'rematch:vote':
          // join+vote require the socket to know its lobby; v1: scan rooms
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) deps.lc.voteRematch(room.slice(6), key, m.yes);
          }
          break;
        case 'forfeit':
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) {
              deps.lc.forfeit(room.slice(6), key);
            }
          }
          break;
        case 'input':
          for (const room of socket.rooms) {
            if (room.startsWith('lobby:')) {
              getLobby(room.slice(6))?.tick?.pushInput(key, m);
            }
          }
          break;
        case 'spectator:join': {
          const specLobby = getLobby(m.code);
          if (!specLobby) { sendError(socket, 'not-found', 'lobby not found'); break; }
          if (specLobby.phase !== 'in-match' && specLobby.phase !== 'slow-mo') {
            sendError(socket, 'not-in-match', 'match not in progress'); break;
          }
          if (specLobby.players.has(key)) {
            sendError(socket, 'already-player', 'already registered as a match player'); break;
          }
          if (!specLobby.spectators) specLobby.spectators = new Set();
          specLobby.spectators.add(key);
          const currentState = specLobby.tick?.getState();
          if (currentState) {
            const snap: ServerMsg = { t: 'match:full-snapshot', tick: currentState.tick, state: currentState };
            socket.emit('msg', snap);
          }
          break;
        }
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

- [ ] **Step 4: Run all integration tests to confirm all 8 pass**

```bash
cd arena-server && pnpm test src/ws/integration.test.ts
```

Expected: T1–T8 all PASS.

- [ ] **Step 5: Run the full test suite to verify no regressions**

```bash
cd arena-server && pnpm test
```

Expected: All existing tests (jwt.test.ts, lifecycle.test.ts, routes.test.ts, etc.) plus the new integration tests all pass.

- [ ] **Step 6: Commit**

```bash
git add arena-server/src/ws/handlers.ts arena-server/src/ws/integration.test.ts
git commit -m "fix(arena-server): guard spectator:join against players already in lobby; add T8 integration test"
```

---

## Task 5: PR

- [ ] **Step 1: Push branch and open PR**

```bash
git push origin HEAD
gh pr create \
  --title "fix(arena-server): WS integration tests + spectator death guard [T000253]" \
  --body "$(cat <<'EOF'
## Summary
- Adds `socket.io-client` devDependency to `arena-server`
- Threads `keyResolver` test seam through `startWs` (4th optional param) so integration tests bypass live JWKS network calls
- Adds 8 WS integration tests (T1–T8) in `arena-server/src/ws/integration.test.ts` covering: connection accept/reject, lobby join paths, late spectator via `lobby:join`, `spectator:join` snapshot delivery, and the new spectator death guard
- Fixes: players already registered in `lobby.players` can no longer send `spectator:join` — they receive `error {code: already-player}` and must reconnect via `lobby:join` instead

## Test plan
- [ ] `cd arena-server && pnpm test` — all tests green
- [ ] CI arena-server job passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Squash-merge once CI is green**

```bash
gh pr merge --squash --auto
```
