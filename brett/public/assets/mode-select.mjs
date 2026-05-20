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
          <button class="mode-card" data-mode="ffa">
            <div class="title">FFA</div>
            <div class="sub">Jeder gegen jeden</div>
          </button>
          <button class="mode-card" data-mode="mayhem-solo">
            <div class="title">🥊 Mayhem — Solo</div>
            <div class="sub">1 Spieler vs. 3 KI-Gegner · Sofort starten</div>
          </button>
          <button class="mode-card disabled" data-mode="teams" disabled>
            <div class="title">Teams</div>
            <div class="sub">Coming soon</div>
          </button>
          <button class="mode-card disabled" data-mode="coop" disabled>
            <div class="title">Coop</div>
            <div class="sub">Coming soon</div>
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
