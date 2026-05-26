'use strict';

const WEAPON_TINTS = {
  rifle:    0xfff5c8,
  handgun:  0xc8a96e,
  fireball: 0xc4453a,
  stille:   0x6fa8d8,
};

function makeMuzzleFlashTexture() {
  const THREE = window.THREE;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');

  g.clearRect(0, 0, 128, 128);

  // 1. 4 sharp radial rays
  g.strokeStyle = 'rgba(255, 245, 200, 0.85)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(20, 64); g.lineTo(108, 64);
  g.moveTo(64, 20); g.lineTo(64, 108);
  g.stroke();

  // Flares
  g.fillStyle = 'rgba(255, 245, 200, 0.4)';
  g.beginPath();
  g.moveTo(28, 64); g.lineTo(64, 61); g.lineTo(100, 64); g.lineTo(64, 67);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(64, 28); g.lineTo(61, 64); g.lineTo(64, 100); g.lineTo(67, 64);
  g.closePath();
  g.fill();

  // 2. Center fire-tip (#fff5c8) core
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 20);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.3, '#fff5c8');
  grad.addColorStop(1, 'rgba(255, 245, 200, 0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(64, 64, 20, 0, Math.PI * 2);
  g.fill();

  // 3. 3 tiny blood-core specks (Brett signature)
  g.fillStyle = '#c4453a';
  const specks = [
    { x: 61, y: 62 },
    { x: 67, y: 65 },
    { x: 63, y: 68 }
  ];
  for (const s of specks) {
    g.beginPath();
    g.arc(s.x, s.y, 1.2, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function spawnMuzzleFlash(scene, originVec, dirVec, weaponClass, tex) {
  const THREE = window.THREE;
  const m = new THREE.SpriteMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: WEAPON_TINTS[weaponClass] || 0xfff5c8,
  });
  const sprite = new THREE.Sprite(m);
  sprite.position.copy(originVec);
  sprite.scale.setScalar(0.45);
  scene.add(sprite);

  const start = performance.now();
  function tick() {
    const t = (performance.now() - start) / 110; // 110ms life
    if (t >= 1) {
      scene.remove(sprite);
      m.dispose();
      return;
    }
    sprite.material.opacity = 1 - t;
    sprite.scale.setScalar(0.45 + t * 0.25);
    requestAnimationFrame(tick);
  }
  tick();
}

if (typeof window !== 'undefined') {
  window.MayhemMuzzleFlash = { makeMuzzleFlashTexture, spawnMuzzleFlash };
}
