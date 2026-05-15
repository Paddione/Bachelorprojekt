'use strict';
// Visual effects: blood splat particles, fire particles, impact dust, floating damage numbers.
// All effects are fire-and-forget; they remove themselves from the scene when done.

const BLOOD_COLOR   = 0xcc0000;
const FIRE_COLOR_A  = 0xff5500;
const FIRE_COLOR_B  = 0xffcc00;
const DUST_COLOR    = 0xbbaa88;

function randBetween(a, b) { return a + Math.random() * (b - a); }

// ─── Particle pool (shared across all effects) ────────────────────────────────
class Particle {
  constructor(mesh) {
    this.mesh  = mesh;
    this.vx    = 0; this.vy  = 0; this.vz = 0;
    this.life  = 0; this.maxLife = 1;
    this.scale = 1;
    this.dead  = false;
    this.onDie = null;
  }

  update(dt) {
    if (this.dead) return;
    this.vy -= 6 * dt;
    this.mesh.position.x += this.vx * dt;
    this.mesh.position.y += this.vy * dt;
    this.mesh.position.z += this.vz * dt;
    this.life -= dt;
    const t = Math.max(0, this.life / this.maxLife);
    this.mesh.material.opacity = t;
    const s = this.scale * t;
    this.mesh.scale.set(s, s, s);
    if (this.life <= 0) {
      this.dead = true;
      if (this.onDie) this.onDie(this);
    }
  }
}

class EffectsManager {
  constructor(scene) {
    this._scene = scene;
    this._particles = [];
    this._THREE = window.THREE;
  }

  // ── Blood splat ─────────────────────────────────────────────────────────────
  spawnBloodSplat(pos) {
    const count = 10 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const geo = new this._THREE.SphereGeometry(0.04 + Math.random() * 0.06, 4, 4);
      const mat = new this._THREE.MeshBasicMaterial({ color: BLOOD_COLOR, transparent: true, opacity: 1 });
      const mesh = new this._THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, pos.y, pos.z);
      this._scene.add(mesh);

      const p = new Particle(mesh);
      p.vx = randBetween(-4, 4);
      p.vy = randBetween(1, 5);
      p.vz = randBetween(-4, 4);
      p.scale = 1;
      p.life = p.maxLife = randBetween(0.4, 0.9);
      p.onDie = (prt) => this._scene.remove(prt.mesh);
      this._particles.push(p);
    }
    // Decal — flat circle on the ground after half a second
    setTimeout(() => this._spawnBloodDecal(pos), 500);
  }

  _spawnBloodDecal(pos) {
    const geo = new this._THREE.CircleGeometry(0.25 + Math.random() * 0.2, 8);
    const mat = new this._THREE.MeshBasicMaterial({ color: 0x880000, transparent: true, opacity: 0.7, depthWrite: false });
    const mesh = new this._THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x + randBetween(-0.2, 0.2), 0.01, pos.z + randBetween(-0.2, 0.2));
    this._scene.add(mesh);
    // Fade over 8 s
    const start = performance.now();
    const fade = () => {
      const t = (performance.now() - start) / 8000;
      mat.opacity = Math.max(0, 0.7 * (1 - t));
      if (t < 1) requestAnimationFrame(fade);
      else this._scene.remove(mesh);
    };
    requestAnimationFrame(fade);
  }

  // ── Fireball explosion ──────────────────────────────────────────────────────
  spawnFireball(pos) {
    const THREE = this._THREE;
    // Flash sphere
    const flashGeo = new THREE.SphereGeometry(0.6, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: FIRE_COLOR_B, transparent: true, opacity: 1 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(pos);
    this._scene.add(flash);
    let age = 0;
    const expandFlash = () => {
      age += 0.016;
      flash.scale.setScalar(1 + age * 4);
      flashMat.opacity = Math.max(0, 1 - age * 4);
      if (age < 0.25) requestAnimationFrame(expandFlash);
      else this._scene.remove(flash);
    };
    requestAnimationFrame(expandFlash);

    // Fire particles
    const count = 20;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.08 + Math.random() * 0.1, 4, 4);
      const color = Math.random() > 0.5 ? FIRE_COLOR_A : FIRE_COLOR_B;
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, pos.y, pos.z);
      this._scene.add(mesh);

      const p = new Particle(mesh);
      p.vx = randBetween(-3, 3);
      p.vy = randBetween(2, 6);
      p.vz = randBetween(-3, 3);
      p.scale = 1;
      p.life = p.maxLife = randBetween(0.5, 1.2);
      p.onDie = (prt) => this._scene.remove(prt.mesh);
      this._particles.push(p);
    }
    this.spawnBloodSplat(pos); // victims get blood on impact
  }

  // ── Impact dust ─────────────────────────────────────────────────────────────
  spawnImpactDust(pos) {
    for (let i = 0; i < 6; i++) {
      const geo = new this._THREE.SphereGeometry(0.05, 4, 4);
      const mat = new this._THREE.MeshBasicMaterial({ color: DUST_COLOR, transparent: true, opacity: 0.8 });
      const mesh = new this._THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, pos.y, pos.z);
      this._scene.add(mesh);

      const p = new Particle(mesh);
      p.vx = randBetween(-1.5, 1.5);
      p.vy = randBetween(0.5, 2);
      p.vz = randBetween(-1.5, 1.5);
      p.scale = 1;
      p.life = p.maxLife = randBetween(0.3, 0.6);
      p.onDie = (prt) => this._scene.remove(prt.mesh);
      this._particles.push(p);
    }
  }

  // ── Floating damage number ───────────────────────────────────────────────────
  spawnDamageNumber(pos, amount) {
    // Uses a canvas texture — works without a font asset.
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = amount > 0 ? '#ff4444' : '#44ff44';
    ctx.textAlign = 'center';
    ctx.fillText(`-${amount}`, 64, 44);

    const tex  = new this._THREE.CanvasTexture(canvas);
    const geo  = new this._THREE.PlaneGeometry(0.8, 0.4);
    const mat  = new this._THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: this._THREE.DoubleSide });
    const mesh = new this._THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y + 2.2, pos.z);
    this._scene.add(mesh);

    let age = 0;
    const drift = () => {
      age += 0.016;
      mesh.position.y += 0.016;
      mat.opacity = Math.max(0, 1 - age * 1.2);
      // Always face camera if available
      if (window._mayhemCamera) mesh.quaternion.copy(window._mayhemCamera.quaternion);
      if (age < 0.8) requestAnimationFrame(drift);
      else { this._scene.remove(mesh); tex.dispose(); }
    };
    requestAnimationFrame(drift);
  }

  // ── Per-frame update ─────────────────────────────────────────────────────────
  update(dt) {
    for (const p of this._particles) p.update(dt);
    this._particles = this._particles.filter(p => !p.dead);
  }
}

if (typeof window !== 'undefined') {
  window.MayhemEffects = null; // set to instance in mayhem.js
  window.MayhemEffectsClass = EffectsManager;
}
