'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const physics = require('../public/assets/mayhem/physics.js');

test('capsuleCapsule: two vertical capsules that overlap horizontally collide', () => {
  const a = { x: 0, y: 0, z: 0, radius: 0.35, height: 1.8 };
  const b = { x: 0.5, y: 0, z: 0, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.capsuleCapsule(a, b), true);
});

test('capsuleCapsule: capsules 1.0 m apart do not collide', () => {
  const a = { x: 0, y: 0, z: 0, radius: 0.35, height: 1.8 };
  const b = { x: 1.0, y: 0, z: 0, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.capsuleCapsule(a, b), false);
});

test('capsuleCapsule: same xz but vertically offset capsules still collide if heights overlap', () => {
  const a = { x: 0, y: 0,   z: 0, radius: 0.35, height: 1.8 };
  const b = { x: 0, y: 0.5, z: 0, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.capsuleCapsule(a, b), true);
});
