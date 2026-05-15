'use strict';

// Capsule = vertical cylinder from (x, y, z) to (x, y+height, z) with given radius.
// Two capsules collide if the closest distance between their vertical segments is < r1+r2.
function capsuleCapsule(a, b) {
  // y-overlap check
  const aTop = a.y + a.height;
  const bTop = b.y + b.height;
  const yOverlap = Math.max(0, Math.min(aTop, bTop) - Math.max(a.y, b.y));
  if (yOverlap <= 0) return false;
  // horizontal distance
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const distSq = dx * dx + dz * dz;
  const r = a.radius + b.radius;
  return distSq < r * r;
}

function aabbCapsule(box, cap) {
  const capTop = cap.y + cap.height;
  // y overlap
  if (capTop < box.minY || cap.y > box.maxY) return false;
  // closest point on box footprint to capsule center line (xz plane)
  const cx = Math.max(box.minX, Math.min(cap.x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(cap.z, box.maxZ));
  const dx = cap.x - cx;
  const dz = cap.z - cz;
  return (dx * dx + dz * dz) < (cap.radius * cap.radius);
}

function integrateRagdollRoot(root, dt) {
  root.vy -= 9.8 * dt;
  root.y += root.vy * dt;
  if (root.y < 0) { root.y = 0; root.vy = 0; }
}

function integrateRagdollBone(bone, dt) {
  bone.velocity.x *= 0.85;
  bone.velocity.z *= 0.85;
  bone.currentRot.x += bone.velocity.x * dt;
  bone.currentRot.z += bone.velocity.z * dt;
}

const api = { capsuleCapsule, aabbCapsule, integrateRagdollRoot, integrateRagdollBone };

// Dual export: CommonJS (for node --test) and window global (for browser).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.MayhemPhysics = api;
}
