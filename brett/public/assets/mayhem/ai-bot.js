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

MayhemAIBot.COLORS = BOT_COLORS;

if (typeof window !== 'undefined') window.MayhemAIBot = MayhemAIBot;
