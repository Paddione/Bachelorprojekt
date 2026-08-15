const loader = new THREE.TextureLoader();
const cache = {};
function tex(path) { return cache[path] ??= loader.load(path); }

const BLOOD_VARIANTS = [1,2,3,4].map(i => `assets/sprites/blood-splat-0${i}.png`);

export function spawnBloodDecal(scene, hitPoint, hitNormal) {
  const variant = BLOOD_VARIANTS[Math.floor(Math.random() * 4)];
  const mat = new THREE.MeshBasicMaterial({
    map: tex(variant), transparent: true, depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const geo = new THREE.PlaneGeometry(1.2, 1.2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(hitPoint).addScaledVector(hitNormal, 0.01);
  mesh.lookAt(hitPoint.clone().add(hitNormal));
  mesh.rotation.z = Math.random() * Math.PI * 2;
  scene.add(mesh);
  setTimeout(() => scene.remove(mesh), 30_000);
}

export function spawnMuzzleFlash(scene, originPos, dir) {
  const mat = new THREE.SpriteMaterial({
    map: tex('assets/sprites/muzzle-flash.png'),
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.6, 0.6, 0.6);
  s.position.copy(originPos);
  s.material.rotation = Math.random() * Math.PI * 2;
  scene.add(s);
  setTimeout(() => scene.remove(s), 80);
}

export function spawnSlashArc(scene, originPos, forward) {
  const mat = new THREE.SpriteMaterial({
    map: tex('assets/sprites/slash-arc.png'),
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(2, 1, 1);
  s.position.copy(originPos).addScaledVector(forward, 1.2);
  scene.add(s);
  const start = Date.now();
  function fade() {
    const t = (Date.now() - start) / 150;
    if (t >= 1) { scene.remove(s); return; }
    s.material.opacity = 1 - t;
    requestAnimationFrame(fade);
  }
  fade();
}

export function spawnSmokePuff(scene, pos) {
  const mat = new THREE.SpriteMaterial({
    map: tex('assets/sprites/smoke-puff.png'),
    transparent: true, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.position.copy(pos);
  scene.add(s);
  const start = Date.now();
  function tick() {
    const t = (Date.now() - start) / 600;
    if (t >= 1) { scene.remove(s); return; }
    s.scale.setScalar(0.5 + t * 1.5);
    s.material.opacity = 0.8 * (1 - t);
    requestAnimationFrame(tick);
  }
  tick();
}

export function spawnFireSprite(scene, pos) {
  const t = tex('assets/sprites/fire-sprite.png');
  t.repeat.x = 0.25;
  const mat = new THREE.SpriteMaterial({
    map: t, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(1, 1, 1);
  s.position.copy(pos);
  scene.add(s);
  const start = Date.now();
  function tick() {
    const elapsed = Date.now() - start;
    if (elapsed > 3000) { scene.remove(s); return; }
    const frame = Math.floor(elapsed / (1000/12)) % 4;
    t.offset.x = frame * 0.25;
    requestAnimationFrame(tick);
  }
  tick();
}
