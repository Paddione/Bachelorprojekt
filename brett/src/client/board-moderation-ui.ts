// brett/src/client/board-moderation-ui.ts
// DOM-Erstellung für Moderation-Overlays (Observer-Hint, Release-Button, Freeze-Banner).
// Gibt die DOM-Elemente zurück; board-boot.ts verwaltet den State und Tick-Aufruf.

export interface ModerationElements {
  observerHint: HTMLDivElement;
  releaseBtn: HTMLButtonElement;
  freezeBanner: HTMLDivElement;
}

export function createModerationElements(): ModerationElements {
  const observerHint = document.createElement('div');
  observerHint.id = 'observer-hint';
  observerHint.textContent = 'Klicke eine freie Figur, um sie zu verkörpern';
  Object.assign(observerHint.style, {
    display: 'none',
    position: 'absolute',
    bottom: '56px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: 'var(--brett-font-mono), monospace',
    fontSize: '10px',
    color: 'var(--brett-brass, #c8a96e)',
    border: '1px dashed var(--brett-brass-dim, rgba(200,169,110,0.14))',
    padding: '6px 14px',
    borderRadius: 'var(--brett-radius-sm, 8px)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    zIndex: '20',
    pointerEvents: 'none',
  });
  document.body.appendChild(observerHint);

  const releaseBtn = document.createElement('button');
  releaseBtn.id = 'btn-release-possession';
  releaseBtn.textContent = '🚶 Loslassen';
  Object.assign(releaseBtn.style, {
    display: 'none',
    position: 'absolute',
    bottom: '52px',
    right: '16px',
    fontFamily: 'var(--brett-font-sans), sans-serif',
    fontSize: '12px',
    background: 'var(--brett-brass, #c8a96e)',
    color: 'var(--brett-ink-900, #0b111c)',
    border: 'none',
    borderRadius: 'var(--brett-radius-sm, 8px)',
    padding: '8px 16px',
    cursor: 'pointer',
    zIndex: '20',
    fontWeight: '600',
  });
  document.body.appendChild(releaseBtn);

  // T000471: Freeze-Indikator-Banner
  const freezeBanner = document.createElement('div');
  freezeBanner.id = 'freeze-indicator';
  freezeBanner.textContent = '❄ EINGEFROREN — Figuren koennen nicht bewegt werden';
  Object.assign(freezeBanner.style, {
    display: 'none',
    position: 'absolute',
    top: '44px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: 'var(--brett-font-mono), monospace',
    fontSize: '10px',
    color: '#7dc8f7',
    border: '1px solid rgba(125,200,247,0.3)',
    background: 'rgba(0,16,32,0.85)',
    padding: '4px 18px',
    borderRadius: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    zIndex: '25',
    pointerEvents: 'none',
  });
  document.body.appendChild(freezeBanner);

  return { observerHint, releaseBtn, freezeBanner };
}
