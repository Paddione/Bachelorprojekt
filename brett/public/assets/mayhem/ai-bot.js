'use strict';
// Simple AI bot for singleplayer Mayhem mode.
// The bot lives in remoteAvatars so projectile/vehicle/flail collisions work for free.
// Instead of being driven by setNetState() from the network, its own AI brain
// writes netTarget directly each tick.

const BOT_SPEED         = 2.2;    // m/s — slightly slower than the player walk speed
const BOT_CHASE_RANGE   = 14;     // m — start chasing when target is within this distance
const BOT_MELEE_RANGE   = 2.0;    // m — switch to flailing when this close
const BOT_SHOOT_RANGE   = 12;     // m — fire weapon when target is within this distance
const BOT_SHOOT_RATE    = 1.8;    // seconds between shots (slower than max weapon rate)
const BOT_WANDER_SECS   = [2, 4]; // random wander-target hold time range
const ARENA_HALF        = 8.5;    // clamp bots within the playable area
const DEATHMATCH_RESPAWN_S = 4;

const BOT_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'];

class MayhemAIBot {
  // callbacks: { onFire(weaponDef, originPos, dirVec, shooterId),
  //              onDeath(botId, killerId),
  //              getGameMode() }
  constructor({ id, mannequin, colorIndex = 0, bossMultiplier = null, callbacks }) {
    this.isBoss = !!bossMultiplier;
    const color = bossMultiplier ? '#e74c3c' : BOT_COLORS[colorIndex % BOT_COLORS.length];
    this.avatar = new window.MayhemPlayerAvatar({
      id, mannequin, local: false, color,
    });

    // Scale boss mannequin root
    if (bossMultiplier && bossMultiplier.scale && bossMultiplier.scale !== 1.0) {
      mannequin.root.scale.setScalar(bossMultiplier.scale);
    }

    this._hp         = bossMultiplier ? bossMultiplier.hp : 1;
    this._shootRate  = bossMultiplier ? BOT_SHOOT_RATE / bossMultiplier.shootRate : BOT_SHOOT_RATE;
    this._speed      = bossMultiplier ? BOT_SPEED * bossMultiplier.speed : BOT_SPEED;

    this.id     = id;
    this._x = mannequin.root.position.x;
    this._z = mannequin.root.position.z;
    this._facingY    = Math.random() * Math.PI * 2;
    this._aiState    = 'wander';
    this._wanderDx   = 0;
    this._wanderDz   = 1;
    this._wanderTtl  = 0;
    this._shootTimer = Math.random() * this._shootRate; // stagger initial shots

    this._onFire    = callbacks.onFire;
    this._onDeath   = callbacks.onDeath;
    this._getMode   = callbacks.getGameMode;

    // Bots use ranged weapons so they can attack outside melee-AI state
    const rangedKeys = ['handgun', 'rifle', 'fireball'];
    const weaponKey  = rangedKeys[colorIndex % rangedKeys.length];
    this.weaponDef = window.MayhemWeapons
      ? window.MayhemWeapons.WEAPONS[weaponKey]
      : { key: 'handgun', damage: 25, projectileSpeed: 18, projectileType: 'bullet' };
  }

  // allAvatars — Map<id, PlayerAvatar> of every other combatant (incl. local player)
  tick(dt, allAvatars) {
    if (this._aiState === 'dead') return;

    const target = this._findNearest(allAvatars);
    const dist   = target ? this._dist(target) : Infinity;

    // State transitions
    if (dist <= BOT_MELEE_RANGE) {
      this._aiState = 'melee';
    } else if (dist <= BOT_CHASE_RANGE) {
      this._aiState = 'chase';
    } else {
      this._aiState = 'wander';
    }

    let moveX = 0, moveZ = 0;

    if (this._aiState === 'chase' || this._aiState === 'melee') {
      const tx = target.mannequin.root.position.x - this._x;
      const tz = target.mannequin.root.position.z - this._z;
      const m  = Math.hypot(tx, tz) || 1;
      moveX = tx / m;
      moveZ = tz / m;
      this._facingY = Math.atan2(moveX, moveZ);
    } else {
      this._wanderTtl -= dt;
      if (this._wanderTtl <= 0) {
        const angle = Math.random() * Math.PI * 2;
        this._wanderDx  = Math.sin(angle);
        this._wanderDz  = Math.cos(angle);
        this._wanderTtl = BOT_WANDER_SECS[0] + Math.random() * (BOT_WANDER_SECS[1] - BOT_WANDER_SECS[0]);
        this._facingY   = angle;
      }
      moveX = this._wanderDx;
      moveZ = this._wanderDz;
    }

    // Move and clamp
    this._x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, this._x + moveX * this._speed * dt));
    this._z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, this._z + moveZ * this._speed * dt));

    // Bot separation: prevent bots from stacking on the same target
    const SEP_RADIUS = 1.2, SEP_STRENGTH = 1.5;
    let sepX = 0, sepZ = 0;
    for (const [otherId, other] of allAvatars) {
      if (otherId === this.id || !otherId.startsWith('bot-')) continue;
      const dx = this._x - other.mannequin.root.position.x;
      const dz = this._z - other.mannequin.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d < SEP_RADIUS && d > 0.001) {
        const push = (SEP_RADIUS - d) / SEP_RADIUS;
        sepX += (dx / d) * push;
        sepZ += (dz / d) * push;
      }
    }
    if (sepX !== 0 || sepZ !== 0) {
      this._x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, this._x + sepX * SEP_STRENGTH * dt));
      this._z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, this._z + sepZ * SEP_STRENGTH * dt));
    }

    // Drive the avatar via the same setNetState path real network messages use
    const moving = moveX !== 0 || moveZ !== 0;
    // Set netTarget so the outer mayhem.js remoteAvatars loop handles interpolation
    this.avatar.setNetState({
      x: this._x, y: 0, z: this._z,
      yaw: this._facingY,
      anim: moving ? 'running' : 'idle',
      flailing: this._aiState === 'melee',
    });

    // Shooting
    if (target && dist <= BOT_SHOOT_RANGE && this._aiState !== 'melee') {
      this._shootTimer -= dt;
      if (this._shootTimer <= 0) {
        this._shoot(target);
        this._shootTimer = this._shootRate;
      }
    }
  }

  // Called by mayhem.js when this bot is the victim of a hit.
  processHit(weaponKey, impulse, shooterId, weaponSystem) {
    if (this.avatar.isDead) return;

    const weaponDef = weaponSystem ? weaponSystem.getWeaponDef(weaponKey) : null;
    const damage = weaponDef ? weaponDef.damage
                 : weaponKey === 'vehicle' ? 30 : 15;

    this.avatar.applyHit(impulse, weaponKey || 'flail');

    if (this.isBoss) {
      // Boss bots track HP as an integer hit-point pool; ignore avatar HP
      this._hp -= 1;
      if (this._hp > 0) return; // still alive
    } else {
      this.avatar.applyDamage(damage);
      if (!this.avatar.isDead) return; // still alive
    }

    // Bot is dead
    this._aiState = 'dead';
    this.avatar.applyDamage(this.avatar.hp); // ensure avatar.isDead === true
    this._onDeath(this.id, shooterId);

    const mode = this._getMode ? this._getMode() : 'warmup';
    if (mode === 'deathmatch') {
      setTimeout(() => this._respawn(), DEATHMATCH_RESPAWN_S * 1000);
    }
  }

  _respawn() {
    const pos = MayhemAIBot.randomEdgeSpawn();
    this._x = pos.x;
    this._z = pos.z;
    this.avatar.mannequin.root.position.set(pos.x, 0, pos.z);
    this.avatar.resetHp();
    this.avatar.state = window.MayhemPlayerAvatar.STATE.IDLE;
    this._aiState = 'wander';
    this._shootTimer = Math.random() * this._shootRate;
  }

  _findNearest(allAvatars) {
    const inCoop = this._getMode && this._getMode() === 'coop';
    let best = null, bestDist = Infinity;
    for (const [id, av] of allAvatars) {
      if (id === this.id || av.isDead) continue;
      // In co-op, bots only target human players (not other bots)
      if (inCoop && id.startsWith('bot-')) continue;
      const d = this._dist(av);
      if (d < bestDist) { best = av; bestDist = d; }
    }
    return best;
  }

  _dist(avatar) {
    const dx = avatar.mannequin.root.position.x - this._x;
    const dz = avatar.mannequin.root.position.z - this._z;
    return Math.hypot(dx, dz);
  }

  _shoot(target) {
    const dx = target.mannequin.root.position.x - this._x;
    const dz = target.mannequin.root.position.z - this._z;
    const m  = Math.hypot(dx, dz) || 1;
    // Imperfect aim — bots aren't pixel-precise
    const spread = 0.12;
    const dir = {
      x: dx / m + (Math.random() - 0.5) * spread,
      y: 0.05,
      z: dz / m + (Math.random() - 0.5) * spread,
    };
    const dlen = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= dlen; dir.y /= dlen; dir.z /= dlen;

    this._onFire(this.weaponDef, { x: this._x, y: 1.2, z: this._z }, dir, this.id);
  }

  remove(scene) {
    this.avatar.remove(scene);
  }

  static randomEdgeSpawn() {
    const edge = Math.floor(Math.random() * 4);
    const r = 7;
    if (edge === 0) return { x: -r, z: (Math.random() - 0.5) * 2.4 };
    if (edge === 1) return { x:  r, z: (Math.random() - 0.5) * 2.4 };
    if (edge === 2) return { x: (Math.random() - 0.5) * 2.4, z: -r };
    return { x: (Math.random() - 0.5) * 2.4, z: r };
  }
}

function _hasLos(botPos, enemyPos, obstacles) {
  if (typeof window.MayhemPhysics === 'undefined') return true;
  return !window.MayhemPhysics.aabbRay(
    { x: botPos.x, y: 0.9, z: botPos.z },
    { x: enemyPos.x, y: 0.9, z: enemyPos.z },
    obstacles
  );
}

function _heroDecide(heroId, dist, hasLos, botHp) {
  switch (heroId) {
    case 'tina':
      if (!hasLos) return null;
      if (dist < 2.5) return 'frostnova';
      if (dist < 8)   return 'chainlightning';
      return 'fireball';
    case 'martina':
      return null; // Handled by Martina bot minion manager tick
    case 'oskar':
      if (dist > 5 && botHp > 40) return 'motorcycle_sprint';
      if (dist < 3) return 'vehicle_switch';
      if (botHp < 40) return 'vehicle_repair';
      return null;
    case 'patrick':
    default:
      if (!hasLos) return null;
      if (dist < 1.5) return 'katana';
      if (dist < 6)   return 'handgun';
      return 'rifle';
  }
}

class AIBot {
  constructor({ id, heroId, pos, scene, THREE, obstacles, weaponSystem, onDeath = () => {} }) {
    this.id = id;
    this.heroId = heroId;
    this.hp = 100;
    this.weaponSystem = weaponSystem;
    this._onDeath = onDeath;
    this.obstacles = obstacles;

    const color = window.MayhemHeroes?.HEROES[heroId]?.color || 0x888888;
    const m = window._mayhemMakeMannequin ? window._mayhemMakeMannequin(id, pos) : null;
    this.avatar = new window.MayhemPlayerAvatar({
      id, mannequin: m, local: false, color,
    });
    this.avatar.heroId = heroId;
    this.avatar.heroColor = color;
    this.avatar.setTorsoColor(color);
    if (this.avatar.resetHero) this.avatar.resetHero();

    this.mannequin = m;
    this._x = pos.x;
    this._z = pos.z;
    this._facingY = 0;
    this._retreating = false;
    this._shootTimer = 0;

    if (heroId === 'martina') {
      this._minionManager = new window.MayhemHeroes.MinionManager({
        maxMinions: 2,
        minionMeshFactory: mpos => {
          const mm = window._mayhemMakeMannequin ? window._mayhemMakeMannequin(`bot-minion-${mpos.x}-${mpos.z}`, mpos) : null;
          if (mm) {
            mm.root.scale.setScalar(0.6);
            mm.root.traverse(o => {
              if (o.isMesh && o.material) {
                o.material = o.material.clone();
                o.material.color.setHex(0xb8c0a8);
              }
            });
            return mm.root;
          }
          return null;
        },
        onHit: ({ targetId, damage }) => {
          this.weaponSystem._onFire({ key: 'minion-melee', damage }, { x: this._x, y: 0.5, z: this._z }, { x: 0, y: 0, z: 0 }, this.id);
        },
        onSync: () => {},
      });
    }
  }

  tick(dt, enemy, obstacles) {
    if (this.avatar.isDead) return;

    const botPos = { x: this._x, y: 0, z: this._z };
    const enemyPos = enemy.pos;
    const dx = enemyPos.x - this._x;
    const dz = enemyPos.z - this._z;
    const dist = Math.hypot(dx, dz) || 1;

    let moveX = dx / dist;
    let moveZ = dz / dist;

    if (this._retreating) {
      moveX = -moveX;
      moveZ = -moveZ;
    }

    this._facingY = Math.atan2(moveX, moveZ);

    const speed = 2.2;
    this._x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, this._x + moveX * speed * dt));
    this._z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, this._z + moveZ * speed * dt));

    this.avatar.setNetState({
      x: this._x, y: 0, z: this._z,
      yaw: this._facingY,
      anim: 'running',
      flailing: false,
      heroId: this.heroId,
      vehicleType: this.avatar._vehicle ? this.avatar._vehicle.type : null,
    });

    if (this.mannequin) {
      this.mannequin.root.position.set(this._x, 0, this._z);
      this.mannequin.root.rotation.y = this._facingY;
    }

    if (this.avatar._vehicle && this.avatar._vehicle.mesh) {
      this.avatar._vehicle.mesh.position.set(this._x, this.avatar._vehicle.type === 'motorcycle' ? 0.35 : 0.45, this._z);
      this.avatar._vehicle.mesh.rotation.y = this._facingY;
    }

    if (this._minionManager) {
      const now = Date.now();
      if (this._minionManager.count < 2 && now - this._shootTimer > 4000) {
        this._shootTimer = now;
        this._minionManager.spawn(botPos, { id: 'local-player', pos: enemyPos });
        window.MayhemAudio?.onFire('summon-minion');
      }
      this._minionManager.tick(dt, now);
    }

    const hasLos = _hasLos(botPos, enemyPos, obstacles);
    const weaponKey = _heroDecide(this.heroId, dist, hasLos, this.hp);

    if (weaponKey) {
      if (weaponKey === 'frostnova') {
        window.MayhemEffects?.spawnFrostnovaEffect(this.avatar.mannequin.root.parent, botPos);
        window.MayhemAudio?.onFire('frostnova');
        if (dist <= 2.5) {
          const impulse = { x: (dx / dist) * 3, z: (dz / dist) * 3 };
          this.weaponSystem._onFire({ key: 'frostnova', damage: 40 }, botPos, { x: dx / dist, y: 0.05, z: dz / dist }, this.id);
        }
      } else if (weaponKey === 'vehicle_switch') {
        const current = this.avatar._vehicle;
        const nextType = (!current || current.type === 'motorcycle') ? 'car' : 'motorcycle';
        if (current) {
          window.MayhemVehicle.Vehicle.despawn(current, this.avatar.mannequin.root.parent);
        }
        const newVehicle = window.MayhemVehicle.Vehicle.spawn(nextType, botPos, this.avatar.mannequin.root.parent);
        this.avatar._vehicle = newVehicle;
        window.MayhemAudio?.onFire('vehicle-switch');
      } else if (weaponKey === 'vehicle_repair') {
        const v = this.avatar._vehicle;
        if (v) {
          v.hp = Math.min(v.maxHp, (v.hp || 0) + 40);
          window.MayhemEffects?.spawnSmokePuff(this.avatar.mannequin.root.parent, v.mesh ? v.mesh.position : botPos);
          window.MayhemAudio?.onFire('vehicle-repair');
        }
      } else if (weaponKey === 'motorcycle_sprint') {
        const v = this.avatar._vehicle;
        if (v) {
          v.speedMult = 2.5;
          window.MayhemAudio?.onFire('motorcycle-engine');
          setTimeout(() => { if (v) v.speedMult = 1; }, 1500);
        }
      } else {
        if (this.weaponSystem.canFire(weaponKey)) {
          const dir = { x: dx / dist, y: 0.05, z: dz / dist };
          this.weaponSystem.fire(weaponKey, botPos, dir, this.id);
        }
      }
    }

    if (this.hp < 30 && !this._retreating) {
      this._retreating = true;
      setTimeout(() => { this._retreating = false; }, 3000);
    }
  }

  processHit(weaponKey, impulse, shooterId, weaponSystem) {
    if (this.avatar.isDead) return;
    const weaponDef = weaponSystem ? weaponSystem.getWeaponDef(weaponKey) : null;
    const damage = weaponDef ? weaponDef.damage
                 : weaponKey === 'vehicle' ? 30 : 15;

    this.avatar.applyHit(impulse, weaponKey || 'flail');
    this.hp = Math.max(0, this.hp - damage);
    this.avatar.hp = this.hp;

    if (this.avatar.isDead) {
      this._onDeath(this.id, shooterId);
    }
  }

  remove(scene) {
    this.avatar.remove(scene);
    if (this.avatar._vehicle) {
      window.MayhemVehicle.Vehicle.despawn(this.avatar._vehicle, scene);
    }
    if (this._minionManager) {
      this._minionManager.clear();
      this._minionManager = null;
    }
  }
}

MayhemAIBot.COLORS = BOT_COLORS;

if (typeof window !== 'undefined') {
  window.MayhemAIBot = MayhemAIBot;
  window.MayhemAiBot = { AIBot, MayhemAIBot };
}
