// brett/public/assets/combat/respawn.mjs
export function showRespawnOverlay({ killerName, durationMs = 3000 }) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'respawn-overlay';
    el.innerHTML = `
      <div class="card">
        <div class="msg">Eliminiert${killerName ? ' von ' + killerName : ''}</div>
        <div class="countdown">3</div>
      </div>
    `;
    document.body.appendChild(el);
    const cdEl = el.querySelector('.countdown');
    let left = Math.ceil(durationMs / 1000);
    const tick = setInterval(() => {
      left--;
      if (left <= 0) { clearInterval(tick); el.remove(); resolve(); }
      else cdEl.textContent = left;
    }, 1000);
  });
}
