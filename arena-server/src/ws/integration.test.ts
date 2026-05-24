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

function waitConnect(socket: Socket): Promise<void> {
  return new Promise<void>((res, rej) => {
    socket.on('connect', res);
    socket.on('connect_error', (e: Error) => rej(e));
  });
}

function waitMsg(socket: Socket, type: string): Promise<any> {
  return new Promise<any>((res) => {
    const handler = (m: any) => {
      if (m.t === type) { socket.off('msg', handler); res(m); }
    };
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

  it('T8: spectator:join rejected when player is already in the lobby', async () => {
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
});
