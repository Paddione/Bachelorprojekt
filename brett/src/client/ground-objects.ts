// brett/src/client/ground-objects.ts — T000468
// 3D-Rendering von Boden-Ankern und Zonen.
// DARK-LAUNCH: Wird von board-boot.ts und ws-client.ts nur aufgerufen, wenn
// window.__brettFeatures['t000468-ground-anchors'] gesetzt ist.

import * as THREE from 'three';
import type { Anchor, Zone } from '../types/state';
import { STATE, getScene, getWs, isWsReady } from './state';

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
  STATE.anchors.push(anchor);
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
  const aIdx = STATE.anchors.findIndex(a => a.id === anchorId);
  if (aIdx !== -1) STATE.anchors.splice(aIdx, 1);
}

// ── Zone-Rendering ────────────────────────────────────────────────────────────

export function applyZoneAdded(zone: Zone): void {
  if (zoneMeshes.has(zone.id)) return; // Duplikat-Guard
  const { scene } = getScene();
  const group = new THREE.Group();
  group.position.set(zone.x, 0, zone.z);
  // E1: Live-Zone-Daten am Group hinterlegen, damit der Zonen-Editor sie beim
  // Raycast-Treffer direkt auslesen kann.
  group.userData.zone = zone;

  const color  = zone.color   ?? '#4ea1ff';
  const opacity = zone.opacity ?? 0.25;
  // E1: 'frame' rendert NUR die Umrandung (verschiebbarer Rahmen) — keine Fläche.
  const isFrame = zone.variant === 'frame';

  // Flächen-Mesh (bei 'frame' übersprungen)
  if (!isFrame) {
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
  }

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
    // 'frame' braucht eine kräftige Umrandung (keine Füllung), sonst wie gehabt.
    opacity: isFrame ? 0.9 : Math.min(1, opacity * 2.5),
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
  STATE.zones.push(zone);
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
  const zIdx = STATE.zones.findIndex(z => z.id === zoneId);
  if (zIdx !== -1) STATE.zones.splice(zIdx, 1);
}

/**
 * E1 — Zone verschieben/skalieren/umstylen. Idempotent: das bestehende Mesh
 * wird entsorgt und mit den neuen Zone-Daten neu aufgebaut (Position, Größe,
 * Label, Opacity, variant). No-op, falls die Zone (noch) nicht gerendert ist.
 */
export function applyZoneUpdated(zone: Zone): void {
  if (zoneMeshes.has(zone.id)) {
    applyZoneRemoved(zone.id);
  }
  applyZoneAdded(zone);
}

// ── Snapshot-Initialisierung ──────────────────────────────────────────────────

/**
 * Beim Beitreten eines Raums: alle vorhandenen Anker und Zonen aus dem
 * Server-Snapshot in die Szene rendern. Bestehende Meshes werden zuerst
 * entfernt (idempotent bei reconnect).
 */
export function initGroundObjectsFromSnapshot(anchors: Anchor[], zones: Zone[]): void {
  // Cleanup bestehender Meshes (entfernt parallel aus STATE.anchors/zones)
  for (const [id] of anchorMeshes) applyAnchorRemoved(id);
  for (const [id] of zoneMeshes)   applyZoneRemoved(id);
  // Defensive: Arrays hart zurücksetzen, falls Mesh-Map/Array divergierten
  STATE.anchors.length = 0;
  STATE.zones.length = 0;

  // Neu rendern (push'd parallel in STATE.anchors/zones)
  for (const anchor of anchors) applyAnchorAdded(anchor);
  for (const zone   of zones)   applyZoneAdded(zone);
}

// ── Admin-Toolbar ─────────────────────────────────────────────────────────────

/**
 * Erstellt die Admin-Toolbar für Anker & Zonen (T000468).
 * Nur für Admins sichtbar (prüft __brettCurrentUserIsAdmin).
 */
export function initGroundObjectsToolbar(
  renderer: { domElement: HTMLElement },
  sceneApi: any,
  camera: any,
  raycaster: any,
  mannequin: { setNdc: (e: MouseEvent) => void; getTickRefs: () => { ndc: any } },
): void {
  if (!(window as any).__brettCurrentUserIsAdmin) return;

  const toolbar = document.createElement('div');
  toolbar.id = 'ground-objects-toolbar';
  Object.assign(toolbar.style, {
    position: 'absolute',
    bottom: '96px',
    right: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    zIndex: '20',
  });

  // Anker-Button
  const anchorBtn = document.createElement('button');
  anchorBtn.textContent = '⚓ Anker';
  anchorBtn.title = 'Boden-Anker setzen (Klick auf Boden)';
  Object.assign(anchorBtn.style, {
    fontFamily: 'var(--brett-font-mono, monospace)',
    fontSize: '10px',
    padding: '6px 10px',
    background: 'rgba(200,169,110,0.15)',
    border: '1px solid rgba(200,169,110,0.4)',
    color: 'var(--brett-brass, #c8a96e)',
    borderRadius: 'var(--brett-radius-sm, 8px)',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  });

  let anchorPlacingMode = false;
  anchorBtn.addEventListener('click', () => {
    anchorPlacingMode = !anchorPlacingMode;
    anchorBtn.style.background = anchorPlacingMode
      ? 'rgba(200,169,110,0.35)' : 'rgba(200,169,110,0.15)';
    anchorBtn.title = anchorPlacingMode
      ? 'Klicke auf den Boden, um einen Anker zu setzen (Esc abbrechen)'
      : 'Boden-Anker setzen';
    (window as any).__brettAnchorPlacing = anchorPlacingMode;
  });

  document.addEventListener('brett:anchor-placed', () => {
    anchorPlacingMode = false;
    anchorBtn.style.background = 'rgba(200,169,110,0.15)';
    anchorBtn.title = 'Boden-Anker setzen';
  });

  // Zonen-Button
  const zoneBtn = document.createElement('button');
  zoneBtn.textContent = '▭ Zone';
  zoneBtn.title = 'Bodenzone zeichnen';
  Object.assign(zoneBtn.style, {
    fontFamily: 'var(--brett-font-mono, monospace)',
    fontSize: '10px',
    padding: '6px 10px',
    background: 'rgba(78,161,255,0.15)',
    border: '1px solid rgba(78,161,255,0.4)',
    color: 'var(--brett-blue, #4ea1ff)',
    borderRadius: 'var(--brett-radius-sm, 8px)',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  });

  let zonePlacingMode = false;
  zoneBtn.addEventListener('click', () => {
    zonePlacingMode = !zonePlacingMode;
    zoneBtn.style.background = zonePlacingMode
      ? 'rgba(78,161,255,0.35)' : 'rgba(78,161,255,0.15)';
    (window as any).__brettZonePlacing = zonePlacingMode;
  });

  toolbar.appendChild(anchorBtn);
  toolbar.appendChild(zoneBtn);
  document.body.appendChild(toolbar);

  // Floor-click for anchor placement (wired into existing click handler)
  renderer.domElement.addEventListener('click', (e) => {
    if (!(window as any).__brettAnchorPlacing) return;
    const { floor } = sceneApi as any;
    if (!floor) return;
    mannequin.setNdc(e);
    const { ndc } = mannequin.getTickRefs();
    if (!ndc) return;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(floor);
    if (hits.length > 0) {
      const pt = hits[0].point;
      const ws = getWs();
      if (isWsReady() && ws) {
        ws.send(JSON.stringify({
          type: 'anchor_create',
          anchor: { x: Math.round(pt.x * 10) / 10, z: Math.round(pt.z * 10) / 10 },
        }));
      }
      (window as any).__brettAnchorPlacing = false;
      document.dispatchEvent(new CustomEvent('brett:anchor-placed'));
    }
  }, { capture: true });
}
