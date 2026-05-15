'use strict';
const STATE = Object.freeze({
  IDLE: 'idle', RUNNING: 'running', FLAILING: 'flailing',
  RAGDOLL: 'ragdoll', RECOVERING: 'recovering',
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
  constructor({ id, mannequin, local, color }) {
    this.id = id;
    this.mannequin = mannequin;
    this.local = !!local;
    this.color = color;
    this.state = STATE.IDLE;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.facingY = 0;
    this.flailing = false;
    this.ragdollUntil = 0;
    this.recoverUntil = 0;
    this.lastHits = new Map();
    this.netTarget = null;
    this._t = 0;
    this._applyColor();
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
    };
  }
  applyHit(impulse, source) {
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
    if (this.state === STATE.RAGDOLL) return this._updateRagdoll(dt, now);
    if (this.state === STATE.RECOVERING) return this._updateRecover(dt, now);
    if (this.local) this._updateLocal(dt, camYaw, now);
    else this._updateRemote(dt);
    this._animate(dt);
  }
  _updateLocal(dt, camYaw, now) {
    const inp = this._input || {};
    let fx = 0, fz = 0;
    if (inp.forward)  { fx += Math.sin(camYaw); fz += Math.cos(camYaw); }
    if (inp.backward) { fx -= Math.sin(camYaw); fz -= Math.cos(camYaw); }
    if (inp.left)     { fx += Math.sin(camYaw - Math.PI/2); fz += Math.cos(camYaw - Math.PI/2); }
    if (inp.right)    { fx += Math.sin(camYaw + Math.PI/2); fz += Math.cos(camYaw + Math.PI/2); }
    const mag = Math.hypot(fx, fz);
    const speed = WALK_SPEED * (inp.sprint ? SPRINT_MUL : 1);
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
      const phase = this._t * 8;
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
    scene.remove(this.mannequin.root);
  }
}

PlayerAvatar.STATE = STATE;
if (typeof window !== 'undefined') window.MayhemPlayerAvatar = PlayerAvatar;
