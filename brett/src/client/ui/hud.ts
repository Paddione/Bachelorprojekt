import * as THREE from 'three';
import { STATE, ui, lockSprites, noteSprites, activeLocks, currentUser, getWs, isWsReady } from '../state';
import { lockBadgeStyle, type VarGetter } from './skin';
import { LANGS, getLang, setLang } from '../i18n';
import { isFreeFly } from '../free-fly-camera';

const pillEl = document.getElementById('status-pill')!;

// Browser CSS-variable resolver — injected only inside function bodies so the
// module stays importable under node/tsx (no top-level DOM access).
const cssVar: VarGetter = (n: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(n);

// ── E3/E6/E7: Topbar-View-Toggles (2D/3D, Sichtkegel, Magnet) ────────────────
/** Stellt die dedizierte Toggle-Gruppe in der Topbar bereit (idempotent). */
function ensureViewToggleGroup(): HTMLElement | null {
  const topbar = document.getElementById('topbar');
  if (!topbar) return null;
  let group = document.getElementById('view-toggle-group');
  if (!group) {
    group = document.createElement('div');
    group.id = 'view-toggle-group';
    group.className = 'group';
    (group as HTMLElement).style.gap = '4px';
    // Vor der Export-Gruppe einsortieren: ganz rechts liegt das absolute
    // Teilnehmer-Overlay (#coaching-participants) und verdeckte die Toggles.
    const exportGroup = document.getElementById('export-group');
    if (exportGroup && exportGroup.parentElement === topbar) {
      topbar.insertBefore(group, exportGroup);
    } else {
      topbar.appendChild(group);
    }
  }
  return group;
}

/**
 * Fügt einen Umschalt-Button in die Topbar-View-Gruppe ein. `data-i18n` sorgt
 * dafür, dass applyTranslations() das Label pflegt.
 */
export function mountViewToggle(cfg: {
  id: string; label: string; i18nKey?: string; initialOn: boolean; onToggle: (on: boolean) => void;
}): HTMLButtonElement | null {
  const group = ensureViewToggleGroup();
  if (!group || document.getElementById(cfg.id)) return null;
  const btn = document.createElement('button');
  btn.id = cfg.id;
  btn.textContent = cfg.label;
  if (cfg.i18nKey) btn.setAttribute('data-i18n', cfg.i18nKey);
  btn.dataset.on = cfg.initialOn ? '1' : '0';
  btn.style.opacity = cfg.initialOn ? '1' : '0.55';
  btn.addEventListener('click', () => {
    const on = btn.dataset.on !== '1';
    btn.dataset.on = on ? '1' : '0';
    btn.style.opacity = on ? '1' : '0.55';
    cfg.onToggle(on);
  });
  group.appendChild(btn);
  return btn;
}

/**
 * E8: Sprachumschalter (DE/EN/FR/ES) in der Topbar-View-Gruppe. Persistiert
 * über i18n.setLang (localStorage) und lädt die Seite neu — der Reload ist
 * bewusst: der Build hält mehrere i18n-Modulinstanzen (Multi-Entry-Chunks),
 * ein reines applyTranslations() erreichte nicht alle; nach dem Reload
 * initialisieren alle Instanzen konsistent aus localStorage.
 */
export function mountLangSelect(): HTMLSelectElement | null {
  const group = ensureViewToggleGroup();
  if (!group || document.getElementById('lang-select')) return null;
  const sel = document.createElement('select');
  sel.id = 'lang-select';
  sel.title = 'Sprache / Language';
  Object.assign(sel.style, { fontSize: '11px', background: 'transparent', color: 'inherit', border: '1px solid rgba(200,169,110,0.4)', borderRadius: '6px', padding: '2px 4px', cursor: 'pointer' });
  for (const lang of LANGS) {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = lang.toUpperCase();
    opt.style.color = '#000';
    if (lang === getLang()) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    setLang(sel.value as Parameters<typeof setLang>[0]);
    location.reload();
  });
  group.appendChild(sel);
  return sel;
}

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

// ── T000470: Undo/Redo-Buttons (lazy — headless-safe) ────────────────────────
let _undoBtnEl: HTMLButtonElement | null | undefined = undefined;
let _redoBtnEl: HTMLButtonElement | null | undefined = undefined;

function getUndoBtn(): HTMLButtonElement | null {
  if (_undoBtnEl === undefined) {
    _undoBtnEl = document.getElementById('btn-undo') as HTMLButtonElement | null;
  }
  return _undoBtnEl;
}

function getRedoBtn(): HTMLButtonElement | null {
  if (_redoBtnEl === undefined) {
    _redoBtnEl = document.getElementById('btn-redo') as HTMLButtonElement | null;
  }
  return _redoBtnEl;
}

/**
 * Synchronisiert den enabled/disabled-Zustand der Undo/Redo-Buttons mit dem
 * aktuellen Stack-Status aus dem Server.
 * Wird von ws-client.ts via onUndoStateChange aufgerufen.
 * T000470: isAdmin-Gate schützt auf Server-Seite.
 */
export function updateUndoRedoButtons(canUndo: boolean, canRedo: boolean): void {
  const undoBtn = getUndoBtn();
  const redoBtn = getRedoBtn();
  if (undoBtn) {
    undoBtn.disabled = !canUndo;
    undoBtn.style.opacity = canUndo ? '1' : '0.4';
    undoBtn.style.cursor = canUndo ? 'pointer' : 'default';
  }
  if (redoBtn) {
    redoBtn.disabled = !canRedo;
    redoBtn.style.opacity = canRedo ? '1' : '0.4';
    redoBtn.style.cursor = canRedo ? 'pointer' : 'default';
  }
}

/** Release all possessions — called from the release button. */
export function releaseAllPossessions(): void {
  const ws = getWs();
  if (isWsReady() && ws) {
    ws.send(JSON.stringify({ type: 'figure_release' })); // no figureId → release all
  }
}

/**
 * Setzt oder aktualisiert den Notiz-Billboard-Sprite über einer Figur.
 * Feature-Flag: sf-t000469. Zeigt max. 40 Zeichen der Notiz an.
 */
export function setFigureNoteBillboard(figureId: string, note: string): void {
  clearFigureNoteBillboard(figureId);
  const feats: Record<string, boolean> =
    (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
  if (!feats['sf-t000469']) return;
  if (!note || !note.trim()) return; // Leere Notizen: kein Sprite

  const fig = STATE.figures.find(f => f.id === figureId);
  if (!fig) return;

  const preview = note.length > 40 ? note.slice(0, 40) + '…' : note;

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;

  // Hintergrund: leicht transparentes Dunkel mit goldenem Rand
  ctx.fillStyle = 'rgba(11,17,28,0.82)';
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(4, 4, 312, 72, 12);
  } else {
    ctx.rect(4, 4, 312, 72);
  }
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,169,110,0.7)';
  ctx.lineWidth = 2;
  if ((ctx as any).roundRect) {
    ctx.beginPath();
    (ctx as any).roundRect(4, 4, 312, 72, 12);
    ctx.stroke();
  }

  // Notiztext
  ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#e7ead0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(preview, 160, 40);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  // Breiter als Lock-Badge, höher positioniert (über dem Kopf der Figur)
  sprite.scale.set(2.0, 0.5, 1);
  sprite.position.set(0, 1.9, 0);

  fig.root.add(sprite);
  noteSprites.set(figureId, sprite);
}

/**
 * Entfernt den Notiz-Billboard-Sprite einer Figur und gibt GPU-Ressourcen frei.
 */
export function clearFigureNoteBillboard(figureId: string): void {
  const sprite = noteSprites.get(figureId);
  if (sprite) {
    const fig = STATE.figures.find(f => f.id === figureId);
    if (fig) fig.root.remove(sprite);
    if (sprite.material.map) sprite.material.map.dispose();
    sprite.material.dispose();
    noteSprites.delete(figureId);
  }
}
