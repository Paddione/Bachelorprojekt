// brett/public/assets/mode-select.mjs
export function showModeSelect(modeState, cfg = { defaultMode: 'coaching', availableModes: ['coaching'] }) {
  const modes = cfg.availableModes || ['coaching'];

  // Single mode → skip overlay, auto-enter
  if (modes.length === 1) {
    modeState.setMode(modes[0]);
    return Promise.resolve(modes[0]);
  }

  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'mode-select-overlay';
    const isMayhemDefault = cfg.defaultMode === 'mayhem';
    el.innerHTML = `
      <div class="mode-select-card">
        <h2>Wähle deinen Modus</h2>
        <div class="mode-grid">
          <button class="mode-card" data-mode="coaching">
            <div class="title">Coaching</div>
            <div class="sub">Systemische Aufstellung</div>
          </button>
          <button class="mode-card mode-card-mayhem${isMayhemDefault ? ' mode-card-default' : ''}" data-mode="mayhem">
            <div class="title">🤸 Mayhem${isMayhemDefault ? ' <span class="badge">Standard</span>' : ''}</div>
            <div class="sub">3D Kampfmodus · Waffen · Fahrzeuge</div>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      const card = e.target.closest('.mode-card');
      if (!card || card.disabled) return;
      const mode = card.dataset.mode;
      modeState.setMode(mode);
      el.remove();
      resolve(mode);
    });
  });
}
