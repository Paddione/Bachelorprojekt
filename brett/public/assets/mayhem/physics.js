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

const api = { capsuleCapsule };

// Dual export: CommonJS (for node --test) and window global (for browser).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.MayhemPhysics = api;
}
