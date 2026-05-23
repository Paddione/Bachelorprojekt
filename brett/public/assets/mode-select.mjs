// brett/public/assets/mode-select.mjs
export function showModeSelect(modeState) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'mode-select-overlay';
    el.innerHTML = `
      <div class="mode-select-card">
        <h2>Wähle deinen Modus</h2>
        <div class="mode-grid">
          <button class="mode-card" data-mode="coaching">
            <div class="title">Coaching</div>
            <div class="sub">Systemische Aufstellung</div>
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
