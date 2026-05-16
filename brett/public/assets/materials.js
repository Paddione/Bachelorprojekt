import * as THREE from '../three.min.js';

export const inkBody = new THREE.MeshStandardMaterial({
  color: 0x17202e,
  metalness: 0.55,
  roughness: 0.65,
});

export const brassDetail = new THREE.MeshStandardMaterial({
  color: 0xd7b06a,
  metalness: 0.85,
  roughness: 0.35,
  emissive: 0x4a3814,
  emissiveIntensity: 0.15,
});

export const woodWarm = new THREE.MeshStandardMaterial({
  color: 0x6a4a28,
  roughness: 0.85,
  metalness: 0.05,
});

export const concrete = new THREE.MeshStandardMaterial({
  color: 0x5a5852,
  roughness: 0.95,
  metalness: 0.0,
});

export const edgeBrass = new THREE.LineBasicMaterial({
  color: 0xd7b06a,
  transparent: true,
  opacity: 0.35,
});

// Adds brass EdgesGeometry wireframe to any mesh — the Mentolder editorial signature.
export function applySignature(mesh) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 25);
  mesh.add(new THREE.LineSegments(edges, edgeBrass));
  return mesh;
}
