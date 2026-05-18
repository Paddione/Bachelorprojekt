// brett/public/assets/touch/joystick.mjs
export function mountJoystick({ side, onMove, onSprint, onTap }) {
  const el = document.createElement('div');
  el.className = `joystick joystick-${side}`;
  el.innerHTML = `<div class="ring"></div><div class="knob"></div>`;
  document.body.appendChild(el);
  const knob = el.querySelector('.knob');

  let active = null;
  let originX = 0, originY = 0;
  const radius = 60;
  let sprintTimer = 0;
  let lastTap = 0;

  function onStart(e) {
    if (active !== null) return;
    const t = e.touches?.[0] ?? e;
    active = t.identifier ?? 'mouse';
    originX = t.clientX; originY = t.clientY;
    el.style.left = (originX - 70) + 'px';
    el.style.top = (originY - 70) + 'px';
    el.classList.add('visible');
    sprintTimer = Date.now();
    e.preventDefault();
  }
  function onMoveEvt(e) {
    if (active === null) return;
    const t = [...(e.touches ?? [e])].find(x => (x.identifier ?? 'mouse') === active);
    if (!t) return;
    let dx = t.clientX - originX, dy = t.clientY - originY;
    const d = Math.hypot(dx, dy);
    if (d > radius) { dx = dx/d * radius; dy = dy/d * radius; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / radius, ny = dy / radius;
    onMove?.({ x: nx, y: ny });
    if (d >= radius * 0.95 && Date.now() - sprintTimer > 1500) onSprint?.(true);
    e.preventDefault();
  }
  function onEnd(e) {
    const t = [...(e.changedTouches ?? [e])].find(x => (x.identifier ?? 'mouse') === active);
    if (!t || active === null) return;
    knob.style.transform = '';
    onMove?.({ x: 0, y: 0 });
    onSprint?.(false);
    const dur = Date.now() - sprintTimer;
    if (dur < 200) {
      if (Date.now() - lastTap < 300) onTap?.({ doubleTap: true });
      else onTap?.({ doubleTap: false });
      lastTap = Date.now();
    }
    active = null;
    el.classList.remove('visible');
  }

  el.addEventListener('touchstart', onStart, { passive: false });
  el.addEventListener('touchmove', onMoveEvt, { passive: false });
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onEnd);

  return { destroy: () => el.remove() };
}
