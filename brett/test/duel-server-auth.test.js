'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { spawn } = require('node:child_process');

let server;
let port;

test.before(async () => {
  port = 13000 + Math.floor(Math.random() * 1000);
  server = spawn('node', ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: port, DATABASE_URL: 'postgres://invalid', MOCK_DB: 'true' },
    stdio: 'pipe',
  });
  await new Promise(r => setTimeout(r, 1500)); // server start
});

test.after(() => { if (server) server.kill(); });

test('server broadcasts duel_round_end on player_death in duel mode', async () => {
  const room = 'test-' + Date.now();
  const wsA = new WebSocket(`ws://localhost:${port}/sync`);
  const wsB = new WebSocket(`ws://localhost:${port}/sync`);
  const wsSpec = new WebSocket(`ws://localhost:${port}/sync`);

  await Promise.all([wsA, wsB, wsSpec].map(ws =>
    new Promise(r => ws.on('open', r))));

  for (const ws of [wsA, wsB, wsSpec]) ws.send(JSON.stringify({ type: 'join', room }));
  await new Promise(r => setTimeout(r, 100));

  wsA.send(JSON.stringify({ type: 'player_join', playerId: 'A' }));
  wsB.send(JSON.stringify({ type: 'player_join', playerId: 'B' }));
  wsA.send(JSON.stringify({ type: 'game_mode_change', mode: 'duel' }));
  wsA.send(JSON.stringify({ type: 'duel_start', playerA: 'A', playerB: 'B' }));
  await new Promise(r => setTimeout(r, 100));

  const events = [];
  wsSpec.on('message', m => events.push(JSON.parse(m.toString())));

  wsA.send(JSON.stringify({ type: 'player_death', playerId: 'A' }));
  await new Promise(r => setTimeout(r, 200));

  const roundEnd = events.find(e => e.type === 'duel_round_end');
  assert.ok(roundEnd, 'expected server to broadcast duel_round_end');
  assert.equal(roundEnd.winner, 'B');
  assert.equal(roundEnd.winsB, 1);
  assert.equal(roundEnd.winsA, 0);

  for (const ws of [wsA, wsB, wsSpec]) ws.close();
});

test('server broadcasts duel_reset when both fighters request rematch', async () => {
  const room = 'test-' + Date.now();
  const wsA = new WebSocket(`ws://localhost:${port}/sync`);
  const wsB = new WebSocket(`ws://localhost:${port}/sync`);

  await Promise.all([wsA, wsB].map(ws => new Promise(r => ws.on('open', r))));
  for (const ws of [wsA, wsB]) ws.send(JSON.stringify({ type: 'join', room }));
  await new Promise(r => setTimeout(r, 100));

  wsA.send(JSON.stringify({ type: 'player_join', playerId: 'A' }));
  wsB.send(JSON.stringify({ type: 'player_join', playerId: 'B' }));
  wsA.send(JSON.stringify({ type: 'game_mode_change', mode: 'duel' }));
  wsA.send(JSON.stringify({ type: 'duel_start', playerA: 'A', playerB: 'B' }));

  // Kill A twice → match ends with B winning 2-0
  wsA.send(JSON.stringify({ type: 'player_death', playerId: 'A' }));
  await new Promise(r => setTimeout(r, 100));
  wsA.send(JSON.stringify({ type: 'player_death', playerId: 'A' }));
  await new Promise(r => setTimeout(r, 100));

  const events = [];
  wsA.on('message', m => events.push(JSON.parse(m.toString())));

  wsA.send(JSON.stringify({ type: 'rematch_request', sameHeroes: true }));
  wsB.send(JSON.stringify({ type: 'rematch_request', sameHeroes: true }));
  await new Promise(r => setTimeout(r, 200));

  const reset = events.find(e => e.type === 'duel_reset');
  assert.ok(reset, 'expected duel_reset after both rematch_requests');
  assert.equal(reset.mode, 'same');

  for (const ws of [wsA, wsB]) ws.close();
});
