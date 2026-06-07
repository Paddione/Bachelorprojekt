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
