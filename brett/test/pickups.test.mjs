import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSpawnPosition, canTakePickup } from '../public/assets/combat/pickups.mjs';

test('computeSpawnPosition keeps min distance from players', () => {
  const players = [{ x: 0, y: 0, z: 0 }];
  const pos = computeSpawnPosition({ players, boardRadius: 20, minDist: 5, rng: () => 0.5 });
  const d = Math.hypot(pos.x, pos.z);
  assert.ok(d >= 5, `picked ${d}, expected >= 5`);
});

test('canTakePickup rejects out-of-range', () => {
  const r = canTakePickup({ player: { x: 0, z: 0 }, pickup: { x: 5, z: 0, takeRadius: 1.5 } });
  assert.equal(r, false);
});

test('canTakePickup accepts in-range', () => {
  const r = canTakePickup({ player: { x: 0, z: 0 }, pickup: { x: 1, z: 0, takeRadius: 1.5 } });
  assert.equal(r, true);
});
