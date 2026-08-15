import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  rooms,
} from '../src/server/index';

const { colorForIndex, PARTICIPANT_PALETTE, addParticipant } = rooms;

// D9 — Participant palette extension (>6 distinct colors, no % wrap recycling) +
// maxParticipants persistence (re-affirms D3 merge).

test('colorForIndex returns the curated palette for the first 6', () => {
  for (let i = 0; i < 6; i++) {
    assert.strictEqual(colorForIndex(i), PARTICIPANT_PALETTE[i]);
  }
});

test('colorForIndex past 6 yields distinct, non-recycled colors', () => {
  const colors = [];
  for (let i = 0; i < 12; i++) colors.push(colorForIndex(i));
  // No index 6-11 collides with any index 0-11 (i.e. no `% length` wrap).
  for (let i = 6; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      if (i === j) continue;
      assert.notStrictEqual(colors[i], colors[j], `colorForIndex(${i}) collides with colorForIndex(${j})`);
    }
  }
});

test('addParticipant gives 8 distinct users 8 distinct colors', () => {
  const room = 'palette-d9-add';
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const p = addParticipant(room, { userId: `u${i}`, name: `User ${i}` });
    assert.ok(p, 'participant added');
    seen.add(p!.color);
  }
  assert.strictEqual(seen.size, 8, 'all 8 colors distinct');
});

test('maxParticipants is persisted in lobbySettings (re-affirms D3)', () => {
  const room = 'palette-d9-max';
  applyMutation(room, { type: 'lobby_settings_set', settings: { maxParticipants: 8 } });
  assert.strictEqual(buildStateFromMutations(room).lobbySettings.maxParticipants, 8);
});
