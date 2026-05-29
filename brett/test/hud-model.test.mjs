// brett/test/hud-model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHudModel } from '../public/assets/coaching/hud-model.mjs';

test('builds phase line + participant rows; coach sees controls', () => {
  const m = buildHudModel({
    steps: ['Aufstellen', 'Wahrnehmen'], index: 1,
    participants: [{ userId: 'u1', name: 'Coach', color: '#fff' }],
    isAdmin: true,
  });
  assert.equal(m.phaseLabel, 'Wahrnehmen');
  assert.equal(m.phaseProgress, '2 / 2');
  assert.equal(m.showControls, true);
  assert.equal(m.participants.length, 1);
});

test('non-admin hides controls; empty steps yields a placeholder', () => {
  const m = buildHudModel({ steps: [], index: 0, participants: [], isAdmin: false });
  assert.equal(m.showControls, false);
  assert.equal(m.phaseLabel, '—');
  assert.equal(m.phaseProgress, '0 / 0');
});
