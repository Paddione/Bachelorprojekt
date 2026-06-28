import { STATE, ui } from '../state';
import { makeMannequin, recolorFigure } from '../mannequin';
import { sendAddFigure, sendUpdate, sendClient } from '../ws-client';

export function addFigure(position: { x: number; z: number }): any {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('f-' + Math.random().toString(36).slice(2,10));
  const fig = makeMannequin(id, position);
  STATE.figures.push(fig);
  selectFigure(id);
  
  const ws = (window as any).__brettWS;
  const wsReady = ws && ws.readyState === WebSocket.OPEN;
  if (wsReady) {
    sendAddFigure(fig);
  }
  return fig;
}

export function syncPanelToSelection(id: string | null): void {
  const title  = document.getElementById('fig-panel-title');
  const addBtn = document.getElementById('fig-panel-add');
  const input  = document.getElementById('fig-label-input') as HTMLInputElement | null;
  const noteArea = document.getElementById('fig-note-textarea') as HTMLTextAreaElement | null;
  if (!title) return;
  const fig = STATE.figures.find(f => f.id === id);
  if (fig) {
    title.textContent = 'FIGUR BEARBEITEN';
    if (addBtn) addBtn.hidden = true;
    if (input) input.value = fig.label || '';
    if (noteArea) noteArea.value = (fig as any).note || '';
  } else {
    title.textContent = 'NEUE FIGUR';
    if (addBtn) addBtn.hidden = false;
    if (input) input.value = '';
    if (noteArea) noteArea.value = '';
  }
}

export function selectFigure(id: string | null): void {
  STATE.selectedId = id;
  for (const f of STATE.figures) {
    f.ring.visible = (f.id === id);
    f.root.traverse((o: any) => {
      if (o.isMesh && !o.userData.isContact && o !== f.ring) {
        if (o.material && 'opacity' in o.material) {
          o.material.transparent = true;
          o.material.opacity = (f.id === id) ? 1.0 : 0.55;
        }
      }
    });
  }
  syncPanelToSelection(id);
  const appBtn = document.getElementById('appearance-btn') as HTMLButtonElement | null;
  if (appBtn) appBtn.disabled = !id;
}

const figPanelBtn   = document.getElementById('fig-panel-btn')!;
const figPanel      = document.getElementById('fig-panel')!;
const figPanelClose = document.getElementById('fig-panel-close')!;

export function openFigPanel(): void {
  figPanel.hidden = false;
  figPanelBtn.classList.add('open');
  figPanelBtn.setAttribute('aria-expanded', 'true');
  syncPanelToSelection(STATE.selectedId);
}

export function closeFigPanel(): void {
  figPanel.hidden = true;
  figPanelBtn.classList.remove('open');
  figPanelBtn.setAttribute('aria-expanded', 'false');
}

export function cancelDragFor(figureId: string): void {
  if (ui.dragging && ui.dragging.figId === figureId) {
    ui.dragging = null;
  }
}

export function initFigPanel(): void {
  if ((window as any).__brettIsZuschauer) {
    const panel = document.getElementById('fig-panel');
    if (panel) panel.querySelectorAll('button[data-action]').forEach(b => (b as HTMLButtonElement).disabled = true);
  }

  figPanelBtn.addEventListener('click', () => {
    if (figPanel.hidden) {
      openFigPanel();
    } else {
      closeFigPanel();
    }
  });
  figPanelClose.addEventListener('click', closeFigPanel);
  document.addEventListener('click', e => {
    if (!figPanel.hidden && !figPanel.contains(e.target as Node) && e.target !== figPanelBtn) {
      closeFigPanel();
    }
  });

  // Color swatches
  document.getElementById('fig-panel-colors')!.addEventListener('click', e => {
    const swatch = (e.target as HTMLElement).closest('.fig-color-swatch') as HTMLElement | null;
    if (!swatch) return;
    document.querySelectorAll('.fig-color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    ui.panelColor = swatch.dataset.color || '#b8c0a8';
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig) recolorFigure(fig, ui.panelColor);
  });

  // Label input
  document.getElementById('fig-label-input')!.addEventListener('input', e => {
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig) {
      fig.label = (e.target as HTMLInputElement).value;
      sendUpdate(fig, { label: fig.label });
    }
  });

  // Note textarea — sendet figure_note_set bei Eingabe (debounced via native input event)
  document.getElementById('fig-note-textarea')!.addEventListener('input', e => {
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig) {
      const note = (e.target as HTMLTextAreaElement).value;
      (fig as any).note = note;
      sendClient({ type: 'figure_note_set', figureId: fig.id, note });
      // Billboard update (Feature-Flag sf-t000469) — lazy import to avoid hard dep
      const feats: Record<string, boolean> =
        (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
      if (feats['sf-t000469']) {
        import('./hud').then(m => {
          if (typeof (m as any).setFigureNoteBillboard === 'function') {
            (m as any).setFigureNoteBillboard(fig.id, note);
          }
        }).catch(() => {});
      }
    }
  });

  // Scale slider + size buttons
  const scaleSlider = document.getElementById('fig-scale-slider') as HTMLInputElement;
  const scaleVal    = document.getElementById('fig-scale-val')!;
  scaleSlider.addEventListener('input', () => {
    ui.panelScale = parseFloat(scaleSlider.value);
    scaleVal.textContent = ui.panelScale.toFixed(2).replace(/\.?0+$/, '') + '×';
    document.querySelectorAll('.fig-size-btn').forEach(b => b.classList.remove('active'));
  });
  document.getElementById('fig-scale-row')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('.fig-size-btn') as HTMLElement | null;
    if (!btn) return;
    ui.panelScale = parseFloat(btn.dataset.scale || '1.0');
    scaleSlider.value = String(ui.panelScale);
    scaleVal.textContent = ui.panelScale.toFixed(2).replace(/\.?0+$/, '') + '×';
    document.querySelectorAll('.fig-size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Update selected figure's scale live
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig) { fig.root.scale.setScalar(ui.panelScale); }
  });

  // Add button — enters placing mode
  document.getElementById('fig-panel-add')!.addEventListener('click', () => {
    closeFigPanel();
    ui.placingMode = true;
    document.body.classList.add('placing-figure');
    const _pill = document.getElementById('status-pill');
    if (_pill) _pill.textContent = 'Klick auf den Boden zum Platzieren — Esc zum Abbrechen';
  });

  // Expose placingMode, panelColor, panelScale as globals for legacy script
  Object.defineProperty(window, 'placingMode', {
    get: () => ui.placingMode,
    set: (v) => { ui.placingMode = v; },
    configurable: true
  });
  Object.defineProperty(window, 'panelColor', {
    get: () => ui.panelColor,
    set: (v) => { ui.panelColor = v; },
    configurable: true
  });
  Object.defineProperty(window, 'panelScale', {
    get: () => ui.panelScale,
    set: (v) => { ui.panelScale = v; },
    configurable: true
  });
  (window as any).placingMode_get = () => ui.placingMode;
}
