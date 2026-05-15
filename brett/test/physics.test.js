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

test('aabbCapsule: capsule inside AABB collides', () => {
  const box = { minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: -1, maxZ: 1 };
  const cap = { x: 0, y: 0, z: 0, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.aabbCapsule(box, cap), true);
});

test('aabbCapsule: capsule far from AABB does not collide', () => {
  const box = { minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: -1, maxZ: 1 };
  const cap = { x: 5, y: 0, z: 5, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.aabbCapsule(box, cap), false);
});

test('aabbCapsule: capsule touching corner within radius collides', () => {
  const box = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };
  const cap = { x: 1.2, y: 0, z: 1.2, radius: 0.35, height: 1.8 };
  assert.strictEqual(physics.aabbCapsule(box, cap), true);
});

test('integrateRagdollRoot: applies gravity and integrates y', () => {
  const root = { y: 2.0, vy: 0 };
  physics.integrateRagdollRoot(root, 0.1);
  assert.ok(root.vy < 0, 'vy should be negative after gravity');
  assert.ok(root.y < 2.0, 'y should decrease');
});

test('integrateRagdollRoot: clamps y at ground and zeroes vy', () => {
  const root = { y: 0.0, vy: -5.0 };
  physics.integrateRagdollRoot(root, 0.1);
  assert.strictEqual(root.y, 0);
  assert.strictEqual(root.vy, 0);
});

test('integrateRagdollBone: damps velocity and integrates rotation', () => {
  const bone = { velocity: { x: 1.0, z: 0.5 }, currentRot: { x: 0, z: 0 } };
  physics.integrateRagdollBone(bone, 0.016);
  assert.ok(bone.velocity.x < 1.0, 'velocity should damp');
  assert.ok(bone.currentRot.x !== 0, 'rotation should integrate');
});
