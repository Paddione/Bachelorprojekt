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

  spawnSmokePuff(scene, pos) {
    // If scene is passed as first arg (per the plan), we can use it or ignore it.
    // Let's support both signature signatures: spawnSmokePuff(pos) and spawnSmokePuff(scene, pos)
    const actualPos = pos || scene;
    this.spawnImpactDust(actualPos);
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

  spawnFrostnovaEffect(scene, origin) {
    const THREE = this._THREE;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6fa8d8, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
    });
    let radius = 0.05;
    const updateGeo = () => new THREE.TorusGeometry(radius, 0.06, 8, 32);
    const mesh = new THREE.Mesh(updateGeo(), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(origin.x, 0.15, origin.z);
    scene.add(mesh);

    const start  = performance.now();
    const EXPAND = 300;    // ms to reach max radius
    const FADE   = 200;    // ms to fade after expanding

    const animate = (now) => {
      const elapsed = now - start;
      if (elapsed < EXPAND) {
        radius = 2.5 * (elapsed / EXPAND);
        mesh.geometry.dispose();
        mesh.geometry = updateGeo();
      } else if (elapsed < EXPAND + FADE) {
        mat.opacity = 0.8 * (1 - (elapsed - EXPAND) / FADE);
      } else {
        scene.remove(mesh);
        mesh.geometry.dispose();
        return;
      }
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  // ── Martina minion: shield ring ───────────────────────────────────────────────
  spawnShieldRing(targetMesh) {
    if (!targetMesh || !this._THREE) return;
    this.removeShieldRing(targetMesh);
    const geo = new this._THREE.TorusGeometry(0.35, 0.04, 8, 24);
    const mat = new this._THREE.MeshLambertMaterial({ color: 0xd7b06a, transparent: true, opacity: 0.85 });
    const ring = new this._THREE.Mesh(geo, mat);
    ring.rotation.x = Math.PI / 2;
    targetMesh.add(ring);
    targetMesh._shieldRing = ring;
  }

  removeShieldRing(targetMesh) {
    if (targetMesh && targetMesh._shieldRing) {
      targetMesh.remove(targetMesh._shieldRing);
      targetMesh._shieldRing.geometry.dispose();
      targetMesh._shieldRing.material.dispose();
      targetMesh._shieldRing = null;
    }
  }

  // ── Martina minion: frenzy particles ─────────────────────────────────────────
  spawnFrenzyParticles(targetMesh) {
    if (!targetMesh || !this._THREE) return;
    this.clearFrenzyParticles(targetMesh, this._scene);
    const particles = [];
    for (let i = 0; i < 5; i++) {
      const geo = new this._THREE.SphereGeometry(0.04, 4, 4);
      const mat = new this._THREE.MeshLambertMaterial({ color: 0xff6622, transparent: true, opacity: 0.9 });
      const mesh = new this._THREE.Mesh(geo, mat);
      const angle = (i / 5) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 0.3, 0.5, Math.sin(angle) * 0.3);
      this._scene.add(mesh);
      particles.push({ mesh, angle, baseAngle: angle });
    }
    targetMesh._frenzyParticles = particles;
    const start = performance.now();
    const duration = 3000;
    const animate = (now) => {
      const elapsed = now - start;
      if (elapsed >= duration || !targetMesh._frenzyParticles) {
        this.clearFrenzyParticles(targetMesh, this._scene);
        return;
      }
      const worldPos = new this._THREE.Vector3();
      targetMesh.getWorldPosition(worldPos);
      for (const p of particles) {
        p.angle += 0.04;
        p.mesh.position.set(
          worldPos.x + Math.cos(p.angle) * 0.3,
          worldPos.y + 0.5,
          worldPos.z + Math.sin(p.angle) * 0.3,
        );
        p.mesh.material.opacity = Math.max(0, 0.9 * (1 - elapsed / duration));
      }
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  clearFrenzyParticles(targetMesh) {
    if (targetMesh && targetMesh._frenzyParticles) {
      for (const p of targetMesh._frenzyParticles) {
        this._scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      }
      targetMesh._frenzyParticles = null;
    }
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
