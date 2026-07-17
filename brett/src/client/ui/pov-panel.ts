// brett/src/client/ui/pov-panel.ts — E5 Dialoge / Innensicht-Wechsel.
// Overlay bei aktiver Possession: Liste der anderen Figuren (Name/Farbe), Klick
// wechselt die Innensicht (switchPov: release+possess atomar). Dialog-Modus
// merkt sich Partner A/B und alterniert die Innensicht. Enthält den
// Innensicht ⇄ Metaposition-Umschalter (E4) und eine „Verlassen"-Aktion.
//
// WICHTIG (Bundler-Gotcha): Dieses Modul importiert bewusst KEIN '../state'
// und KEIN '../pov-camera'. Der Vite/Rolldown-Build dupliziert diese Module
// über die Multi-Entry-Chunks (main/share/zuschauer) in mehrere Instanzen;
// ein direkter Import erwischte hier eine leere Zweitinstanz (currentUser
// blieb 'anon', STATE.figures leer, getWs() null). Deshalb reicht der
// Aufrufer (ws-client, der die echte Instanzwelt besitzt) alles als
// PovPanelCtx herein.
import { t, initLang, applyTranslations } from '../i18n';

/** Vom Aufrufer (ws-client) injizierte Live-Welt — keine eigenen Instanzen. */
export interface PovPanelCtx {
  /** Aktuelle Figurenliste (id/label/color) aus der echten STATE-Instanz. */
  figures: () => Array<{ id: string; label?: string; color?: string }>;
  /** Sendet figure_release über die echte WS-Verbindung. */
  sendRelease: (figureId: string) => void;
  /** pov-camera-API derselben Instanz, die auch startPov ausgeführt hat. */
  switchPov: (figureId: string) => void;
  setPovMode: (mode: 'first-person' | 'meta') => void;
  isMeta: () => boolean;
  getPovFigureId: () => string | null;
}

let panel: HTMLElement | null = null;
let mountedFor: string | null = null;
let ctxRef: PovPanelCtx | null = null;
let dialogA: string | null = null;
let dialogB: string | null = null;
let dialogNext: 'A' | 'B' = 'A';

/** Wählt Dialog-Partner A/B abwechselnd und wechselt sofort die Innensicht. */
function alternateDialog(): void {
  if (!ctxRef) return;
  const target = dialogNext === 'A' ? dialogA : dialogB;
  dialogNext = dialogNext === 'A' ? 'B' : 'A';
  if (target) {
    ctxRef.switchPov(target);
    refreshList(target);
  }
}

function otherFigures(possessedId: string | null): Array<{ id: string; label?: string; color?: string }> {
  return (ctxRef?.figures() ?? []).filter((f) => f.id !== possessedId);
}

/** Figurenliste im Panel neu aufbauen (nach switchPov ändert sich die Basis). */
function refreshList(possessedId: string): void {
  const list = panel?.querySelector<HTMLElement>('[data-pov-list]');
  if (!list || !ctxRef) return;
  list.textContent = '';
  for (const f of otherFigures(possessedId)) {
    const row = document.createElement('button');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '3px 6px', textAlign: 'left' });
    const dot = document.createElement('span');
    Object.assign(dot.style, { width: '10px', height: '10px', borderRadius: '50%', background: f.color || '#c8a96e', flex: '0 0 auto' });
    const name = document.createElement('span');
    name.textContent = f.label || f.id.slice(0, 8);
    row.append(dot, name);
    row.addEventListener('click', () => {
      ctxRef?.switchPov(f.id);
      refreshList(f.id);
    });
    list.appendChild(row);
  }
}

/** Baut/erneuert das POV-Panel für die aktuell besessene Figur. */
export function mountPovPanel(possessedId: string, ctx: PovPanelCtx): void {
  // Bereits für diese Figur gemountet (z. B. possess-Echo nach switchPov):
  // nur Kontext/Liste auffrischen — ein Remount würde den Dialog-A/B-Zustand
  // zurücksetzen (Review-Finding #4).
  if (panel && mountedFor === possessedId) {
    ctxRef = ctx;
    refreshList(possessedId);
    return;
  }
  const keepDialog = panel !== null; // switchPov-Remount: Dialog-Paar erhalten
  const savedA = dialogA, savedB = dialogB, savedNext = dialogNext;
  unmountPovPanel();
  if (keepDialog) { dialogA = savedA; dialogB = savedB; dialogNext = savedNext; }
  mountedFor = possessedId;
  ctxRef = ctx;
  initLang(); // Zweitinstanz-sicher: Sprache aus localStorage nachziehen.
  const box = document.createElement('div');
  box.id = 'pov-panel';
  Object.assign(box.style, {
    position: 'absolute', bottom: '16px', left: '16px', zIndex: '35',
    display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px',
    padding: '12px', background: 'rgba(10,14,24,0.9)',
    border: '1px solid rgba(200,169,110,0.4)', borderRadius: '10px',
    fontFamily: 'var(--brett-font-mono, monospace)', fontSize: '11px',
    color: 'var(--brett-brass, #c8a96e)',
  });

  const title = document.createElement('div');
  title.setAttribute('data-i18n', 'pov.title');
  title.textContent = t('pov.title');
  title.style.fontWeight = 'bold';
  box.appendChild(title);

  // Andere Figuren zum Hineinwechseln.
  const list = document.createElement('div');
  list.setAttribute('data-pov-list', '');
  Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '160px', overflowY: 'auto' });
  box.appendChild(list);

  // Innensicht ⇄ Metaposition.
  const metaBtn = document.createElement('button');
  metaBtn.style.cursor = 'pointer';
  const syncMetaLabel = () => { metaBtn.textContent = ctx.isMeta() ? t('pov.inner') : t('pov.meta'); };
  syncMetaLabel();
  metaBtn.addEventListener('click', () => {
    ctx.setPovMode(ctx.isMeta() ? 'first-person' : 'meta');
    syncMetaLabel();
  });
  box.appendChild(metaBtn);

  // Dialog-Modus: aktuelle Figur = A, erste andere = B; Button alterniert.
  const dialogBtn = document.createElement('button');
  dialogBtn.setAttribute('data-i18n', 'pov.dialog');
  dialogBtn.textContent = t('pov.dialog');
  dialogBtn.style.cursor = 'pointer';
  dialogBtn.addEventListener('click', () => {
    if (!dialogA) {
      dialogA = ctx.getPovFigureId();
      dialogB = otherFigures(dialogA)[0]?.id ?? null;
      dialogNext = 'B';
    }
    alternateDialog();
  });
  box.appendChild(dialogBtn);

  // Verlassen.
  const leaveBtn = document.createElement('button');
  leaveBtn.setAttribute('data-i18n', 'pov.leave');
  leaveBtn.textContent = t('pov.leave');
  leaveBtn.style.cursor = 'pointer';
  leaveBtn.addEventListener('click', () => {
    const id = ctx.getPovFigureId();
    if (id) ctx.sendRelease(id);
    unmountPovPanel();
  });
  box.appendChild(leaveBtn);

  document.body.appendChild(box);
  panel = box;
  refreshList(possessedId);
  applyTranslations(box);
}

export function unmountPovPanel(): void {
  panel?.remove();
  panel = null;
  mountedFor = null;
  ctxRef = null;
  dialogA = null;
  dialogB = null;
  dialogNext = 'A';
}

/**
 * Panel für die eigene Possession montieren. Die Identitätsprüfung
 * (playerId === currentUser.userId) macht der AUFRUFER gegen seine echte
 * currentUser-Instanz — hier nicht erneut prüfen (Bundler-Gotcha oben).
 */
export function refreshPovPanelForOwnPossession(figureId: string, _playerId: string, ctx: PovPanelCtx): void {
  mountPovPanel(figureId, ctx);
}
