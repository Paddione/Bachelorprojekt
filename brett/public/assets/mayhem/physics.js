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

// Slab-method ray-AABB test. Returns true if segment [from→to] is blocked by
// any box in obstacles. Used for AI line-of-sight and AoE range checks.
// obstacles: Array of { minX, maxX, minY, maxY, minZ, maxZ }
function aabbRay(from, to, obstacles) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const lenSq = dx*dx + dy*dy + dz*dz;
  if (lenSq === 0) return false;

  for (const b of obstacles) {
    // Per-axis slab intersect
    let tmin = 0, tmax = 1;
    for (const [o, d, bmin, bmax] of [
      [from.x, dx, b.minX, b.maxX],
      [from.y, dy, b.minY, b.maxY],
      [from.z, dz, b.minZ, b.maxZ],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (o < bmin || o > bmax) { tmin = 1; break; }
      } else {
        const t1 = (bmin - o) / d, t2 = (bmax - o) / d;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      }
    }
    if (tmin <= tmax) return true;
  }
  return false;
}

const api = { capsuleCapsule, aabbCapsule, integrateRagdollRoot, integrateRagdollBone, aabbRay };

// Dual export: CommonJS (for node --test) and window global (for browser).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.MayhemPhysics = api;
}

