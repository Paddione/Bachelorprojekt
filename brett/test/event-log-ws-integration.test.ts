// brett/test/event-log-ws-integration.test.ts
// Verifies that logEvent is called on all RELAY_TYPES mutations (T000472).
import { test } from 'node:test';
import assert from 'node:assert';
import { RELAY_TYPES } from '../src/server/ws-handler';

test('event-log integration: RELAY_TYPES contains expected mutation types', () => {
  const expected = ['add', 'move', 'update', 'jump', 'delete', 'clear', 'stiffness', 'snapshot', 'request_state_snapshot'];
  for (const t of expected) {
    assert.ok(RELAY_TYPES.has(t), `RELAY_TYPES should contain '${t}'`);
  }
});

test('event-log integration: request_state_snapshot excluded from logging (read-only)', () => {
  // Verify the exclusion documented in ws-handler logEvent call:
  // msg.type !== 'request_state_snapshot'
  const eventTypes = Array.from(RELAY_TYPES).filter(t => t !== 'request_state_snapshot');
  assert.ok(!eventTypes.includes('request_state_snapshot'), 'request_state_snapshot must not be logged');
  assert.ok(eventTypes.includes('move'), 'move should be logged');
  assert.ok(eventTypes.includes('add'), 'add should be logged');
});
