// brett/src/client/scene-lines.ts — 3D-Linienrendering (T000467)
// Feature-Flag: window.__brettFeatures['sf-t000467']
import * as THREE from 'three';
import { STATE, getScene } from './state';
import type { BrettLine, LineType } from '../types/state';

export const LINE_COLORS: Record<LineType, number> = {
  relationship: 0x4ea1ff,  // Blau — neutraler Bezug
  tension:      0xe05555,  // Rot — Konflikt/Spannung
  resource:     0x55bb77,  // Grün — Unterstützung/Ressource
};

// Aktive THREE.Line Objekte, geindext nach lineId
const lineObjects = new Map<string, THREE.Line>();

// Letzte bekannte Positionen der Figuren (dirty-check für Frame-Loop Update)
const lastPositions = new Map<string, { x: number; z: number }>();

function isFeatureActive(): boolean {
  const feats: Record<string, boolean> =
    (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
  return feats['sf-t000467'] === true;
}

function getFigPos(figId: string): THREE.Vector3 | null {
  const fig = STATE.figures.find((f: any) => f.id === figId);
  if (!fig) return null;
  return new THREE.Vector3(fig.root.position.x, 0.5, fig.root.position.z);
}

function buildGeometry(line: BrettLine): THREE.BufferGeometry | null {
  const from = getFigPos(line.fromId);
  const to = getFigPos(line.toId);
  if (!from || !to) return null;
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.25, 0));
  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  const points = curve.getPoints(40);
  return new THREE.BufferGeometry().setFromPoints(points);
}

/** Rendert eine neue Linie in die Szene. No-op außerhalb des Feature-Flags. */
export function renderLine(line: BrettLine): void {
  if (!isFeatureActive()) return;
  removeLineFromScene(line.id); // idempotent — ggf. alte Version entfernen
  const geometry = buildGeometry(line);
  if (!geometry) return;
  let mesh: THREE.Line;
  if (line.lineType === 'tension') {
    const mat = new THREE.LineDashedMaterial({ color: LINE_COLORS[line.lineType], dashSize: 0.15, gapSize: 0.1 });
    mesh = new THREE.Line(geometry, mat);
    mesh.computeLineDistances();
  } else {
    const mat = new THREE.LineBasicMaterial({ color: LINE_COLORS[line.lineType] });
    mesh = new THREE.Line(geometry, mat);
  }
  getScene().scene.add(mesh);
  lineObjects.set(line.id, mesh);
}

/** Entfernt eine Linie aus der Szene und gibt Ressourcen frei. */
export function removeLineFromScene(lineId: string): void {
  const mesh = lineObjects.get(lineId);
  if (!mesh) return;
  getScene().scene.remove(mesh);
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach(m => m.dispose());
  } else {
    (mesh.material as THREE.Material).dispose();
  }
  lineObjects.delete(lineId);
}

/** Alle Linien aus der Szene entfernen (beim snapshot-Reset). */
export function clearAllLines(): void {
  for (const id of [...lineObjects.keys()]) {
    removeLineFromScene(id);
  }
  lineObjects.clear();
  lastPositions.clear();
}

/** Re-rendert eine Linie mit neuer Geometrie (nach figure move oder type change). */
export function rerenderLine(lineId: string): void {
  if (!isFeatureActive()) return;
  const line = STATE.lines.find(l => l.id === lineId);
  if (!line) { removeLineFromScene(lineId); return; }
  renderLine(line);
}

/**
 * Frame-Loop Update: Aktualisiert Linienpositionen wenn sich Figuren bewegt haben.
 * Sollte einmal pro Frame nach dem mannequin-Update aufgerufen werden.
 * Dirty-Check: vergleicht aktuelle Position mit lastPositions um unnötige Rebuilds zu vermeiden.
 */
export function updateLinePositions(): void {
  if (!isFeatureActive()) return;
  if (lineObjects.size === 0) return;

  // Prüfe ob relevante Figuren bewegt wurden
  const affectedFigIds = new Set<string>();
  for (const line of STATE.lines) {
    const fromFig = STATE.figures.find((f: any) => f.id === line.fromId);
    const toFig = STATE.figures.find((f: any) => f.id === line.toId);
    if (!fromFig || !toFig) continue;
    const fromPos = lastPositions.get(line.fromId);
    const toPos = lastPositions.get(line.toId);
    const fromMoved = !fromPos || fromPos.x !== fromFig.root.position.x || fromPos.z !== fromFig.root.position.z;
    const toMoved = !toPos || toPos.x !== toFig.root.position.x || toPos.z !== toFig.root.position.z;
    if (fromMoved || toMoved) {
      affectedFigIds.add(line.fromId);
      affectedFigIds.add(line.toId);
    }
  }

  if (affectedFigIds.size === 0) return;

  // Update lastPositions
  for (const figId of affectedFigIds) {
    const fig = STATE.figures.find((f: any) => f.id === figId);
    if (fig) lastPositions.set(figId, { x: fig.root.position.x, z: fig.root.position.z });
  }

  // Neu rendern der betroffenen Linien
  for (const line of STATE.lines) {
    if (affectedFigIds.has(line.fromId) || affectedFigIds.has(line.toId)) {
      renderLine(line);
    }
  }
}
