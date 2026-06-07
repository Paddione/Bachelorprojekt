import * as THREE from 'three';
import { STATE, ui, lockSprites, activeLocks, currentUser, getWs, isWsReady } from '../state';
import { lockBadgeStyle, type VarGetter } from './skin';
import { isFreeFly } from '../free-fly-camera';

const pillEl = document.getElementById('status-pill')!;

// Browser CSS-variable resolver — injected only inside function bodies so the
// module stays importable under node/tsx (no top-level DOM access).
const cssVar: VarGetter = (n: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(n);

// ── Free-Fly button (T4 / sf-t000465, DARK-LAUNCH) ───────────────────────────
// Lazily resolved at first call to avoid top-level DOM access (keeps module
// importable in headless/test environments).
let _freeFlyBtnEl: HTMLElement | null | undefined = undefined; // undefined = not yet looked up

function getFreeFlyBtn(): HTMLElement | null {
  if (_freeFlyBtnEl === undefined) {
    _freeFlyBtnEl = document.getElementById('btn-free-fly');
  }
  return _freeFlyBtnEl;
}

export function setFigureLockBadge(figureId: string, name: string, color: string): void {
  clearFigureLockBadge(figureId);
  const fig = STATE.figures.find(f => f.id === figureId);
  if (!fig) return;

  // Create a canvas to draw the lock text
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Draw background bubble using design-system tokens (falls back to today's literals)
  const badge = lockBadgeStyle(color, cssVar);
  ctx.fillStyle = badge.bg;
  ctx.beginPath();
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(4, 4, 248, 56, 12);
  } else {
    ctx.rect(4, 4, 248, 56);
  }
  ctx.fill();

  // Draw text
  ctx.font = badge.font;
  ctx.fillStyle = badge.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`🔒 ${name}`, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.5, 0.375, 1);
  sprite.position.set(0, 1.45, 0); // Position above hips/head

  fig.root.add(sprite);
  lockSprites.set(figureId, sprite);
}

export function clearFigureLockBadge(figureId: string): void {
  const fig = STATE.figures.find(f => f.id === figureId);
  const sprite = lockSprites.get(figureId);
  if (sprite) {
    if (fig) fig.root.remove(sprite);
    if (sprite.material.map) sprite.material.map.dispose();
    sprite.material.dispose();
    lockSprites.delete(figureId);
  }
}

export function clearLockBadgesForUser(userId: string): void {
  for (const [figId, lock] of activeLocks.entries()) {
    if (lock.userId === userId) {
      clearFigureLockBadge(figId);
    }
  }
}

export function updateStatusPill(): void {
  // ── Feature flag check (DARK-LAUNCH: sf-t000465) ──────────────────────────
  const feats: Record<string, boolean> =
    (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
  const freeFlyEnabled = feats['sf-t000465'] ?? false;

  const fig = STATE.figures.find(f => f.id === STATE.selectedId);
  if (ui.dragging) {
    pillEl.textContent = '● Drag … · Loslassen = beenden';
    _updateFreeFlyBtn(freeFlyEnabled);
    return;
  }

  // D-spec: Possession-aware status
  const possessedFig = STATE.figures.find(f => (f as any)._serverPossessor === currentUser.userId);
  if (possessedFig) {
    pillEl.textContent = '👁 POV aktiv · Shift+Drag = Orbit · 🚶 [Loslassen] klicken';
    _updateFreeFlyBtn(freeFlyEnabled);
    return;
  }

  // T4 (DARK-LAUNCH: sf-t000465): Show Free-Fly hint when free-fly mode is active.
  // Inserted after POV check (POV has higher priority in tick loop).
  if (freeFlyEnabled && isFreeFly()) {
    pillEl.textContent = '🌐 Freier Flug · WASD = Bewegen · Maus = Blicken · F = Beenden';
    _updateFreeFlyBtn(freeFlyEnabled);
    return;
  }

  // No possessed figure, no selection — check if observer
  const anyFree = STATE.figures.some(f => !(f as any)._serverPossessor && !activeLocks.get(f.id));
  if (!fig && anyFree) {
    pillEl.textContent = 'Klick auf freie Figur = Verkörpern · Doppelklick Boden = neue Figur';
    _updateFreeFlyBtn(freeFlyEnabled);
    return;
  }

  if (!fig) {
    pillEl.textContent = 'Klick = Figur wählen · Doppelklick Boden = neue Figur';
    _updateFreeFlyBtn(freeFlyEnabled);
    return;
  }
  pillEl.textContent = 'Doppelklick Boden = Verschieben · Ziehen an Gliedern = Pose anpassen';
  _updateFreeFlyBtn(freeFlyEnabled);
}

/**
 * Update Free-Fly button visibility/disabled state.
 * T4 (DARK-LAUNCH: sf-t000465):
 *   - Button is hidden entirely when the feature flag is OFF.
 *   - Button is disabled (and visually muted) when the local user possesses a figure
 *     (possessor === self) — Free-Fly is only available to unencumbered observers.
 *   - Button is enabled/visible otherwise.
 */
function _updateFreeFlyBtn(featureEnabled: boolean): void {
  const btn = getFreeFlyBtn();
  if (!btn) return;

  if (!featureEnabled) {
    btn.style.display = 'none';
    return;
  }

  const possessedFig = STATE.figures.find(f => (f as any)._serverPossessor === currentUser.userId);
  const selfPossesses = Boolean(possessedFig);

  // Show button but disable when possessor === self
  btn.style.display = 'block';
  (btn as HTMLButtonElement).disabled = selfPossesses;
  btn.style.opacity = selfPossesses ? '0.4' : '1';
  btn.style.cursor = selfPossesses ? 'not-allowed' : 'pointer';

  // Update label to reflect current mode
  btn.textContent = isFreeFly() ? '🌐 Beenden' : '🌐 Freier Flug';
}

/** Release all possessions — called from the release button. */
export function releaseAllPossessions(): void {
  const ws = getWs();
  if (isWsReady() && ws) {
    ws.send(JSON.stringify({ type: 'figure_release' })); // no figureId → release all
  }
}
