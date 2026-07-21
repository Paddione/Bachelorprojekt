import { STATE, ui } from '../state';
import { makeMannequin, recolorFigure, applyFigureOpacity } from '../mannequin';
import { sendAddFigure, sendUpdate, sendClient, sendMove } from '../ws-client'; // sendMove re-exported from ws-connection-client.ts
import { t } from '../i18n';
import { showExportToast } from './export-toast';
import { edgeTabVisible, degToRad, radToDeg } from '../figure-drag';

/**
 * D5: user-visible notice when a figure is spawned while the WebSocket is not
 * OPEN — the figure stays local-only and would otherwise silently disappear on
 * the next server snapshot.
 */
export function spawnOfflineNotice(): void {
  showExportToast('Figur noch nicht synchronisiert – Verbindung wird aufgebaut', 'error');
}

export function addFigure(position: { x: number; z: number }): any {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('f-' + Math.random().toString(36).slice(2,10));
  const fig = makeMannequin(id, position);
  STATE.figures.push(fig);
  selectFigure(id);

  const ws = (window as any).__brettWS;
  const wsReady = ws && ws.readyState === WebSocket.OPEN;
  if (wsReady) {
    sendAddFigure(fig);
  } else {
    spawnOfflineNotice();
  }
  // T002050: spawned figures land on the board immediately, closing the
  // drawer so the edge-tab (not the ＋Figur panel) becomes the edit entrypoint.
  closeFigPanel();
  return fig;
}

// E2/E9: dynamisch erzeugte Steuerelemente (Opacity-Slider + Verdecken-Toggle).
let opacitySlider: HTMLInputElement | null = null;
let hideToggle: HTMLButtonElement | null = null;

/**
 * T002050: shows the viewport-edge tab whenever a figure is selected but the
 * (now edge-anchored) drawer is closed — the tab is the re-entry point back
 * into the editor without hunting for the topbar ＋Figur button.
 */
export function syncEdgeTab(): void {
  const tab = document.getElementById('fig-panel-edge-tab');
  const panel = document.getElementById('fig-panel');
  if (!tab || !panel) return;
  tab.hidden = !edgeTabVisible(STATE.selectedId, panel.hidden);
}

export function syncPanelToSelection(id: string | null): void {
  const title  = document.getElementById('fig-panel-title');
  const addBtn = document.getElementById('fig-panel-add');
  const input  = document.getElementById('fig-label-input') as HTMLInputElement | null;
  const noteArea = document.getElementById('fig-note-textarea') as HTMLTextAreaElement | null;
  const rotateSlider = document.getElementById('fig-rotate-slider') as HTMLInputElement | null;
  if (!title) return;
  const fig = STATE.figures.find(f => f.id === id);
  if (fig) {
    title.textContent = 'FIGUR BEARBEITEN';
    if (addBtn) addBtn.hidden = true;
    if (input) input.value = fig.label || '';
    if (noteArea) noteArea.value = (fig as any).note || '';
    if (opacitySlider) opacitySlider.value = String((fig as any).opacity ?? 1);
    if (hideToggle) hideToggle.textContent = (fig as any).hidden ? t('fig.reveal') : t('fig.hide');
    if (rotateSlider) rotateSlider.value = String(Math.round(radToDeg(fig.facingY || 0)));
  } else {
    title.textContent = 'NEUE FIGUR';
    if (addBtn) addBtn.hidden = false;
    if (input) input.value = '';
    if (noteArea) noteArea.value = '';
    if (opacitySlider) opacitySlider.value = '1';
    if (rotateSlider) rotateSlider.value = '0';
  }
  syncEdgeTab();
}

/**
 * Baut den Transparenz-Slider (E2) und — nur für den Leiter — den Verdecken/
 * Aufdecken-Toggle (E9) und hängt sie ans Figuren-Panel.
 */
function buildFigureControls(): void {
  const panel = document.getElementById('fig-panel');
  if (!panel || (window as any).__brettIsZuschauer) return;

  // Opacity-Slider
  const row = document.createElement('div');
  row.className = 'fig-opacity-row';
  Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0' });
  const lbl = document.createElement('span');
  lbl.setAttribute('data-i18n', 'fig.opacity');
  lbl.textContent = t('fig.opacity');
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0.2'; slider.max = '1'; slider.step = '0.05'; slider.value = '1';
  slider.id = 'fig-opacity-slider';
  slider.style.flex = '1';
  slider.addEventListener('input', () => {
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (!fig) return;
    const val = Math.max(0.2, Math.min(1, parseFloat(slider.value)));
    (fig as any).opacity = val;
    applyFigureOpacity(fig, 1.0); // selektierte Figur → Selektions-Dim = 1
    sendUpdate(fig, { opacity: val });
  });
  row.append(lbl, slider);
  panel.appendChild(row);
  opacitySlider = slider;

  // E9: Verdecken/Aufdecken-Toggle (nur Leiter/Admin).
  if ((window as any).__brettCurrentUserIsAdmin) {
    const btn = document.createElement('button');
    btn.id = 'fig-hide-toggle';
    btn.className = 'fig-hide-toggle';
    btn.textContent = t('fig.hide');
    Object.assign(btn.style, { margin: '4px 0', cursor: 'pointer', padding: '4px 8px' });
    btn.addEventListener('click', () => {
      const fig = STATE.figures.find(f => f.id === STATE.selectedId);
      if (!fig) return;
      const next = !(fig as any).hidden;
      (fig as any).hidden = next;
      btn.textContent = next ? t('fig.reveal') : t('fig.hide');
      sendClient({ type: 'figure_hide_set', figureId: fig.id, hidden: next });
    });
    panel.appendChild(btn);
    hideToggle = btn;
  }
}

export function selectFigure(id: string | null): void {
  STATE.selectedId = id;
  for (const f of STATE.figures) {
    f.ring.visible = (f.id === id);
    // E2: effektive Opacity = base (fig.opacity) × Selektions-Dim (1.0 / 0.55).
    applyFigureOpacity(f, (f.id === id) ? 1.0 : 0.55);
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
  syncEdgeTab();
}

export function closeFigPanel(): void {
  figPanel.hidden = true;
  figPanelBtn.classList.remove('open');
  figPanelBtn.setAttribute('aria-expanded', 'false');
  syncEdgeTab();
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

  // ── E2: Transparenz-Slider + E9: Verdecken-Toggle (leiter-only) ─────────────
  buildFigureControls();

  // T002050: viewport-edge tab re-opens the drawer for the selected figure.
  const edgeTab = document.getElementById('fig-panel-edge-tab');
  edgeTab?.addEventListener('click', () => openFigPanel());

  // T002050: 360° rotation slider — mirrors the ring-drag facingY convention
  // (degToRad/radToDeg), streamed live via sendMove (same as body/rotate drag).
  const rotateSlider = document.getElementById('fig-rotate-slider') as HTMLInputElement | null;
  rotateSlider?.addEventListener('input', () => {
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (!fig) return;
    const facingY = degToRad(parseFloat(rotateSlider.value));
    fig.facingY = facingY;
    fig.root.rotation.y = facingY;
    sendMove(fig.id, fig.root.position.x, fig.root.position.z, facingY);
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
