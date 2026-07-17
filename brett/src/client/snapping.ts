// brett/src/client/snapping.ts — E7 Präzises Ausrichten (Snapping + Guides).
// Bei aktivem Magnet-Modus rastet die Drag-Endposition auf ein 0.5-Raster ein;
// liegt |Δx| bzw. |Δz| < 0.2 zu einer anderen Figur, rastet sie auf deren Achse
// ein und zeigt eine temporäre Hilfslinie. Rein client-seitig — die Endposition
// wird ohnehin via `move` gesynct. Die Snap-Mathematik ist pure & getestet.
import * as THREE from 'three';
import { STATE, getScene, getWs, isWsReady } from './state';

let magnet = false;
const GRID = 0.5;
const AXIS_THRESHOLD = 0.2;

export function setMagnet(on: boolean): void { magnet = on; }
export function isMagnet(): boolean { return magnet; }

export interface Guide { x1: number; z1: number; x2: number; z2: number; }
export interface SnapResult { x: number; z: number; guide: Guide | null; }

/**
 * Rastet `pos` auf das 0.5-Raster ein; bei Nähe (<0.2) zu einer anderen Position
 * zusätzlich auf deren X- oder Z-Achse, samt Hilfslinien-Endpunkten. Ohne aktiven
 * Magnet-Modus wird `pos` unverändert (ohne Guide) zurückgegeben.
 */
export function snap(pos: { x: number; z: number }, others: { x: number; z: number }[] = []): SnapResult {
  if (!magnet) return { x: pos.x, z: pos.z, guide: null };
  let x = Math.round(pos.x / GRID) * GRID;
  let z = Math.round(pos.z / GRID) * GRID;
  let guide: Guide | null = null;
  for (const o of others) {
    if (Math.abs(pos.x - o.x) < AXIS_THRESHOLD) {
      x = o.x;
      guide = { x1: o.x, z1: Math.min(z, o.z) - 1, x2: o.x, z2: Math.max(z, o.z) + 1 };
      break;
    }
    if (Math.abs(pos.z - o.z) < AXIS_THRESHOLD) {
      z = o.z;
      guide = { x1: Math.min(x, o.x) - 1, z1: o.z, x2: Math.max(x, o.x) + 1, z2: o.z };
      break;
    }
  }
  return { x, z, guide };
}

// ── Hilfslinie (THREE.Line) ───────────────────────────────────────────────────
let guideLine: THREE.Line | null = null;

export function showGuide(guide: Guide): void {
  const { scene } = getScene();
  const pts = [
    new THREE.Vector3(guide.x1, 0.01, guide.z1),
    new THREE.Vector3(guide.x2, 0.01, guide.z2),
  ];
  if (!guideLine) {
    const mat = new THREE.LineBasicMaterial({ color: 0xc8a96e, transparent: true, opacity: 0.6 });
    guideLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    scene.add(guideLine);
  } else {
    guideLine.geometry.setFromPoints(pts);
    guideLine.visible = true;
  }
}

export function clearGuide(): void {
  if (guideLine) guideLine.visible = false;
}

/**
 * Wird am Drag-Ende (Maus & Touch) aufgerufen: rastet die Figur ein, verschiebt
 * sie visuell auf die Snap-Position, sendet `move` und blendet die Hilfslinie
 * kurz ein. No-op bei ausgeschaltetem Magnet.
 */
export function finishDrag(fig: any): void {
  if (!magnet || !fig?.root) return;
  const others = STATE.figures
    .filter((f) => f.id !== fig.id)
    .map((f) => ({ x: f.root.position.x, z: f.root.position.z }));
  const res = snap({ x: fig.root.position.x, z: fig.root.position.z }, others);
  fig.root.position.x = res.x;
  fig.root.position.z = res.z;
  const ws = getWs();
  if (isWsReady() && ws) {
    ws.send(JSON.stringify({ type: 'move', id: fig.id, x: res.x, z: res.z, facingY: fig.facingY }));
  }
  if (res.guide) {
    showGuide(res.guide);
    setTimeout(clearGuide, 700);
  } else {
    clearGuide();
  }
}
