(function () {
'use strict';
// Projectile manager.
// Handles: spawn, per-frame movement, AABB/capsule collision, network hit emission.
// Effects (blood splat, fire) are delegated to MayhemEffects.

const GRAVITY = -4.5;
const MAX_LIFETIME_MS = 4000;
const PROJECTILE_RADIUS = 0.08;
const FIREBALL_RADIUS   = 0.22;

function mkBulletMesh(THREE) {
  const geo = new THREE.SphereGeometry(PROJECTILE_RADIUS, 5, 5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffee88 });
  return new THREE.Mesh(geo, mat);
}

function mkFireballMesh(THREE) {
  const tex = window._mayhemTinaFireballTex;
  if (!tex) {
    const geo = new THREE.SphereGeometry(FIREBALL_RADIUS, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    const mesh = new THREE.Mesh(geo, mat);
    // Inner glow
    const gGeo = new THREE.SphereGeometry(FIREBALL_RADIUS * 0.6, 6, 6);
    const gMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
    mesh.add(new THREE.Mesh(gGeo, gMat));
    return mesh;
  }

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(1.0);
  sprite.userData.isFireballSprite = true;
  sprite.userData.spawnTime = performance.now();
  return sprite;
}

function mkChainMesh(THREE) {
  const tex = window._mayhemTinaChainTex;
  if (!tex) {
    // Randomly jittered arc via CatmullRomCurve3
    const points = [];
    for (let i = 0; i <= 5; i++) {
      points.push(new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        0.05 + Math.random() * 0.2,
        -i * 0.3,
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geo   = new THREE.TubeGeometry(curve, 20, 0.035, 4, false);
    const mat   = new THREE.MeshBasicMaterial({ color: 0x6fa8d8 });  // stille-blau
    return new THREE.Mesh(geo, mat);
  }

  const geo = new THREE.PlaneGeometry(1, 0.4);
  geo.rotateY(Math.PI / 2);
  const posAttr = geo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    posAttr.setZ(i, posAttr.getZ(i) + 0.34);
  }
  posAttr.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.isChainMesh = true;
  mesh.userData.spawnTime = performance.now();
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
    let mesh;
    if (weaponDef.projectileType === 'fireball') {
      mesh = mkFireballMesh(THREE);
    } else if (weaponDef.projectileType === 'chain') {
      mesh = mkChainMesh(THREE);
    } else {
      mesh = mkBulletMesh(THREE);
    }

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
      startX: originPos.x,
      startY: originPos.y,
      startZ: originPos.z,
      currentPos: new THREE.Vector3(originPos.x, originPos.y + 1.2, originPos.z),
    });

    if (window.MayhemTracer) {
      const from = new THREE.Vector3(originPos.x, originPos.y + 1.2, originPos.z);
      const to = from.clone().addScaledVector(new THREE.Vector3(dirVec.x, dirVec.y, dirVec.z), weaponDef.range || 25);
      window.MayhemTracer.spawnTracer(this._scene, from, to, weaponDef.muzzleClass || 'rifle');
    }
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
      p.currentPos.x += p.vx * dt;
      p.currentPos.y += p.vy * dt;
      p.currentPos.z += p.vz * dt;

      if (p.currentPos.y < 0) { this._kill(p); continue; }

      if (p.weaponDef.range !== undefined) {
        const distXZ = Math.hypot(p.currentPos.x - p.startX, p.currentPos.z - p.startZ);
        if (distXZ > p.weaponDef.range) { this._kill(p); continue; }
      }

      if (!p.mesh.userData.isChainMesh) {
        p.mesh.position.copy(p.currentPos);
        if (p.mesh.userData.isFireballSprite) {
          const elapsed = now - p.mesh.userData.spawnTime;
          p.mesh.material.rotation = Math.sin(elapsed * 0.01) * (8 * Math.PI / 180);
          const wobble = 1.0 + Math.sin(elapsed * 0.02) * 0.12;
          p.mesh.scale.setScalar(wobble);
        }
      } else {
        const startPos = new THREE.Vector3(p.startX, p.startY + 1.2, p.startZ);
        p.mesh.position.copy(startPos);
        p.mesh.lookAt(p.currentPos);
        const dist = startPos.distanceTo(p.currentPos);
        p.mesh.scale.set(1.0, 1.0, dist);

        // Flicker opacity
        const flicker = Math.random() > 0.3 ? 1.0 : 0.2;
        p.mesh.material.opacity = 0.95 * flicker;
      }

      const pos = p.currentPos;

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
    if (p.mesh.userData.isFireballSprite) {
      const sprite = p.mesh;
      const mat = sprite.material;
      const start = performance.now();
      const DURATION = 200; // ms
      const fadeOut = () => {
        const elapsed = performance.now() - start;
        const t = Math.min(1.0, elapsed / DURATION);
        sprite.scale.setScalar(1.0 + t * 1.2);
        mat.opacity = 0.9 * (1.0 - t);
        if (t < 1.0) {
          requestAnimationFrame(fadeOut);
        } else {
          this._scene.remove(sprite);
          mat.dispose();
        }
      };
      requestAnimationFrame(fadeOut);
    } else {
      this._scene.remove(p.mesh);
      if (p.mesh.material && typeof p.mesh.material.dispose === 'function') {
        p.mesh.material.dispose();
      }
      if (p.mesh.geometry && typeof p.mesh.geometry.dispose === 'function') {
        p.mesh.geometry.dispose();
      }
    }
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
})();
