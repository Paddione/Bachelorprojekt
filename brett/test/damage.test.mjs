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
