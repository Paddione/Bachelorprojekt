// brett/public/assets/touch/touch-hud.mjs
export function mountTouchHud({ onFireStart, onFireEnd, onReload, onWeaponSwitch }) {
  const wrap = document.createElement('div');
  wrap.id = 'touch-hud';
  wrap.innerHTML = `
    <button class="fire-btn" aria-label="Feuer">●</button>
    <button class="reload-btn" aria-label="Nachladen">R</button>
  `;
  document.body.appendChild(wrap);

  const fire = wrap.querySelector('.fire-btn');
  fire.addEventListener('touchstart', e => { onFireStart?.(); e.preventDefault(); }, { passive: false });
  fire.addEventListener('touchend', e => { onFireEnd?.(); e.preventDefault(); }, { passive: false });
  wrap.querySelector('.reload-btn').addEventListener('touchend', () => onReload?.());

  return { destroy: () => wrap.remove() };
}
