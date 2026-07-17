// brett/src/client/ui/pov-panel.ts — E5 Dialoge / Innensicht-Wechsel.
// Overlay bei aktiver Possession: Liste der anderen Figuren (Name/Farbe), Klick
// ruft das bestehende switchPov(figureId) (release+possess atomar). Dialog-Modus
// merkt sich Partner A/B und alterniert die Innensicht. Enthält den
// Innensicht ⇄ Metaposition-Umschalter (E4) und eine „Verlassen"-Aktion.
import { STATE, getWs, isWsReady, currentUser } from '../state';
import { switchPov, setPovMode, isMeta, getPovFigureId } from '../pov-camera';
import { t } from '../i18n';

let panel: HTMLElement | null = null;
let dialogA: string | null = null;
let dialogB: string | null = null;
let dialogNext: 'A' | 'B' = 'A';

function releasePossession(figureId: string): void {
  const ws = getWs();
  if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_release', figureId }));
}

/** Wählt Dialog-Partner A/B abwechselnd und wechselt sofort die Innensicht. */
function alternateDialog(): void {
  const target = dialogNext === 'A' ? dialogA : dialogB;
  dialogNext = dialogNext === 'A' ? 'B' : 'A';
  if (target) switchPov(target);
}

function otherFigures(possessedId: string | null): any[] {
  return STATE.figures.filter((f) => f.id !== possessedId);
}

/** Baut/erneuert das POV-Panel für die aktuell besessene Figur. */
export function mountPovPanel(possessedId: string): void {
  unmountPovPanel();
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
  Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '160px', overflowY: 'auto' });
  for (const f of otherFigures(possessedId)) {
    const row = document.createElement('button');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '3px 6px', textAlign: 'left' });
    const dot = document.createElement('span');
    Object.assign(dot.style, { width: '10px', height: '10px', borderRadius: '50%', background: f.color || '#c8a96e', flex: '0 0 auto' });
    const name = document.createElement('span');
    name.textContent = f.label || f.id.slice(0, 8);
    row.append(dot, name);
    row.addEventListener('click', () => switchPov(f.id));
    list.appendChild(row);
  }
  box.appendChild(list);

  // Innensicht ⇄ Metaposition.
  const metaBtn = document.createElement('button');
  metaBtn.style.cursor = 'pointer';
  const syncMetaLabel = () => { metaBtn.textContent = isMeta() ? t('pov.inner') : t('pov.meta'); };
  syncMetaLabel();
  metaBtn.addEventListener('click', () => {
    setPovMode(isMeta() ? 'first-person' : 'meta');
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
      dialogA = getPovFigureId();
      dialogB = otherFigures(possessedId)[0]?.id ?? null;
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
    const id = getPovFigureId();
    if (id) releasePossession(id);
    unmountPovPanel();
  });
  box.appendChild(leaveBtn);

  document.body.appendChild(box);
  panel = box;
}

export function unmountPovPanel(): void {
  panel?.remove();
  panel = null;
  dialogA = null;
  dialogB = null;
  dialogNext = 'A';
}

/** Panel nur montieren, wenn die lokale Person die Figur besitzt. */
export function refreshPovPanelForOwnPossession(figureId: string, playerId: string): void {
  if (playerId === currentUser.userId) mountPovPanel(figureId);
}
