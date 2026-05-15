'use strict';
// Projectile manager.
// Handles: spawn, per-frame movement, AABB/capsule collision, network hit emission.
// Effects (blood splat, fire) are delegated to MayhemEffects.

const GRAVITY = -9.8;
const MAX_LIFETIME_MS = 4000;
const PROJECTILE_RADIUS = 0.08;
const FIREBALL_RADIUS   = 0.22;

function mkBulletMesh(THREE) {
  const geo = new THREE.SphereGeometry(PROJECTILE_RADIUS, 5, 5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffee88 });
  return new THREE.Mesh(geo, mat);
}

function mkFireballMesh(THREE) {
  const geo = new THREE.SphereGeometry(FIREBALL_RADIUS, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
  const mesh = new THREE.Mesh(geo, mat);
  // Inner glow
  const gGeo = new THREE.SphereGeometry(FIREBALL_RADIUS * 0.6, 6, 6);
  const gMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
  mesh.add(new THREE.Mesh(gGeo, gMat));
  return mesh;
}

class ProjectileManager {
  // scene         — Three.js Scene
  // getAvatars    — () => Map<id, PlayerAvatar>
  // getObstacles  — () => [{ aabb }]
  // sendHit       — (victimId, weaponKey, shooterId) => void  (network)
  constructor(scene, getAvatars, getObstacles, sendHit) {
    this._scene       = scene;
    this._getAvatars  = getAvatars;
    this._getObstacles = getObstacles;
    this._sendHit     = sendHit;
    this._projectiles = [];
    this._THREE       = window.THREE;
  }

  spawn(weaponDef, originPos, dirVec, shooterId) {
    if (weaponDef.melee) {
      this._doMeleeCheck(weaponDef, originPos, dirVec, shooterId);
      return;
    }
    const THREE = this._THREE;
    const mesh = weaponDef.projectileType === 'fireball'
      ? mkFireballMesh(THREE)
      : mkBulletMesh(THREE);

    mesh.position.set(originPos.x, originPos.y + 1.2, originPos.z);
    this._scene.add(mesh);

    this._projectiles.push({
      mesh,
      vx: dirVec.x * weaponDef.projectileSpeed,
      vy: dirVec.y * weaponDef.projectileSpeed,
      vz: dirVec.z * weaponDef.projectileSpeed,
      radius: weaponDef.projectileType === 'fireball' ? FIREBALL_RADIUS : PROJECTILE_RADIUS,
      weaponDef,
      shooterId,
      born: performance.now(),
      dead: false,
    });
  }

  update(dt) {
    const now = performance.now();
    const avatars  = this._getAvatars();
    const obstacles = this._getObstacles();
    const physics  = window.MayhemPhysics;
    const effects  = window.MayhemEffects;

    for (const p of this._projectiles) {
      if (p.dead) continue;
      if (now - p.born > MAX_LIFETIME_MS) { this._kill(p); continue; }

      // Integrate
      if (p.weaponDef.projectileType !== 'fireball') p.vy += GRAVITY * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;

      if (p.mesh.position.y < 0) { this._kill(p); continue; }

      const pos = p.mesh.position;

      // Obstacle collision
      const projSphere = { x: pos.x, y: pos.y, z: pos.z, radius: p.radius, height: p.radius * 2 };
      let hitObstacle = false;
      for (const obs of obstacles) {
        if (physics.aabbCapsule(obs.aabb, projSphere)) { hitObstacle = true; break; }
      }
      if (hitObstacle) {
        if (effects) effects.spawnImpactDust(pos);
        this._kill(p);
        continue;
      }

      // Avatar collision
      for (const [id, av] of avatars) {
        if (id === p.shooterId) continue;
        if (av.isDead) continue;
        const cap = av.getCapsule();
        if (physics.capsuleCapsule(cap, { x: pos.x, y: pos.y - p.radius, z: pos.z, radius: p.radius, height: p.radius * 2 })) {
          // Hit!
          if (effects) {
            if (p.weaponDef.projectileType === 'fireball') {
              effects.spawnFireball(pos);
            } else {
              effects.spawnBloodSplat(pos);
            }
          }
          this._sendHit(id, p.weaponDef.key, p.shooterId);
          this._kill(p);
          break;
        }
      }
    }

    // Prune dead
    this._projectiles = this._projectiles.filter(p => !p.dead);
  }

  _kill(p) {
    if (p.dead) return;
    p.dead = true;
    this._scene.remove(p.mesh);
  }

  _doMeleeCheck(weaponDef, originPos, dirVec, shooterId) {
    const avatars = this._getAvatars();
    for (const [id, av] of avatars) {
      if (id === shooterId) continue;
      if (av.isDead) continue;
      const cap = av.getCapsule();
      const dx = cap.x - originPos.x;
      const dz = cap.z - originPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > weaponDef.meleeRange) continue;
      // Arc check
      const angle = Math.abs(Math.atan2(dx, dz) - Math.atan2(dirVec.x, dirVec.z));
      const norm  = Math.min(angle, Math.PI * 2 - angle);
      if (norm > weaponDef.meleeArc / 2) continue;
      const effects = window.MayhemEffects;
      if (effects) effects.spawnBloodSplat({ x: cap.x, y: cap.y + 0.9, z: cap.z });
      this._sendHit(id, weaponDef.key, shooterId);
    }
  }

  clear() {
    for (const p of this._projectiles) this._kill(p);
    this._projectiles = [];
  }
}

if (typeof window !== 'undefined') {
  window.MayhemProjectiles = { ProjectileManager };
}
