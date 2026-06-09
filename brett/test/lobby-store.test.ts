// brett/test/lobby-store.test.ts — Phase B / B15 (pure, no DOM/WebGL)
import { test } from 'node:test';
import assert from 'node:assert';
import { createLobbyState, applyLobbyServerMessage } from '../src/client/lobby-store';
import type { LobbyState } from '../src/client/lobby-store';

test('presence_join adds a roster entry; presence_leave removes it', () => {
  let s: LobbyState = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'presence_join', participant: { userId: 'u1', name: 'Anna', color: '#4ea1ff' } });
  assert.strictEqual(s.roster.u1.name, 'Anna');
  s = applyLobbyServerMessage(s, { type: 'presence_leave', userId: 'u1' });
  assert.strictEqual(s.roster.u1, undefined);
});

test('role_changed sets roster[userId].role', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'presence_join', participant: { userId: 'u2', name: 'Ben', color: '#3fb950' } });
  s = applyLobbyServerMessage(s, { type: 'role_changed', userId: 'u2', role: 'stellvertreter' });
  assert.strictEqual(s.roster.u2.role, 'stellvertreter');
});

test('lobby_ready_changed sets roster[userId].ready', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'presence_join', participant: { userId: 'u3', name: 'Cem', color: '#f0a35e' } });
  s = applyLobbyServerMessage(s, { type: 'lobby_ready_changed', userId: 'u3', ready: true });
  assert.strictEqual(s.roster.u3.ready, true);
});

test('session_phase_change sets state.phase (drives view-machine)', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'session_phase_change', phase: 'active', transitionedAt: 't', reason: 'round-start' });
  assert.strictEqual(s.phase, 'active');
});

test('lobby_settings_change stores templateId + optik', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'lobby_settings_change', templateId: 'fam5', optik: { sky: 'dusk' } });
  assert.strictEqual(s.settings.templateId, 'fam5');
  assert.strictEqual(s.settings.optik?.sky, 'dusk');
});

test('session_created stores sessionCode', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'session_created', code: 'KRB-9A2' });
  assert.strictEqual(s.sessionCode, 'KRB-9A2');
});

test('FE-2/REG-6: snapshot seeds phase, sessionCode AND the roster (with roles)', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, {
    type: 'snapshot',
    figures: [],
    phase: 'lobby',
    sessionCode: 'KRB-9A2',
    participants: [
      { userId: 'u1', name: 'Anna', color: '#4ea1ff', role: 'leiter' },
      { userId: 'u2', name: 'Ben', color: '#3fb950' },
    ],
  });
  assert.strictEqual(s.phase, 'lobby', 'join snapshot drives the authoritative phase');
  assert.strictEqual(s.sessionCode, 'KRB-9A2');
  assert.strictEqual(s.roster.u1.role, 'leiter', 'persisted role is merged into the late-joiner roster');
  assert.strictEqual(s.roster.u2.name, 'Ben');
  assert.strictEqual(s.roster.u2.role, undefined, 'unassigned participant has no role');
});

test('CP-3: admin_token_changed + coaching_steps_change are tracked (no silent drop)', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'admin_token_changed', holderPlayerId: 'u9', reason: 'handoff' });
  assert.strictEqual(s.adminTokenHolder, 'u9');
  s = applyLobbyServerMessage(s, { type: 'coaching_steps_change', steps: ['warmup', 'play'], index: 1 });
  assert.deepStrictEqual(s.coachingSteps, { steps: ['warmup', 'play'], index: 1 });
});

test('unknown server message leaves state unchanged', () => {
  const s = createLobbyState();
  const s2 = applyLobbyServerMessage(s, { type: 'info', count: 3 } as any);
  assert.strictEqual(s2.phase, s.phase);
  assert.deepStrictEqual(Object.keys(s2.roster), Object.keys(s.roster));
});

test('reducer does not mutate the previous state object (roster identity)', () => {
  const s = createLobbyState();
  const s2 = applyLobbyServerMessage(s, { type: 'presence_join', participant: { userId: 'x', name: 'X', color: '#fff' } });
  assert.notStrictEqual(s2.roster, s.roster, 'returns a fresh roster, does not mutate in place');
  assert.strictEqual(s.roster.x, undefined, 'previous state untouched');
});

test('session_phase_change(reason=admin-create) clears the roster', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'presence_join', participant: { userId: 'old', name: 'Old', color: '#4ea1ff' } });
  assert.strictEqual(Object.keys(s.roster).length, 1);
  s = applyLobbyServerMessage(s, { type: 'session_phase_change', phase: 'lobby', transitionedAt: 't', reason: 'admin-create' });
  assert.deepStrictEqual(s.roster, {});
  assert.strictEqual(s.phase, 'lobby');
});

test('session_phase_change with a non-admin-create reason keeps the roster', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'presence_join', participant: { userId: 'u', name: 'U', color: '#4ea1ff' } });
  s = applyLobbyServerMessage(s, { type: 'session_phase_change', phase: 'active', transitionedAt: 't', reason: 'round-start' });
  assert.strictEqual(s.roster.u.name, 'U');
  assert.strictEqual(s.phase, 'active');
});

test('presence_join with role leiter is reflected in the roster', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'presence_join', participant: { userId: 'me', name: 'Me', color: '#4ea1ff', role: 'leiter', ready: false } });
  assert.strictEqual(s.roster.me.role, 'leiter');
});
