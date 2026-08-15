// brett/test/lobby-render.test.ts — Phase B / B16 (pure render-model, no jsdom)
import { test } from 'node:test';
import assert from 'node:assert';
import { buildLobbyViewModel } from '../src/client/ui/lobby';
import { createLobbyState, type LobbyState } from '../src/client/lobby-store';

function seed(): LobbyState {
  return {
    ...createLobbyState(),
    phase: 'lobby',
    sessionCode: 'KRB-9A2',
    roster: {
      u1: { userId: 'u1', name: 'Anna', color: '#4ea1ff', role: 'leiter', ready: true },
      u2: { userId: 'u2', name: 'Ben', color: '#3fb950', role: 'stellvertreter', ready: true },
      u3: { userId: 'u3', name: 'Cem', color: '#f0a35e', role: 'stellvertreter', ready: false },
      u4: { userId: 'u4', name: 'Dana', color: '#c06be0', role: 'beobachter' },
    },
  };
}

test('buildLobbyViewModel: leader gets canStart=true + Runde starten label', () => {
  const vm = buildLobbyViewModel(seed(), { isLeader: true });
  assert.strictEqual(vm.canStart, true);
  assert.strictEqual(vm.startLabel, 'Runde starten');
  assert.strictEqual(vm.sessionCode, 'KRB-9A2');
});

test('buildLobbyViewModel: readyCount counts ready participants', () => {
  const vm = buildLobbyViewModel(seed(), { isLeader: true });
  assert.strictEqual(vm.readyCount, 2);
  assert.strictEqual(vm.rows.length, 4);
});

test('buildLobbyViewModel: rows carry name/role/ready', () => {
  const vm = buildLobbyViewModel(seed(), { isLeader: true });
  const ben = vm.rows.find((r) => r.userId === 'u2');
  assert.ok(ben);
  assert.strictEqual(ben.name, 'Ben');
  assert.strictEqual(ben.role, 'stellvertreter');
  assert.strictEqual(ben.ready, true);
});

test('buildLobbyViewModel: non-leader cannot start + has a Bereit toggle', () => {
  const vm = buildLobbyViewModel(seed(), { isLeader: false });
  assert.strictEqual(vm.canStart, false);
  assert.strictEqual(vm.showReadyToggle, true);
});

test('buildLobbyViewModel: importable under node (no DOM at module load)', () => {
  assert.strictEqual(typeof buildLobbyViewModel, 'function');
});

test('buildLobbyViewModel: leader gets editable settings', () => {
  const vm = buildLobbyViewModel(seed(), { isLeader: true });
  assert.strictEqual(vm.settings.editable, true);
});

test('buildLobbyViewModel: non-leader gets read-only settings', () => {
  const vm = buildLobbyViewModel(seed(), { isLeader: false });
  assert.strictEqual(vm.settings.editable, false);
});

test('buildLobbyViewModel: settings expose raw optik for controls', () => {
  const s: LobbyState = { ...seed(), settings: { templateId: 't1', optik: { sky: 'dusk', lightMood: 'warm' } } };
  const vm = buildLobbyViewModel(s, { isLeader: true });
  assert.strictEqual(vm.settings.optik?.sky, 'dusk');
  assert.strictEqual(vm.settings.optik?.lightMood, 'warm');
});
