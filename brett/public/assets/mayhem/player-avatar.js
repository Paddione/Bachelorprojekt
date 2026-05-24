(function () {
'use strict';
const STATE = Object.freeze({
  IDLE: 'idle', RUNNING: 'running', FLAILING: 'flailing',
  RAGDOLL: 'ragdoll', RECOVERING: 'recovering', DEAD: 'dead',
});
const WALK_SPEED = 2.6;
const SPRINT_MUL = 1.6;
const JUMP_VY = 4.0;
const FLAIL_AMP_SHOULDER = Math.PI / 2;
const FLAIL_AMP_ELBOW    = Math.PI / 3;
const RAGDOLL_DURATION_MS = 3000;
const RECOVER_DURATION_MS = 400;
const HIT_DEBOUNCE_MS = 200;

class PlayerAvatar {
  constructor({ id, mannequin, local, color, skinId }) {
    this.id = id;
    this.mannequin = mannequin;
    this.local = !!local;
    this.color = color;
    this.skinId = skinId || 'default';
    this.skin = null;            // set when SkinController.load() resolves
    this._pendingWeaponDef = null; // re-applied once skin loads
    this.state = STATE.IDLE;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.facingY = 0;
    this.flailing = false;
    this.ragdollUntil = 0;
    this.recoverUntil = 0;
    this.lastHits = new Map();
    this.netTarget = null;
    this._t = 0;
    this.hp = 100;
    this.burnInterval = null;
    this._weaponMesh = null;
    this.heroId          = null;
    this.heroColor       = null;
    this.speedMultiplier = 1.0;
    this.shielded        = false;
    this._slowTimer      = null;
    this._applyColor();

    if (this.skinId !== 'default' && window.MayhemSkinController) {
      window.MayhemSkinController.load(this.skinId, mannequin)
        .then(ctrl => this._adoptSkin(ctrl))
        .catch(err => {
          console.warn(`[brett] skin "${this.skinId}" failed to load, falling back to mannequin:`, err.message);
          this.skinId = 'default';
        });
    }
  }

  _adoptSkin(ctrl) {
    if (!ctrl) return;
    this.skin = ctrl;
    // Hide all mannequin meshes (keep bones for capsule/wrist math).
    this.mannequin.root.traverse(obj => {
      if (obj.isMesh) obj.visible = false;
    });
    // Attach skin mesh under mannequin.root so it inherits root position/rotation.
    this.mannequin.root.add(ctrl.mesh);
    // Re-attach weapon to the skin's right wrist if we had one queued.
    if (this._pendingWeaponDef) this.setWeapon(this._pendingWeaponDef);
  }
  _applyColor() {
    const torso = this.mannequin.hips.children[0];
    if (torso && torso.material) torso.material.color.setStyle(this.color);
  }
  setInput(input) { this._input = input; }
  setNetState(payload) { this.netTarget = payload; }
  getStatePayload() {
    return {
      x: this.mannequin.root.position.x,
      y: this.mannequin.root.position.y,
      z: this.mannequin.root.position.z,
      yaw: this.facingY,
      anim: this.state,
      flailing: this.flailing,
      heroId: this.heroId,
      vehicleType: this._vehicle ? this._vehicle.type : null,
    };
  }
  applyDamage(amount) {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
  }

  get isDead() { return this.hp <= 0; }

  resetHp() {
    this.hp = 100;
    if (this.burnInterval) { clearInterval(this.burnInterval); this.burnInterval = null; }
  }

  resetHero() {
    this.speedMultiplier = 1.0;
    this.shielded        = false;
    if (this._slowTimer) { clearTimeout(this._slowTimer); this._slowTimer = null; }
    if (this.weaponSystem && typeof this.weaponSystem.resetCooldowns === 'function') {
      this.weaponSystem.resetCooldowns();
    }
    if (this._vehicle) {
      if (typeof window !== 'undefined' && window.MayhemVehicle && window.MayhemVehicle.despawn) {
        window.MayhemVehicle.despawn(this._vehicle, this.mannequin.root.parent);
      }
      this._vehicle = null;
    }
    if (this._remoteVehicleMesh) {
      this.mannequin.root.remove(this._remoteVehicleMesh);
      this._remoteVehicleMesh = null;
    }
    this._remoteVehicleType = null;
  }

  setTorsoColor(hexColor) {
    // Mannequin body parts use MeshLambertMaterial.
    // Walk the mesh hierarchy and tint non-joint materials.
    if (!this.mannequin || !this.mannequin.root) return;
    this.mannequin.root.traverse(obj => {
      if (obj.isMesh && obj.material && !obj.userData.isJoint) {
        obj.material = obj.material.clone();
        obj.material.color.setHex(hexColor);
      }
    });
  }

  applySlowDebuff(factor, durationMs) {
    this.speedMultiplier = factor;
    if (this._slowTimer) clearTimeout(this._slowTimer);
    this._slowTimer = setTimeout(() => {
      this.speedMultiplier = 1.0;
      this._slowTimer = null;
    }, durationMs);
  }

  startBurn(damagePerSec, durationSec, onTick) {
    if (this.burnInterval) { clearInterval(this.burnInterval); }
    let elapsed = 0;
    this.burnInterval = setInterval(() => {
      elapsed++;
      this.applyDamage(damagePerSec);
      if (onTick) onTick(this.hp);
      if (elapsed >= durationSec || this.isDead) {
        clearInterval(this.burnInterval);
        this.burnInterval = null;
      }
    }, 1000);
  }

  applyHit(impulse, source) {
    if (this.isDead) return;
    this.state = STATE.RAGDOLL;
    this.ragdollUntil = performance.now() + RAGDOLL_DURATION_MS;
    this.vx = impulse.x;
    this.vz = impulse.z;
    this.vy = source === 'vehicle' ? 5.0 : 3.0;
    const b = this.mannequin.bone;
    for (const k of Object.keys(b)) {
      b[k].velocity.x = (Math.random() - 0.5) * 6;
      b[k].velocity.z = (Math.random() - 0.5) * 6;
      b[k].targetRot.x = 0;
      b[k].targetRot.z = 0;
    }
  }
  canHit(victimId) {
    const t = performance.now();
    const last = this.lastHits.get(victimId) || 0;
    if (t - last < HIT_DEBOUNCE_MS) return false;
    this.lastHits.set(victimId, t);
    return true;
  }
  update(dt, camYaw) {
    const now = performance.now();
    this._t += dt;
    if (this.state === STATE.RAGDOLL) { this._updateRagdoll(dt, now); }
    else if (this.state === STATE.RECOVERING) { this._updateRecover(dt, now); }
    else {
      if (this.local) this._updateLocal(dt, camYaw, now);
      else this._updateRemote(dt);
      this._animate(dt);
    }
    if (this.skin) {
      this.skin.update(dt, { state: this.state, sprint: !!(this._input && this._input.sprint) });
    }
  }
  _updateLocal(dt, camYaw, now) {
    const inp = this._input || {};
    let fx = 0, fz = 0;
    if (inp.forward)  { fx -= Math.sin(camYaw); fz -= Math.cos(camYaw); }
    if (inp.backward) { fx += Math.sin(camYaw); fz += Math.cos(camYaw); }
    if (inp.left)     { fx += Math.sin(camYaw - Math.PI/2); fz += Math.cos(camYaw - Math.PI/2); }
    if (inp.right)    { fx += Math.sin(camYaw + Math.PI/2); fz += Math.cos(camYaw + Math.PI/2); }
    const mag = Math.hypot(fx, fz);
    const speed = WALK_SPEED * (inp.sprint ? SPRINT_MUL : 1) * this.speedMultiplier;
    if (mag > 0.01) {
      this.vx = (fx / mag) * speed;
      this.vz = (fz / mag) * speed;
      this.facingY = Math.atan2(fx, fz);
      this.state = STATE.RUNNING;
    } else {
      this.vx = 0; this.vz = 0;
      this.state = STATE.IDLE;
    }
    if (inp.jump && this.mannequin.root.position.y <= 0.001) {
      this.vy = JUMP_VY;
    }
    this.vy -= 9.8 * dt;
    this.mannequin.root.position.x += this.vx * dt;
    this.mannequin.root.position.y += this.vy * dt;
    this.mannequin.root.position.z += this.vz * dt;
    if (this.mannequin.root.position.y < 0) {
      this.mannequin.root.position.y = 0; this.vy = 0;
    }
    this.mannequin.root.rotation.y = this.facingY;
    this.flailing = !!inp.flail;
    if (this.flailing) this.state = STATE.FLAILING;
  }
  _updateRemote(dt) {
    if (!this.netTarget) return;
    const r = this.mannequin.root;
    const a = 0.2;
    r.position.x += (this.netTarget.x - r.position.x) * a;
    r.position.y += (this.netTarget.y - r.position.y) * a;
    r.position.z += (this.netTarget.z - r.position.z) * a;
    this.facingY += (this.netTarget.yaw - this.facingY) * a;
    r.rotation.y = this.facingY;
    this.state = this.netTarget.anim || STATE.IDLE;
    this.flailing = !!this.netTarget.flailing;

    const netVehicle = this.netTarget.vehicleType;
    if (netVehicle !== this._remoteVehicleType) {
      if (this._remoteVehicleMesh) {
        this.mannequin.root.remove(this._remoteVehicleMesh);
        this._remoteVehicleMesh = null;
      }
      this._remoteVehicleType = netVehicle;
      if (netVehicle) {
        const THREE = window.THREE;
        const size = netVehicle === 'motorcycle' ? { w: 0.6, h: 0.7, d: 1.4 } : { w: 1.6, h: 0.9, d: 2.0 };
        const color = netVehicle === 'motorcycle' ? 0xc8a96e : 0x2a3040;
        const geo = new THREE.BoxGeometry(size.w, size.h, size.d);
        const mat = new THREE.MeshLambertMaterial({ color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, size.h / 2, 0);
        this.mannequin.root.add(mesh);
        this._remoteVehicleMesh = mesh;
      }
    }
  }
  _updateRagdoll(dt, now) {
    const physics = window.MayhemPhysics;
    const root = { y: this.mannequin.root.position.y, vy: this.vy };
    physics.integrateRagdollRoot(root, dt);
    this.mannequin.root.position.y = root.y;
    this.vy = root.vy;
    this.mannequin.root.position.x += this.vx * dt;
    this.mannequin.root.position.z += this.vz * dt;
    this.vx *= 0.96; this.vz *= 0.96;
    for (const k of Object.keys(this.mannequin.bone)) {
      physics.integrateRagdollBone(this.mannequin.bone[k], dt);
      this._applyBoneRotation(k);
    }
    if (now >= this.ragdollUntil) {
      this.state = STATE.RECOVERING;
      this.recoverUntil = now + RECOVER_DURATION_MS;
    }
  }
  _updateRecover(dt, now) {
    const t = 1 - Math.max(0, (this.recoverUntil - now) / RECOVER_DURATION_MS);
    for (const k of Object.keys(this.mannequin.bone)) {
      const b = this.mannequin.bone[k];
      b.currentRot.x *= (1 - t * 0.2);
      b.currentRot.z *= (1 - t * 0.2);
      b.velocity.x = 0; b.velocity.z = 0;
      this._applyBoneRotation(k);
    }
    this.mannequin.root.position.y += (1.0 - this.mannequin.root.position.y) * t * 0.2;
    if (now >= this.recoverUntil) {
      this.state = STATE.IDLE;
      this.mannequin.root.position.y = 0;
      for (const k of Object.keys(this.mannequin.bone)) {
        const b = this.mannequin.bone[k];
        b.currentRot.x = 0; b.currentRot.z = 0;
        this._applyBoneRotation(k);
      }
    }
  }
  _animate(dt) {
    const b = this.mannequin.bone;
    if (this.state === STATE.RUNNING || this.state === STATE.FLAILING) {
      const inp = this._input || {};
      const phase = this._t * (inp.sprint ? 14 : 10);
      b.lHip.targetRot.x = Math.sin(phase) * 0.6;
      b.rHip.targetRot.x = -Math.sin(phase) * 0.6;
      if (this.flailing) {
        b.lShoulder.targetRot.x = (Math.random() - 0.5) * 2 * FLAIL_AMP_SHOULDER;
        b.lShoulder.targetRot.z = (Math.random() - 0.5) * 2 * FLAIL_AMP_SHOULDER;
        b.rShoulder.targetRot.x = (Math.random() - 0.5) * 2 * FLAIL_AMP_SHOULDER;
        b.rShoulder.targetRot.z = (Math.random() - 0.5) * 2 * FLAIL_AMP_SHOULDER;
        b.lElbow.targetRot.x = (Math.random() - 0.5) * 2 * FLAIL_AMP_ELBOW;
        b.rElbow.targetRot.x = (Math.random() - 0.5) * 2 * FLAIL_AMP_ELBOW;
      } else {
        b.lShoulder.targetRot.x = -Math.sin(phase) * 0.6;
        b.rShoulder.targetRot.x =  Math.sin(phase) * 0.6;
        b.lElbow.targetRot.x = 0; b.rElbow.targetRot.x = 0;
      }
    } else if (this.state === STATE.IDLE) {
      for (const k of Object.keys(b)) {
        b[k].targetRot.x = 0; b[k].targetRot.z = 0;
      }
    }
    const STIFF = 0.65, DAMP = 0.85;
    for (const k of Object.keys(b)) {
      const bs = b[k];
      const ax = (bs.targetRot.x - bs.currentRot.x) * STIFF;
      const az = (bs.targetRot.z - bs.currentRot.z) * STIFF;
      bs.velocity.x = bs.velocity.x * DAMP + ax * dt * 60;
      bs.velocity.z = bs.velocity.z * DAMP + az * dt * 60;
      bs.currentRot.x += bs.velocity.x * dt;
      bs.currentRot.z += bs.velocity.z * dt;
      this._applyBoneRotation(k);
    }
  }
  _applyBoneRotation(name) {
    const node = this.mannequin.bones[name];
    if (!node) return;
    const r = this.mannequin.bone[name].currentRot;
    node.rotation.x = r.x;
    node.rotation.z = r.z;
    if (this.skin) {
      const skinBone = this.skin.getBone(name);
      if (skinBone) {
        skinBone.rotation.x = r.x;
        skinBone.rotation.z = r.z;
      }
    }
  }
  getCapsule() {
    return {
      x: this.mannequin.root.position.x,
      y: this.mannequin.root.position.y,
      z: this.mannequin.root.position.z,
      radius: 0.35, height: 1.8,
    };
  }
  getWristWorldPositions() {
    const out = [];
    for (const name of ['lWrist', 'rWrist']) {
      const node = this.mannequin.bones[name];
      if (!node) continue;
      const v = new window.THREE.Vector3();
      node.getWorldPosition(v);
      out.push({ x: v.x, y: v.y, z: v.z, radius: 0.18 });
    }
    return out;
  }
  remove(scene) {
    if (this.skin) { this.skin.dispose(scene); this.skin = null; }
    scene.remove(this.mannequin.root);
    if (this._vehicle) {
      if (typeof window !== 'undefined' && window.MayhemVehicle && window.MayhemVehicle.despawn) {
        window.MayhemVehicle.despawn(this._vehicle, scene);
      }
      this._vehicle = null;
    }
    if (this._remoteVehicleMesh) {
      this.mannequin.root.remove(this._remoteVehicleMesh);
      this._remoteVehicleMesh = null;
    }
    this._remoteVehicleType = null;
  }

  setWeapon(weaponDef) {
    this._pendingWeaponDef = weaponDef || null;
    const attach = (this.skin && this.skin.getBone('rWrist')) || (this.mannequin.bones && this.mannequin.bones.rWrist);
    if (!attach) return;
    if (this._weaponMesh) {
      if (this._weaponMesh.parent) this._weaponMesh.parent.remove(this._weaponMesh);
      this._weaponMesh = null;
    }
    if (!weaponDef) return;
    this._weaponMesh = PlayerAvatar._mkWeaponMesh(weaponDef.key, window.THREE);
    if (this._weaponMesh) attach.add(this._weaponMesh);
  }

  static _mkWeaponMesh(key, THREE) {
    if (!THREE) return null;
    switch (key) {
      case 'handgun': {
        const g = new THREE.Group();
        // Barrel points in +Z so it faces the same direction as projectiles
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.28), new THREE.MeshBasicMaterial({ color: 0x888888 }));
        barrel.position.set(0.05, -0.06, 0.08);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), new THREE.MeshBasicMaterial({ color: 0x555555 }));
        grip.position.set(0.05, -0.18, -0.02);
        g.add(barrel, grip);
        return g;
      }
      case 'rifle': {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.58), new THREE.MeshBasicMaterial({ color: 0x666666 }));
        body.position.set(0.05, -0.08, 0.18);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.16), new THREE.MeshBasicMaterial({ color: 0xa07830 }));
        stock.position.set(0.05, -0.10, -0.12);
        g.add(body, stock);
        return g;
      }
      case 'fireball': {
        const g = new THREE.Group();
        const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.50, 6), new THREE.MeshBasicMaterial({ color: 0xb85a20 }));
        staff.position.set(0, -0.25, 0);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 7), new THREE.MeshBasicMaterial({ color: 0xff6600 }));
        orb.position.set(0, 0.08, 0);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.065, 5, 5), new THREE.MeshBasicMaterial({ color: 0xffee00 }));
        orb.add(glow);
        g.add(staff, orb);
        return g;
      }
      case 'club': {
        const g = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.38, 6), new THREE.MeshBasicMaterial({ color: 0xa07830 }));
        handle.position.set(0, -0.19, 0);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 7, 6), new THREE.MeshBasicMaterial({ color: 0x7a5400 }));
        head.position.set(0, 0.09, 0);
        g.add(handle, head);
        return g;
      }
      case 'katana': {
        const g = new THREE.Group();
        // Blade extends in +Z so tip points toward enemy (fire direction)
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.80), new THREE.MeshBasicMaterial({ color: 0xe8e8e8 }));
        blade.position.set(0.05, -0.08, 0.32);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.03), new THREE.MeshBasicMaterial({ color: 0xddaa00 }));
        guard.position.set(0.05, -0.08, -0.07);
        g.add(blade, guard);
        return g;
      }
      default: return null;
    }
  }
}

PlayerAvatar.STATE = STATE;
if (typeof window !== 'undefined') window.MayhemPlayerAvatar = PlayerAvatar;
})();
