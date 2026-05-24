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

const { aabbRay } = require('../public/assets/mayhem/physics.js');

test('aabbRay: clear line of sight returns false (no hit)', () => {
  const from = { x: -5, y: 0.9, z: 0 };
  const to   = { x:  5, y: 0.9, z: 0 };
  const obstacles = [
    { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: 3, maxZ: 5 }   // z-offset — not in path
  ];
  assert.strictEqual(aabbRay(from, to, obstacles), false);
});

test('aabbRay: wall in path returns true (hit)', () => {
  const from = { x: -5, y: 0.9, z: 0 };
  const to   = { x:  5, y: 0.9, z: 0 };
  const obstacles = [
    { minX: -0.5, maxX: 0.5, minY: 0, maxY: 2, minZ: -1, maxZ: 1 }  // center wall
  ];
  assert.strictEqual(aabbRay(from, to, obstacles), true);
});

test('aabbRay: empty obstacle list returns false', () => {
  assert.strictEqual(aabbRay({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, []), false);
});

test('aabbRay: from and to same point returns false', () => {
  const obstacles = [{ minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1 }];
  assert.strictEqual(aabbRay({ x: 0, y: 0.9, z: 0 }, { x: 0, y: 0.9, z: 0 }, obstacles), false);
});

