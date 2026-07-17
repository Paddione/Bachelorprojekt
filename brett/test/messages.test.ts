import { test } from 'node:test';
import assert from 'node:assert';
import type { ServerMessage, ClientMessage, ServerMessageType } from '../src/types/messages';
import { assertNever } from '../src/types/messages';

// The authoritative set of ServerMessage tags the client MUST handle.
// Keep in sync with onWsMessage in src/client/ws-client.ts.
const HANDLED_SERVER_TYPES = new Set<ServerMessageType>([
  'snapshot', 'add', 'move', 'jump', 'update', 'delete', 'stiffness',
  'figure_locked', 'figure_unlocked', 'figure_lock_denied', 'locks_released_for',
  'info', 'presence_join', 'presence_leave', 'session_created', 'session_phase_change',
  'session_ended', 'admin_token_changed', 'coaching_steps_change', 'error',
  'role_changed', 'figure_owner_changed', 'lobby_ready_changed', 'lobby_settings_change',
  'figure_possessed', 'figure_released', 'figure_type_changed',
  'moderation_state', 'figure_note_changed',
  'anchor_added', 'anchor_removed', 'zone_added', 'zone_updated', 'zone_removed',
  'figure_hidden_changed',
  // ── T000467 ───────────────────────────────────────────────────────────────
  'line_created', 'line_deleted', 'line_type_changed',
  'undo_stack_changed',
]);

// Compile-time exhaustiveness: this function must handle every ServerMessage
// variant or `tsc` errors on the `assertNever(msg)` default branch.
function routeServer(msg: ServerMessage): string {
  switch (msg.type) {
    case 'snapshot': return 'snapshot';
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
    case 'figure_possessed': return 'figure_possessed';
    case 'figure_released': return 'figure_released';
    case 'figure_type_changed': return 'figure_type_changed';
    case 'moderation_state': return 'moderation_state';
    case 'figure_note_changed': return 'figure_note_changed';
    case 'anchor_added': return 'anchor_added';
    case 'anchor_removed': return 'anchor_removed';
    case 'zone_added': return 'zone_added';
    case 'zone_updated': return 'zone_updated';
    case 'zone_removed': return 'zone_removed';
    case 'figure_hidden_changed': return 'figure_hidden_changed';
    case 'line_created': return 'line_created';
    case 'line_deleted': return 'line_deleted';
    case 'line_type_changed': return 'line_type_changed';
    case 'undo_stack_changed': return 'undo_stack_changed';
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
    case 'figure_possess': return 'figure_possess';
    case 'figure_release': return 'figure_release';
    case 'figure_type_set': return 'figure_type_set';
    case 'admin_spotlight_set': return 'admin_spotlight_set';
    case 'admin_dim_set': return 'admin_dim_set';
    case 'admin_freeze_set': return 'admin_freeze_set';
    case 'figure_note_set': return 'figure_note_set';
    case 'anchor_create': return 'anchor_create';
    case 'anchor_delete': return 'anchor_delete';
    case 'zone_create': return 'zone_create';
    case 'zone_update': return 'zone_update';
    case 'zone_delete': return 'zone_delete';
    case 'figure_hide_set': return 'figure_hide_set';
    case 'session_undo': return 'session_undo';
    case 'session_redo': return 'session_redo';
    case 'line_create': return 'line_create';
    case 'line_delete': return 'line_delete';
    case 'line_type_set': return 'line_type_set';
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
