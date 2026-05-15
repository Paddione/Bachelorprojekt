'use strict';
// Weapons registry — pure data + timing logic, no Three.js dependency.
// Projectile creation and effects live in projectiles.js / effects.js.

const WEAPONS = {
  handgun: {
    key:        'handgun',
    label:      'Handgun',
    damage:     25,
    cooldownMs: 600,
    spread:     0.04,
    projectileSpeed: 18,
    projectileType: 'bullet',
  },
  rifle: {
    key:        'rifle',
    label:      'Burst Rifle',
    damage:     18,
    cooldownMs: 900,       // per burst
    burstCount: 3,
    burstIntervalMs: 80,
    spread:     0.07,
    projectileSpeed: 22,
    projectileType: 'bullet',
  },
  fireball: {
    key:        'fireball',
    label:      'Fireball',
    damage:     10,        // impact damage; burn adds more over time
    cooldownMs: 1200,
    spread:     0.0,
    projectileSpeed: 10,
    projectileType: 'fireball',
    burnDamagePerSec: 8,
    burnDurationSec:  4,
  },
  club: {
    key:        'club',
    label:      'Club',
    damage:     40,
    cooldownMs: 800,
    melee:      true,
    meleeRange: 1.4,
    meleeArc:   Math.PI * 0.6,
  },
  katana: {
    key:        'katana',
    label:      'Katana',
    damage:     30,
    cooldownMs: 350,
    melee:      true,
    meleeRange: 1.8,
    meleeArc:   Math.PI * 0.45,
  },
};

const WEAPON_ORDER = ['handgun', 'rifle', 'fireball', 'club', 'katana'];

class WeaponSystem {
  constructor(onFire) {
    // onFire(weaponDef, originPos, dirVec, shooterId) — called for each projectile
    this._onFire    = onFire;
    this._cooldowns = {};   // weaponKey → lastFiredTimestamp
    this._burstState = null; // { weaponKey, remaining, nextAt }
    this.currentIndex = 0;
    this.current = WEAPONS[WEAPON_ORDER[0]];
  }

  select(indexOrKey) {
    if (typeof indexOrKey === 'string') {
      const idx = WEAPON_ORDER.indexOf(indexOrKey);
      if (idx < 0) return;
      this.currentIndex = idx;
    } else {
      this.currentIndex = ((indexOrKey % WEAPON_ORDER.length) + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    }
    this.current = WEAPONS[WEAPON_ORDER[this.currentIndex]];
  }

  next() { this.select(this.currentIndex + 1); }
  prev() { this.select(this.currentIndex - 1); }

  // Returns true if the trigger was accepted (cooldown OK).
  tryFire(originPos, dirVec, shooterId) {
    const now = performance.now();
    const w = this.current;
    const last = this._cooldowns[w.key] || 0;
    if (now - last < w.cooldownMs) return false;
    this._cooldowns[w.key] = now;

    if (w.melee) {
      this._onFire(w, originPos, dirVec, shooterId);
      return true;
    }

    if (w.burstCount && w.burstCount > 1) {
      // Fire first round immediately, schedule rest via tick()
      this._fireSingle(w, originPos, dirVec, shooterId);
      this._burstState = {
        weaponKey:   w.key,
        remaining:   w.burstCount - 1,
        nextAt:      now + w.burstIntervalMs,
        originPos:   { ...originPos },
        dirVec:      { ...dirVec },
        shooterId,
      };
    } else {
      this._fireSingle(w, originPos, dirVec, shooterId);
    }
    return true;
  }

  // Must be called every frame (dt unused, uses wall clock).
  tick() {
    if (!this._burstState) return;
    const now = performance.now();
    const b = this._burstState;
    if (now < b.nextAt) return;

    const w = WEAPONS[b.weaponKey];
    this._fireSingle(w, b.originPos, b.dirVec, b.shooterId);
    b.remaining--;
    if (b.remaining <= 0) {
      this._burstState = null;
    } else {
      b.nextAt = now + w.burstIntervalMs;
    }
  }

  _fireSingle(w, originPos, dirVec, shooterId) {
    // Apply spread
    const spread = w.spread || 0;
    const dir = {
      x: dirVec.x + (Math.random() - 0.5) * spread,
      y: dirVec.y + (Math.random() - 0.5) * spread * 0.5,
      z: dirVec.z + (Math.random() - 0.5) * spread,
    };
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= len; dir.y /= len; dir.z /= len;
    this._onFire(w, originPos, dir, shooterId);
  }

  getWeaponDef(key) { return WEAPONS[key] || null; }
  getAllWeapons()    { return WEAPON_ORDER.map(k => WEAPONS[k]); }
}

if (typeof window !== 'undefined') {
  window.MayhemWeapons = { WeaponSystem, WEAPONS, WEAPON_ORDER };
}
