// brett/src/client/view-cone.ts — E6 Blickwinkelanzeiger (Sichtkegel).
// Flacher ~60°-Sektor am Fuß jeder Figur, ausgerichtet nach `figure.facingY`.
// Rein client-lokal (kein Server-State); Topbar-Toggle steuert die Sichtbarkeit.
import * as THREE from 'three';
import { getScene } from './state';

const cones = new Map<string, THREE.Group>();
let enabled = true;

const CONE_ANGLE = Math.PI / 3; // 60°
const CONE_RADIUS = 1.5;
const CONE_OPACITY = 0.25;

function buildCone(color: string): THREE.Group {
  // Sektor zentriert um +Y in der XY-Ebene; nach rotation.x = -PI/2 zeigt er in
  // der Welt nach -Z — also in die Blickrichtung der Figur bei facingY = 0.
  const geo = new THREE.CircleGeometry(CONE_RADIUS, 24, Math.PI / 2 - CONE_ANGLE / 2, CONE_ANGLE);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: CONE_OPACITY, side: THREE.DoubleSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/** Erzeugt/aktualisiert den Sichtkegel einer Figur (Position, Ausrichtung, Farbe). */
export function updateCone(figure: any): void {
  if (!figure?.root) return;
  if (!enabled) { removeCone(figure.id); return; }
  const { scene } = getScene();
  let group = cones.get(figure.id);
  if (!group) {
    group = buildCone(figure.color || '#c8a96e');
    scene.add(group);
    cones.set(figure.id, group);
  }
  group.position.set(figure.root.position.x, 0.006, figure.root.position.z);
  group.rotation.y = figure.facingY ?? figure.root.rotation?.y ?? 0;
  const mesh = group.children[0] as THREE.Mesh;
  const mat = mesh?.material as THREE.MeshBasicMaterial | undefined;
  if (mat && figure.color) mat.color.set(figure.color);
}

export function removeCone(id: string): void {
  const group = cones.get(id);
  if (!group) return;
  try { getScene().scene.remove(group); } catch { /* pre-scene */ }
  group.traverse((o: any) => {
    if (o.isMesh) { o.geometry?.dispose(); (o.material as THREE.Material)?.dispose?.(); }
  });
  cones.delete(id);
}

/** Schaltet alle Sichtkegel an/aus. Beim Ausschalten werden Meshes entsorgt. */
export function setEnabled(on: boolean): void {
  enabled = on;
  if (!on) {
    for (const id of [...cones.keys()]) removeCone(id);
  }
}

export function isEnabled(): boolean {
  return enabled;
}

/**
 * Bei ausgeschaltetem Zustand: nichts. Sonst alle Figuren aktualisieren und
 * verwaiste Kegel (gelöschte Figuren) entfernen. Wird pro Frame aufgerufen, damit
 * Kegel Position/Blickrichtung live folgen.
 */
export function refreshAll(figures: any[]): void {
  if (!enabled) return;
  const ids = new Set(figures.map((f) => f.id));
  for (const id of [...cones.keys()]) if (!ids.has(id)) removeCone(id);
  for (const f of figures) updateCone(f);
}
