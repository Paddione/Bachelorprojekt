import * as THREE from 'three';
import { STATE, ui, lockSprites, activeLocks } from '../state';
import { lockBadgeStyle, type VarGetter } from './skin';

const pillEl = document.getElementById('status-pill')!;

// Browser CSS-variable resolver — injected only inside function bodies so the
// module stays importable under node/tsx (no top-level DOM access).
const cssVar: VarGetter = (n: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(n);;

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
  const fig = STATE.figures.find(f => f.id === STATE.selectedId);
  if (ui.dragging) {
    pillEl.textContent = '● Drag … · Loslassen = beenden';
    return;
  }
  if (!fig) {
    pillEl.textContent = 'Klick = Figur wählen · Doppelklick Boden = neue Figur';
    return;
  }
  pillEl.textContent = 'Doppelklick Boden = Verschieben · Ziehen an Gliedern = Pose anpassen';
}
