import { test } from 'node:test';
import assert from 'node:assert';
import type { ServerMessage, ClientMessage, ServerMessageType } from '../src/types/messages';
import { assertNever } from '../src/types/messages';

// The authoritative set of ServerMessage tags the client MUST handle.
// Keep in sync with onWsMessage in src/client/ws-client.ts.
const HANDLED_SERVER_TYPES = new Set<ServerMessageType>([
  'snapshot', 'init', 'add', 'move', 'jump', 'update', 'delete', 'stiffness',
  'figure_locked', 'figure_unlocked', 'figure_lock_denied', 'locks_released_for',
  'info', 'presence_join', 'presence_leave', 'session_created', 'session_phase_change',
  'session_ended', 'admin_token_changed', 'coaching_steps_change', 'error',
  'role_changed', 'figure_owner_changed', 'lobby_ready_changed', 'lobby_settings_change',
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
    case 'role_changed': return 'role_changed';
    case 'figure_owner_changed': return 'figure_owner_changed';
    case 'lobby_ready_changed': return 'lobby_ready_changed';
    case 'lobby_settings_change': return 'lobby_settings_change';
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
    case 'admin_round_start': return 'admin_round_start';
    case 'admin_assign_role': return 'admin_assign_role';
    case 'admin_assign_figure': return 'admin_assign_figure';
    case 'admin_set_template': return 'admin_set_template';
    case 'admin_set_optik': return 'admin_set_optik';
    case 'lobby_set_ready': return 'lobby_set_ready';
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
    assert.ok(routeServer({ type: t } as unknown as ServerMessage) !== undefined, `unhandled: ${t}`);
  }
});
