// brett/public/assets/loadout-modal.mjs
const MELEE = ['club', 'katana'];
const RANGED = ['handgun'];

export function showLoadoutModal(modeState) {
  const current = modeState.loadout();
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'mode-select-overlay';
    el.innerHTML = `
      <div class="mode-select-card">
        <h2>Wähle deine Startausrüstung</h2>
        <div class="loadout-cols">
          <div>
            <h3>Nahkampf</h3>
            ${MELEE.map(w => `<button class="weapon-pick ${current.melee===w?'active':''}" data-slot="melee" data-w="${w}">
              <img src="assets/hud/icon-${w}.png" alt="${w}">
              <span>${w}</span>
            </button>`).join('')}
          </div>
          <div>
            <h3>Fernkampf</h3>
            ${RANGED.map(w => `<button class="weapon-pick ${current.ranged===w?'active':''}" data-slot="ranged" data-w="${w}">
              <img src="assets/hud/icon-${w}.png" alt="${w}">
              <span>${w}</span>
            </button>`).join('')}
          </div>
        </div>
        <button class="confirm">Spielen</button>
      </div>
    `;
    document.body.appendChild(el);
    const sel = { ...current };
    el.addEventListener('click', e => {
      const w = e.target.closest('.weapon-pick');
      if (w) {
        sel[w.dataset.slot] = w.dataset.w;
        el.querySelectorAll(`[data-slot="${w.dataset.slot}"]`).forEach(b => b.classList.toggle('active', b === w));
        return;
      }
      if (e.target.classList.contains('confirm')) {
        modeState.setLoadout(sel);
        el.remove();
        resolve(sel);
      }
    });
  });
}
