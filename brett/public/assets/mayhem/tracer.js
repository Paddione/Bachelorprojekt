'use strict';

function spawnTracer(scene, fromVec, toVec, weaponClass) {
  const THREE = window.THREE;
  const colors = {
    rifle:    { head: 0xfff5c8, glow: 0xf0d28c },
    handgun:  { head: 0xfff5c8, glow: 0xc8a96e },
    fireball: { head: 0xfff5c8, glow: 0xc4453a },
    stille:   { head: 0xdce0ff, glow: 0x6fa8d8 },
  }[weaponClass] || { head: 0xfff5c8, glow: 0xf0d28c };

  const g = new THREE.BufferGeometry().setFromPoints([fromVec.clone(), toVec.clone()]);
  const m = new THREE.LineBasicMaterial({
    color: colors.head,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(g, m);
  scene.add(line);

  const start = performance.now();
  function tick() {
    const t = (performance.now() - start) / 90; // 90ms life
    if (t >= 1) {
      scene.remove(line);
      m.dispose();
      g.dispose();
      return;
    }
    m.opacity = 0.9 * (1 - t);
    requestAnimationFrame(tick);
  }
  tick();
}

if (typeof window !== 'undefined') {
  window.MayhemTracer = { spawnTracer };
}
