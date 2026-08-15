// brett/test/topbar-participants.test.ts
// Offline-safe: tests the pure roster-row derivation + role-assign message builder.
import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildParticipantRows,
  buildAssignRoleMessage,
  ROLE_OPTIONS,
} from '../src/client/ui/topbar-participants';
import { createLobbyState, type LobbyState } from '../src/client/lobby-store';

function seed(): LobbyState {
  return {
    ...createLobbyState(),
    phase: 'active',
    sessionCode: 'KRB-9A2',
    roster: {
      u1: { userId: 'u1', name: 'Anna', color: '#4ea1ff', role: 'leiter', ready: true },
      u2: { userId: 'u2', name: 'Ben', color: '#3fb950', role: 'beobachter', ready: false },
    },
  };
}

test('buildParticipantRows: maps roster into ordered rows with name/color/role', () => {
  const rows = buildParticipantRows(seed());
  assert.strictEqual(rows.length, 2);
  const anna = rows.find((r) => r.userId === 'u1')!;
  assert.strictEqual(anna.name, 'Anna');
  assert.strictEqual(anna.color, '#4ea1ff');
  assert.strictEqual(anna.role, 'leiter');
});

test('buildParticipantRows: empty roster yields no rows', () => {
  assert.deepStrictEqual(buildParticipantRows(createLobbyState()), []);
});

test('ROLE_OPTIONS: offers beobachter and stellvertreter for assignment', () => {
  assert.deepStrictEqual(ROLE_OPTIONS.map((o) => o.value), ['beobachter', 'stellvertreter']);
});

test('buildAssignRoleMessage: builds the admin_assign_role protocol message', () => {
  assert.deepStrictEqual(
    buildAssignRoleMessage('u2', 'stellvertreter'),
    { type: 'admin_assign_role', targetPlayerId: 'u2', role: 'stellvertreter' },
  );
});
