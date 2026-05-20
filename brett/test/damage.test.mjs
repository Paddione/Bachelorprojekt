import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDamageEvent, applyDamage } from '../public/assets/combat/damage.mjs';
import { WEAPONS } from '../public/assets/combat/weapons.mjs';

test('applyDamage reduces HP', () => {
  const victim = { hp: 100 };
  applyDamage(victim, WEAPONS.handgun.dmg);
  assert.equal(victim.hp, 75);
});

test('applyDamage clamps at 0', () => {
  const v = { hp: 10 };
  applyDamage(v, 999);
  assert.equal(v.hp, 0);
});

test('validateDamageEvent rejects unknown weapon', () => {
  const r = validateDamageEvent({ weapon: 'nuke', shooter: { hp: 50, lastShotAt: 0 }, victim: { hp: 100, x: 0, y: 0, z: 0 }, shooterPos: { x:0,y:0,z:1 }, now: 1000 });
  assert.equal(r.ok, false);
});

test('validateDamageEvent rejects shooter on cooldown', () => {
  const r = validateDamageEvent({
    weapon: 'handgun',
    shooter: { hp: 50, lastShotAt: 900 },
    victim: { hp: 100, x: 0, y: 0, z: 0 },
    shooterPos: { x: 0, y: 0, z: 1 },
    now: 1000,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /cooldown/);
});

test('validateDamageEvent rejects out-of-range melee', () => {
  const r = validateDamageEvent({
    weapon: 'club',
    shooter: { hp: 50, lastShotAt: 0 },
    victim: { hp: 100, x: 0, y: 0, z: 0 },
    shooterPos: { x: 10, y: 0, z: 0 },
    now: 10000,
  });
  assert.equal(r.ok, false);
});

import { sweepArcContains } from '../public/assets/combat/damage.mjs';

test('sweepArcContains — target directly ahead is in arc', () => {
  const result = sweepArcContains({
    selfX: 0, selfZ: 0,
    targetX: 0, targetZ: -1,
    facingX: 0, facingZ: -1,
    arcDeg: 90,
  });
  assert.equal(result, true);
});

test('sweepArcContains — target at 91° is outside 89° arc', () => {
  const result = sweepArcContains({
    selfX: 0, selfZ: 0,
    targetX: -1, targetZ: 0,
    facingX: 0, facingZ: -1,
    arcDeg: 89,
  });
  assert.equal(result, false);
});

test('sweepArcContains — target exactly at half-arc boundary is inside', () => {
  const halfRad = (45 * Math.PI) / 180;
  const result = sweepArcContains({
    selfX: 0, selfZ: 0,
    targetX: Math.sin(halfRad), targetZ: -Math.cos(halfRad),
    facingX: 0, facingZ: -1,
    arcDeg: 90,
  });
  assert.equal(result, true);
});

test('sweepArcContains — target directly behind is outside arc', () => {
  const result = sweepArcContains({
    selfX: 0, selfZ: 0,
    targetX: 0, targetZ: 1,
    facingX: 0, facingZ: -1,
    arcDeg: 90,
  });
  assert.equal(result, false);
});

import { startBurnTimer, BURN_TICK_MS } from '../public/assets/combat/damage.mjs';

test('startBurnTimer fires expected number of ticks', async () => {
  const ticks = [];
  const durMs = BURN_TICK_MS * 3;
  startBurnTimer(durMs, (i) => ticks.push(i));
  await new Promise(res => setTimeout(res, durMs + BURN_TICK_MS));
  assert.equal(ticks.length, 3);
});

test('startBurnTimer tick index starts at 1', async () => {
  const ticks = [];
  startBurnTimer(BURN_TICK_MS * 2, (i) => ticks.push(i));
  await new Promise(res => setTimeout(res, BURN_TICK_MS * 2 + BURN_TICK_MS));
  assert.equal(ticks[0], 1);
  assert.equal(ticks[1], 2);
});

test('startBurnTimer returns cancelable id', async () => {
  const ticks = [];
  const id = startBurnTimer(BURN_TICK_MS * 5, (i) => ticks.push(i));
  clearInterval(id);
  await new Promise(res => setTimeout(res, BURN_TICK_MS * 3));
  assert.equal(ticks.length, 0);
});
