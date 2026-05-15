'use strict';
// Seeded PRNG (mulberry32) — reproducible layout from roomToken across all clients.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashToken(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

// AABB for collision — matches the shapes below.
function makeAABB(x, z, halfW, halfD, h = 2.0) {
  return { minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD, minY: 0, maxY: h };
}

const FIELD_HALF = 9;   // avoid edges ±9 m
const MIN_GAP   = 1.5;  // min separation between obstacle centres

function tooClose(x, z, placed) {
  for (const p of placed) {
    if (Math.hypot(x - p.x, z - p.z) < MIN_GAP) return true;
  }
  return false;
}

function tryPlace(rng, placed, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const x = (rng() * 2 - 1) * FIELD_HALF;
    const z = (rng() * 2 - 1) * FIELD_HALF;
    if (!tooClose(x, z, placed)) return { x, z };
  }
  return null;
}

// Geometry helpers — all return Three.js Mesh + AABB.
function makePillar(THREE, x, z) {
  const geo = new THREE.CylinderGeometry(0.35, 0.35, 3, 8);
  const mat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 1.5, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return { mesh, aabb: makeAABB(x, z, 0.35, 0.35, 3) };
}

function makeCrate(THREE, x, z, rng) {
  const s = 0.7 + rng() * 0.4;
  const geo = new THREE.BoxGeometry(s, s, s);
  const mat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, s / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return { mesh, aabb: makeAABB(x, z, s / 2, s / 2, s) };
}

function makeBarrel(THREE, x, z) {
  const geo = new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10);
  const mat = new THREE.MeshLambertMaterial({ color: 0x4a4a6a });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.45, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return { mesh, aabb: makeAABB(x, z, 0.28, 0.28, 0.9) };
}

function makeLWall(THREE, x, z, rng) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const angle = rng() * Math.PI * 2;
  group.rotation.y = angle;
  const mat = new THREE.MeshLambertMaterial({ color: 0x999999 });
  const segH = 2.2, segT = 0.18;
  const segA = new THREE.Mesh(new THREE.BoxGeometry(2.0, segH, segT), mat);
  segA.position.set(0, segH / 2, 0);
  segA.castShadow = segA.receiveShadow = true;
  const segB = new THREE.Mesh(new THREE.BoxGeometry(segT, segH, 1.5), mat);
  segB.position.set(-1.0, segH / 2, 0.75);
  segB.castShadow = segB.receiveShadow = true;
  group.add(segA, segB);
  // Approximate AABB as a 2.5 × 2.5 square centred on x,z (good enough for player collision)
  return { mesh: group, aabb: makeAABB(x, z, 1.25, 1.25, segH) };
}

const TYPES = ['pillar', 'crate', 'barrel', 'lwall'];

function buildObstacles(THREE, roomToken) {
  const rng = mulberry32(hashToken(roomToken));
  const count = 8 + Math.floor(rng() * 7); // 8..14 obstacles
  const placed = [];
  const obstacles = [];

  for (let i = 0; i < count; i++) {
    const pos = tryPlace(rng, placed);
    if (!pos) continue;
    placed.push(pos);
    const kind = TYPES[Math.floor(rng() * TYPES.length)];
    let obj;
    switch (kind) {
      case 'pillar': obj = makePillar(THREE, pos.x, pos.z); break;
      case 'crate':  obj = makeCrate(THREE, pos.x, pos.z, rng); break;
      case 'barrel': obj = makeBarrel(THREE, pos.x, pos.z); break;
      case 'lwall':  obj = makeLWall(THREE, pos.x, pos.z, rng); break;
    }
    obstacles.push(obj);
  }
  return obstacles; // [{ mesh, aabb }]
}

function addObstaclesToScene(scene, obstacles) {
  for (const o of obstacles) scene.add(o.mesh);
}

function removeObstaclesFromScene(scene, obstacles) {
  for (const o of obstacles) scene.remove(o.mesh);
}

if (typeof window !== 'undefined') {
  window.MayhemObstacles = { buildObstacles, addObstaclesToScene, removeObstaclesFromScene };
}
