// brett/test/permissions.test.ts — Phase C / C3
// Full canMutate matrix (role × type × ownership × toggle) + Default-Deny,
// plus strict resolveRole (session-keyed only).
import { test } from 'node:test';
import assert from 'node:assert';
import { canMutate, resolveRole } from '../src/server/index';
import type { Role } from '../src/types/state';

type MType =
  | 'add' | 'move' | 'update' | 'jump' | 'delete'
  | 'clear' | 'stiffness' | 'snapshot' | 'request_state_snapshot' | 'figure_lock';

const OWNER_GATED: MType[] = ['move', 'update', 'jump', 'delete', 'figure_lock'];
const LEITER_ONLY: MType[] = ['clear', 'snapshot', 'stiffness'];
const ALL_TYPES: MType[] = [
  'add', 'move', 'update', 'jump', 'delete',
  'clear', 'stiffness', 'snapshot', 'request_state_snapshot', 'figure_lock',
];

function ctx(over: Partial<{ msgType: MType; role: Role; playerId: string; figureOwnerId: string | null; allowRepresentativeAdd: boolean }>) {
  return {
    msgType: 'move' as MType,
    role: 'beobachter' as Role,
    playerId: 'me',
    figureOwnerId: null as string | null,
    allowRepresentativeAdd: false,
    ...over,
  };
}

// ── Leiter: everything allowed regardless of ownership ───────────────────────
test('canMutate leiter: every MutationType → true (ownership-independent)', () => {
  for (const msgType of ALL_TYPES) {
    assert.strictEqual(
      canMutate(ctx({ msgType, role: 'leiter', figureOwnerId: 'someone-else' })),
      true,
      `leiter must be allowed: ${msgType}`,
    );
  }
});

// ── Stellvertreter: owner-gated, add via toggle, no leiter-only ──────────────
test('canMutate stellvertreter: owner-gated types → true iff figureOwnerId===playerId', () => {
  for (const msgType of OWNER_GATED) {
    assert.strictEqual(
      canMutate(ctx({ msgType, role: 'stellvertreter', playerId: 'me', figureOwnerId: 'me' })),
      true,
      `${msgType} on own figure allowed`,
    );
    assert.strictEqual(
      canMutate(ctx({ msgType, role: 'stellvertreter', playerId: 'me', figureOwnerId: 'other' })),
      false,
      `${msgType} on foreign figure denied`,
    );
    assert.strictEqual(
      canMutate(ctx({ msgType, role: 'stellvertreter', playerId: 'me', figureOwnerId: null })),
      false,
      `${msgType} on unowned figure denied`,
    );
  }
});

test('canMutate stellvertreter: add → true only iff allowRepresentativeAdd', () => {
  assert.strictEqual(
    canMutate(ctx({ msgType: 'add', role: 'stellvertreter', allowRepresentativeAdd: true })),
    true,
  );
  assert.strictEqual(
    canMutate(ctx({ msgType: 'add', role: 'stellvertreter', allowRepresentativeAdd: false })),
    false,
  );
  // default (toggle absent) is fail-closed
  assert.strictEqual(
    canMutate({ msgType: 'add', role: 'stellvertreter', playerId: 'me' } as any),
    false,
  );
});

test('canMutate stellvertreter: clear/snapshot/stiffness → false (leiter-only)', () => {
  for (const msgType of LEITER_ONLY) {
    assert.strictEqual(
      canMutate(ctx({ msgType, role: 'stellvertreter' })),
      false,
      `${msgType} must be leiter-only`,
    );
  }
});

test('canMutate stellvertreter: request_state_snapshot → true (read-only)', () => {
  assert.strictEqual(
    canMutate(ctx({ msgType: 'request_state_snapshot', role: 'stellvertreter' })),
    true,
  );
});

// ── Beobachter: read-only ────────────────────────────────────────────────────
test('canMutate beobachter: all mutations → false', () => {
  for (const msgType of ALL_TYPES.filter((t) => t !== 'request_state_snapshot')) {
    assert.strictEqual(
      canMutate(ctx({ msgType, role: 'beobachter', figureOwnerId: 'me' })),
      false,
      `beobachter must be denied: ${msgType}`,
    );
  }
});

test('canMutate beobachter: request_state_snapshot → true (read NEVER denied)', () => {
  assert.strictEqual(
    canMutate(ctx({ msgType: 'request_state_snapshot', role: 'beobachter' })),
    true,
  );
});

// ── request_state_snapshot is never denied for ANY role ──────────────────────
test('canMutate: request_state_snapshot → true for every role', () => {
  for (const role of ['leiter', 'stellvertreter', 'beobachter'] as Role[]) {
    assert.strictEqual(canMutate(ctx({ msgType: 'request_state_snapshot', role })), true, role);
  }
});

// ── Default-Deny: any non-matrix msgType → false for every role ──────────────
test('canMutate: Default-Deny for unknown/dead msgType (e.g. optik)', () => {
  for (const role of ['leiter', 'stellvertreter', 'beobachter'] as Role[]) {
    assert.strictEqual(
      canMutate({ msgType: 'optik' as any, role, playerId: 'me', figureOwnerId: 'me' }),
      false,
      `optik must be Default-Deny for ${role}`,
    );
    assert.strictEqual(
      canMutate({ msgType: 'totally_unknown' as any, role, playerId: 'me' }),
      false,
      `unknown type must be Default-Deny for ${role}`,
    );
  }
});

// ── resolveRole: strictly session-keyed ──────────────────────────────────────
test('resolveRole: session userId with a role → that role', () => {
  assert.strictEqual(resolveRole({ _session: { userId: 'u1' } }, { u1: 'leiter' }), 'leiter');
});

test('resolveRole: session userId without a role → beobachter', () => {
  assert.strictEqual(resolveRole({ _session: { userId: 'u1' } }, {}), 'beobachter');
});

test('resolveRole: no session (only _playerId) → beobachter even if id has a role', () => {
  assert.strictEqual(resolveRole({ _playerId: 'spoof' }, { spoof: 'leiter' }), 'beobachter');
});

test('resolveRole: empty ws → beobachter', () => {
  assert.strictEqual(resolveRole({}, {}), 'beobachter');
});

// ── Freeze-Gate (T000471) ────────────────────────────────────────────────────
import { wsHandler, applyMutation, buildStateFromMutations, figureMaps } from '../src/server/index';

const { gateMutation } = wsHandler as any;

function freezeDeps() {
  return {
    buildStateFromMutations,
    figureMaps,
    canMutate,
    resolveRole,
  };
}

test('Freeze-Gate: non-leiter move blocked when freeze active', () => {
  const room = 'freeze-gate-1';
  applyMutation(room, { type: 'session_code_set', code: 'FRZ-001' });
  applyMutation(room, { type: 'roles_set', roles: { 'p1': 'stellvertreter' } });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const ws = { _session: { userId: 'p1' }, _room: room };
  const allowed = gateMutation(ws, room, 'move', undefined, freezeDeps());
  assert.strictEqual(allowed, false, 'move must be blocked for stellvertreter when frozen');
});

test('Freeze-Gate: leiter move allowed even when freeze active', () => {
  const room = 'freeze-gate-2';
  applyMutation(room, { type: 'session_code_set', code: 'FRZ-002' });
  applyMutation(room, { type: 'roles_set', roles: { 'admin1': 'leiter' } });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const ws = { _session: { userId: 'admin1' }, _room: room };
  const allowed = gateMutation(ws, room, 'move', undefined, freezeDeps());
  assert.strictEqual(allowed, true, 'leiter must still be able to move when frozen');
});

test('Freeze-Gate: move allowed for all when freeze inactive', () => {
  const room = 'freeze-gate-3';
  applyMutation(room, { type: 'session_code_set', code: 'FRZ-003' });
  applyMutation(room, { type: 'roles_set', roles: { 'p2': 'stellvertreter' } });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: false });
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: { face: null, body: 'adult-average', accessories: {} } } });
  applyMutation(room, { type: 'figure_owner_set', figureId: 'f1', ownerId: 'p2' });
  const ws = { _session: { userId: 'p2' }, _room: room };
  const allowed = gateMutation(ws, room, 'move', 'f1', freezeDeps());
  assert.strictEqual(allowed, true, 'stellvertreter must be able to move own figure when not frozen');
});

test('Freeze-Gate: beobachter jump blocked when freeze active', () => {
  const room = 'freeze-gate-4';
  applyMutation(room, { type: 'session_code_set', code: 'FRZ-004' });
  applyMutation(room, { type: 'roles_set', roles: { 'obs1': 'beobachter' } });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const ws = { _session: { userId: 'obs1' }, _room: room };
  const allowed = gateMutation(ws, room, 'jump', undefined, freezeDeps());
  assert.strictEqual(allowed, false, 'beobachter jump must be blocked when frozen');
});

test('Freeze-Gate: non-leiter update blocked when freeze active', () => {
  const room = 'freeze-gate-5';
  applyMutation(room, { type: 'session_code_set', code: 'FRZ-005' });
  applyMutation(room, { type: 'roles_set', roles: { 'p3': 'stellvertreter' } });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const ws = { _session: { userId: 'p3' }, _room: room };
  const allowed = gateMutation(ws, room, 'update', undefined, freezeDeps());
  assert.strictEqual(allowed, false, 'update must be blocked for stellvertreter when frozen');
});

test('Freeze-Gate: leiter update allowed when freeze active', () => {
  const room = 'freeze-gate-6';
  applyMutation(room, { type: 'session_code_set', code: 'FRZ-006' });
  applyMutation(room, { type: 'roles_set', roles: { 'admin2': 'leiter' } });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const ws = { _session: { userId: 'admin2' }, _room: room };
  const allowed = gateMutation(ws, room, 'update', undefined, freezeDeps());
  assert.strictEqual(allowed, true, 'leiter update must still pass when frozen');
});

// ── T000470: session_undo/redo sind in ADMIN_TYPES (ADMIN_TYPES-Gate) ────

import { wsHandler as _wsHandler } from '../src/server/index';
const { ADMIN_TYPES } = _wsHandler as any;

test('T000470: session_undo ist in ADMIN_TYPES', () => {
  assert.ok(ADMIN_TYPES.has('session_undo'), 'session_undo muss in ADMIN_TYPES sein');
});

test('T000470: session_redo ist in ADMIN_TYPES', () => {
  assert.ok(ADMIN_TYPES.has('session_redo'), 'session_redo muss in ADMIN_TYPES sein');
});

test('FA-BRT-C2a: gast may read (request_state_snapshot) but nothing else', () => {
  assert.equal(canMutate({ msgType: 'request_state_snapshot', role: 'gast', playerId: 'g' }), true);
  for (const t of ['add','move','update','jump','delete','clear','stiffness','snapshot','figure_lock','figure_possess','figure_release','figure_note_set'] as const) {
    assert.equal(canMutate({ msgType: t, role: 'gast', playerId: 'g' }), false, `gast must not ${t}`);
  }
});

test('FA-BRT-C2b: resolveRole returns gast for a guest ws', () => {
  assert.equal(resolveRole({ _isGuest: true }, { u1: 'leiter' }), 'gast');
  assert.equal(resolveRole({ _isGuest: true, _session: { userId: 'u1' } }, { u1: 'leiter' }), 'gast');
});

test('FA-BRT-C3a: gateMutation denies a guest write even on a free board', () => {
  const deps = {
    buildStateFromMutations: () => ({}),
    figureMaps: new Map(),
    canMutate,
    resolveRole,
  };
  const guestWs = { _isGuest: true };
  assert.equal(gateMutation(guestWs, 'room-free', 'move', 'fig1', deps as any), false);
  assert.equal(gateMutation(guestWs, 'room-free', 'request_state_snapshot', undefined, deps as any), true);
});

test('FA-BRT-C3b: gateMutation still bypasses for a normal anon on a free board', () => {
  const deps = {
    buildStateFromMutations: () => ({}),
    figureMaps: new Map(),
    canMutate,
    resolveRole,
  };
  assert.equal(gateMutation({}, 'room-free', 'move', 'fig1', deps as any), true);
});
