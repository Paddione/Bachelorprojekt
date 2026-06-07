// brett/src/client/ground-objects.ts — T000468
// 3D-Rendering von Boden-Ankern und Zonen.
// DARK-LAUNCH: Wird von board-boot.ts und ws-client.ts nur aufgerufen, wenn
// window.__brettFeatures['t000468-ground-anchors'] gesetzt ist.

import * as THREE from 'three';
import type { Anchor, Zone } from '../types/state';
import { getScene } from './state';

// Mesh-Maps: anchorId / zoneId → THREE.Group (enthält Mesh + optionalen Sprite)
export const anchorMeshes = new Map<string, THREE.Group>();
export const zoneMeshes   = new Map<string, THREE.Group>();

// ── Hilfsfunktion: Label-Sprite ───────────────────────────────────────────────

function makeLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas  = document.createElement('canvas');
  canvas.width  = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(10,14,24,0.72)';
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(2, 2, 252, 60, 10);
  } else {
    ctx.rect(2, 2, 252, 60);
  }
  ctx.fill();
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = color || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.4, 0.35, 1);
  return sprite;
}

function disposeSprite(sprite: THREE.Sprite): void {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

function disposeGroup(g: THREE.Group): void {
  g.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      m.geometry?.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mt) => mt.dispose());
      } else {
        (m.material as THREE.Material)?.dispose();
      }
    }
    if ((obj as THREE.Sprite).isSprite) {
      disposeSprite(obj as THREE.Sprite);
    }
  });
}

// ── Anchor-Rendering ──────────────────────────────────────────────────────────

export function applyAnchorAdded(anchor: Anchor): void {
  if (anchorMeshes.has(anchor.id)) return; // Duplikat-Guard
  const { scene } = getScene();
  const group = new THREE.Group();
  group.position.set(anchor.x, 0, anchor.z);

  // Kegelförmiger Marker (Basis breit, oben schmal)
  const geo = new THREE.CylinderGeometry(0.04, 0.14, 0.22, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: anchor.color ?? '#c8a96e',
    roughness: 0.6,
    metalness: 0.2,
    emissive: anchor.color ?? '#c8a96e',
    emissiveIntensity: 0.18,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.11; // leicht über dem Boden
  group.add(mesh);

  // Kleiner Leuchtring am Boden
  const ringGeo = new THREE.RingGeometry(0.18, 0.24, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: anchor.color ?? '#c8a96e',
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  group.add(ring);

  // Label (falls vorhanden)
  if (anchor.label) {
    const sprite = makeLabelSprite(anchor.label, anchor.color ?? '#c8a96e');
    sprite.position.set(0, 0.7, 0);
    group.add(sprite);
  }

  scene.add(group);
  anchorMeshes.set(anchor.id, group);
}

export function applyAnchorRemoved(anchorId: string): void {
  const group = anchorMeshes.get(anchorId);
  if (!group) return;
  try {
    const { scene } = getScene();
    scene.remove(group);
  } catch { /* scene nicht initialisiert */ }
  disposeGroup(group);
  anchorMeshes.delete(anchorId);
}

// ── Zone-Rendering ────────────────────────────────────────────────────────────

export function applyZoneAdded(zone: Zone): void {
  if (zoneMeshes.has(zone.id)) return; // Duplikat-Guard
  const { scene } = getScene();
  const group = new THREE.Group();
  group.position.set(zone.x, 0, zone.z);

  const color  = zone.color   ?? '#4ea1ff';
  const opacity = zone.opacity ?? 0.25;

  // Flächen-Mesh
  let geo: THREE.BufferGeometry;
  if (zone.shape === 'circle') {
    geo = new THREE.CircleGeometry(zone.radius ?? 1.5, 48);
  } else {
    geo = new THREE.PlaneGeometry(zone.width ?? 2.0, zone.height ?? 2.0);
  }
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.003; // leicht über dem Boden, unter Ankern
  group.add(mesh);

  // Rand-Outline
  let outlineGeo: THREE.BufferGeometry;
  if (zone.shape === 'circle') {
    const r = zone.radius ?? 1.5;
    const segments = 48;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
    }
    outlineGeo = new THREE.BufferGeometry().setFromPoints(pts);
  } else {
    const w2 = (zone.width ?? 2.0) / 2;
    const h2 = (zone.height ?? 2.0) / 2;
    const corners = [
      new THREE.Vector3(-w2, 0, -h2),
      new THREE.Vector3( w2, 0, -h2),
      new THREE.Vector3( w2, 0,  h2),
      new THREE.Vector3(-w2, 0,  h2),
      new THREE.Vector3(-w2, 0, -h2),
    ];
    outlineGeo = new THREE.BufferGeometry().setFromPoints(corners);
  }
  const outlineMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: Math.min(1, opacity * 2.5),
  });
  const outline = new THREE.Line(outlineGeo, outlineMat);
  outline.position.y = 0.004;
  group.add(outline);

  // Label (falls vorhanden)
  if (zone.label) {
    const sprite = makeLabelSprite(zone.label, color);
    sprite.position.set(0, 0.4, 0);
    group.add(sprite);
  }

  scene.add(group);
  zoneMeshes.set(zone.id, group);
}

export function applyZoneRemoved(zoneId: string): void {
  const group = zoneMeshes.get(zoneId);
  if (!group) return;
  try {
    const { scene } = getScene();
    scene.remove(group);
  } catch { /* scene nicht initialisiert */ }
  disposeGroup(group);
  zoneMeshes.delete(zoneId);
}

// ── Snapshot-Initialisierung ──────────────────────────────────────────────────

/**
 * Beim Beitreten eines Raums: alle vorhandenen Anker und Zonen aus dem
 * Server-Snapshot in die Szene rendern. Bestehende Meshes werden zuerst
 * entfernt (idempotent bei reconnect).
 */
export function initGroundObjectsFromSnapshot(anchors: Anchor[], zones: Zone[]): void {
  // Cleanup bestehender Meshes
  for (const [id] of anchorMeshes) applyAnchorRemoved(id);
  for (const [id] of zoneMeshes)   applyZoneRemoved(id);

  // Neu rendern
  for (const anchor of anchors) applyAnchorAdded(anchor);
  for (const zone   of zones)   applyZoneAdded(zone);
}
