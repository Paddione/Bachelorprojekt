'use strict';
const test   = require('node:test');
const assert = require('node:assert');
const { GameModeManager, MODES } = require('../public/assets/mayhem/game-mode.js');

test('MODES includes DUEL', () => {
  assert.strictEqual(MODES.DUEL, 'duel');
});

test('setMode duel sets phase hero-select', () => {
  const gmm = new GameModeManager({});
  gmm.setMode('duel');
  assert.strictEqual(gmm.mode, 'duel');
  assert.strictEqual(gmm.phase, 'hero-select');
});

test('startDuelFighting transitions phase to fighting', () => {
  const gmm = new GameModeManager({});
  gmm.setMode('duel');
  gmm.startDuelFighting('p1', 'p2');
  assert.strictEqual(gmm.phase, 'fighting');
  assert.strictEqual(gmm.duelState.playerA, 'p1');
  assert.strictEqual(gmm.duelState.playerB, 'p2');
});

test('handleDuelDeath increments winner wins', () => {
  const results = [];
  const gmm = new GameModeManager({ onDuelEnd: r => results.push(r) });
  gmm.setMode('duel');
  gmm.startDuelFighting('p1', 'p2');
  const r1 = gmm.handleDuelDeath('p1'); // p2 wins round
  assert.strictEqual(r1.roundWinner, 'p2');
  assert.strictEqual(r1.matchOver, false);
  assert.strictEqual(gmm.duelState.winsB, 1);
});

test('handleDuelDeath triggers onDuelEnd after 2 wins (best-of-3)', () => {
  const results = [];
  const gmm = new GameModeManager({ onDuelEnd: r => results.push(r) });
  gmm.setMode('duel');
  gmm.startDuelFighting('p1', 'p2');
  gmm.handleDuelDeath('p1'); // p2 wins round 1
  gmm.startDuelFighting('p1', 'p2'); // round 2
  gmm.handleDuelDeath('p1'); // p2 wins round 2 → match over
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].matchWinner, 'p2');
});

test('setMode resets duelState', () => {
  const gmm = new GameModeManager({});
  gmm.setMode('duel');
  gmm.startDuelFighting('p1', 'p2');
  gmm.handleDuelDeath('p1');
  gmm.setMode('warmup');
  gmm.setMode('duel');
  assert.strictEqual(gmm.duelState.winsA, 0);
  assert.strictEqual(gmm.duelState.winsB, 0);
});
