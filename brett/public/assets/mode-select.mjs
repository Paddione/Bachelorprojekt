// brett/public/assets/mode-select.mjs
export function showModeSelect(modeState, cfg = { defaultMode: 'coaching', availableModes: ['coaching'] }) {
  const modes = cfg.availableModes || ['coaching'];
  const room = new URLSearchParams(location.search).get("room") || "default";
  const hasPrefixedRoom = room.startsWith('solo-') || room.startsWith('duel-') || room.startsWith('ffa-');

  // If entering a room that already has a game mode prefix, auto-enter Mayhem
  if (hasPrefixedRoom) {
    modeState.setMode('mayhem');
    return Promise.resolve('mayhem');
  }

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
        <h2 id="mode-select-title">Wähle deinen Modus</h2>
        <div class="mode-grid" id="mode-select-grid">
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
      if (card && !card.disabled && !card.classList.contains('sub-mode-card')) {
        const mode = card.dataset.mode;
        if (mode === 'mayhem') {
          // Show secondary picker instead of resolving immediately
          const title = el.querySelector('#mode-select-title');
          const grid = el.querySelector('#mode-select-grid');
          if (title && grid) {
            title.textContent = 'Spielmodus wählen';
            grid.innerHTML = `
              <button class="mode-card sub-mode-card" data-submode="solo">
                <div class="title">Solo</div>
                <div class="sub">Kampf gegen AI Bots</div>
              </button>
              <button class="mode-card sub-mode-card" data-submode="duel">
                <div class="title">1v1 Duel</div>
                <div class="sub">Gegen einen anderen Spieler</div>
              </button>
              <button class="mode-card sub-mode-card" data-submode="ffa">
                <div class="title">FFA Mayhem</div>
                <div class="sub">Jeder gegen jeden</div>
              </button>
            `;
            return;
          }
        }
        modeState.setMode(mode);
        el.remove();
        resolve(mode);
        return;
      }

      const subCard = e.target.closest('.sub-mode-card');
      if (subCard) {
        const submode = subCard.dataset.submode;
        const rand = Math.random().toString(36).slice(2, 8);
        const nextRoom = `${submode}-${rand}`;
        window.location.search = `?room=${nextRoom}`;
      }
    });
  });
}
