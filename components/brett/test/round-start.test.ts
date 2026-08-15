// brett/test/round-start.test.ts — Phase B / B8
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  handleAdminRoundStart,
} from '../src/server/index';

test('handleAdminRoundStart: lobby → active, broadcasts session_phase_change', () => {
  const room = 'round-start-1';
  applyMutation(room, { type: 'session_phase_set', phase: 'lobby' });
  const broadcasts: any[] = [];
  const result = handleAdminRoundStart(room, (m: any) => broadcasts.push(m));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(buildStateFromMutations(room).sessionPhase, 'active');
  const change = broadcasts.find((m: any) => m.type === 'session_phase_change');
  assert.ok(change, 'broadcasts session_phase_change');
  assert.strictEqual(change.phase, 'active');
  assert.strictEqual(change.reason, 'round-start');
  assert.ok(typeof change.transitionedAt === 'string');
});

test('handleAdminRoundStart: already active is idempotent (no second broadcast)', () => {
  const room = 'round-start-2';
  applyMutation(room, { type: 'session_phase_set', phase: 'lobby' });
  const broadcasts: any[] = [];
  handleAdminRoundStart(room, (m: any) => broadcasts.push(m));
  const firstCount = broadcasts.length;
  // Call again — already active.
  const second = handleAdminRoundStart(room, (m: any) => broadcasts.push(m));
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.noop, true);
  assert.strictEqual(broadcasts.length, firstCount, 'no second broadcast on double-start');
  assert.strictEqual(buildStateFromMutations(room).sessionPhase, 'active');
});
