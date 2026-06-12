import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveShareToken } from '../src/server/share-tokens';
import { gateMutation } from '../src/server/ws-handler';
import { canMutate, resolveRole } from '../src/server/permissions';

test('FA-BRT-41: resolveShareToken returns the room for a valid token', async () => {
  const pool = { async query() { return { rows: [{ room_token: 'room-A' }] }; } };
  assert.equal(await resolveShareToken('valid', pool as any), 'room-A');
});

test('FA-BRT-42: resolveShareToken returns null for an invalid token', async () => {
  const pool = { async query() { return { rows: [] }; } };
  assert.equal(await resolveShareToken('nope', pool as any), null);
});

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

test('FA-BRT-44: guest WS may request_state_snapshot', () => {
  const deps = { buildStateFromMutations: () => ({ sessionCode: 'X', roles: { u1: 'leiter' } }), figureMaps: new Map(), canMutate, resolveRole };
  assert.equal(gateMutation({ _isGuest: true }, 'room-A', 'request_state_snapshot', undefined, deps as any), true);
});

test('FA-BRT-45: guest WS write mutation is denied', () => {
  const deps = { buildStateFromMutations: () => ({ sessionCode: 'X', roles: { u1: 'leiter' } }), figureMaps: new Map(), canMutate, resolveRole };
  for (const t of ['add', 'move', 'delete', 'figure_possess'] as const) {
    assert.equal(gateMutation({ _isGuest: true }, 'room-A', t, 'fig1', deps as any), false, `guest ${t} must be denied`);
  }
});
