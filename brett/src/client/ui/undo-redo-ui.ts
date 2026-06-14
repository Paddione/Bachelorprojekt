export function initUndoRedo(
  wsClient: { sendUndo(): void; sendRedo(): void; setUndoStateChangeHandler(cb: (s: { canUndo: boolean; canRedo: boolean }) => void): void },
  hud: { updateUndoRedoButtons(canUndo: boolean, canRedo: boolean): void },
  isAdmin: boolean,
): void {
  const commonStyle = {
    display: 'none',
    position: 'absolute',
    bottom: '52px',
    fontFamily: 'var(--brett-font-mono, monospace)',
    fontSize: '10px',
    padding: '4px 10px',
    borderRadius: 'var(--brett-radius-sm, 6px)',
    border: '1px solid var(--brett-border, rgba(255,255,255,0.12))',
    background: 'var(--brett-surface-1, rgba(0,0,0,0.45))',
    color: 'var(--brett-fg, #e8e8e8)',
    cursor: 'pointer',
    opacity: '0.4',
    pointerEvents: 'auto',
    zIndex: '20',
  };

  const undoBtn = document.createElement('button');
  undoBtn.id = 'btn-undo';
  undoBtn.textContent = '↩ Rückgängig';
  Object.assign(undoBtn.style, { ...commonStyle, right: '160px' });
  undoBtn.disabled = true;

  const redoBtn = document.createElement('button');
  redoBtn.id = 'btn-redo';
  redoBtn.textContent = '↪ Wiederholen';
  Object.assign(redoBtn.style, { ...commonStyle, right: '80px' });
  redoBtn.disabled = true;

  document.body.append(undoBtn, redoBtn);

  if ((window as any).__brettIsZuschauer) {
    undoBtn.disabled = true;
    redoBtn.disabled = true;
  }

  undoBtn.addEventListener('click', () => wsClient.sendUndo());
  redoBtn.addEventListener('click', () => wsClient.sendRedo());

  if (isAdmin) {
    undoBtn.style.display = 'inline-block';
    redoBtn.style.display = 'inline-block';
  }

  wsClient.setUndoStateChangeHandler(({ canUndo, canRedo }) => {
    hud.updateUndoRedoButtons(canUndo, canRedo);
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      wsClient.sendUndo();
    } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      wsClient.sendRedo();
    }
  }, { capture: false });
}
