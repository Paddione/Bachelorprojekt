// Combat HUD overlay component
// Pure DOM manipulation — no dependencies

export function mountCombatHud(root) {
  root.innerHTML = `
    <div id="combat-hud" hidden>
      <div class="hp-wrap"><div class="hp-fill"></div><span class="hp-text">100</span></div>
      <div class="weapon-slots">
        <div class="slot" data-slot="melee"><img alt=""><span class="key">1</span></div>
        <div class="slot active" data-slot="ranged"><img alt=""><span class="key">2</span></div>
      </div>
      <div class="ammo"><span class="cur">12</span> / <span class="max">12</span></div>
      <div class="score-board" id="score-board"></div>
      <div class="mode-indicator">FFA</div>
      <div class="crosshair">+</div>
    </div>
  `;
}

export function setHP(root, hp) {
  root.querySelector('.hp-fill').style.width = `${Math.max(0, Math.min(100, hp))}%`;
  root.querySelector('.hp-text').textContent = Math.round(hp);
}

export function setSlot(root, slot, weaponKey) {
  const el = root.querySelector(`.slot[data-slot="${slot}"] img`);
  el.src = `assets/hud/icon-${weaponKey}.png`;
}

export function setActiveSlot(root, slot) {
  root.querySelectorAll('.slot').forEach(el => el.classList.toggle('active', el.dataset.slot === slot));
}

export function setAmmo(root, cur, max) {
  root.querySelector('.ammo .cur').textContent = cur;
  root.querySelector('.ammo .max').textContent = max ?? '∞';
}

export function setScores(root, scores) {
  const board = root.querySelector('#score-board');
  board.innerHTML = scores.slice(0, 3).map((s,i) => `
    <div class="score-row"><span class="rank">${i+1}</span><span class="name">${s.name}</span><span class="kills">${s.kills}</span></div>
  `).join('');
}

export function setVisible(root, on) {
  root.querySelector('#combat-hud').hidden = !on;
}
