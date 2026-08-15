import { test } from 'node:test';
import assert from 'node:assert';
import {
  handleAdminSetTemplate,
  buildStateFromMutations,
} from '../src/server/index';

// D5 — Szenario-Vorlage choice. admin_set_template persists the chosen templateId
// into lobbySettings (survives reload / late-join) and propagates it via
// lobby_settings_change{templateId}. The figure apply is the separate D7
// orchestrator.

test('handleAdminSetTemplate persists templateId and emits lobby_settings_change', () => {
  const room = 'admin-set-template-d5';
  const collected: any[] = [];
  const collect = (m: any) => collected.push(m);

  const res = handleAdminSetTemplate(room, 'tpl-1', collect);
  assert.strictEqual(res.ok, true);

  assert.deepStrictEqual(collected, [{ type: 'lobby_settings_change', templateId: 'tpl-1' }]);
  assert.strictEqual(buildStateFromMutations(room).lobbySettings.templateId, 'tpl-1');
});

test('handleAdminSetTemplate merges templateId without clobbering other settings', () => {
  const room = 'admin-set-template-merge';
  // Pre-existing optik/maxParticipants must survive the templateId set.
  const { applyMutation } = require('../src/server/index');
  applyMutation(room, { type: 'lobby_settings_set', settings: { maxParticipants: 5 } });

  handleAdminSetTemplate(room, 'tpl-2', () => {});
  assert.deepStrictEqual(buildStateFromMutations(room).lobbySettings, {
    maxParticipants: 5,
    templateId: 'tpl-2',
  });
});
