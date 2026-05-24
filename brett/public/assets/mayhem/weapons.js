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
    cooldownMs: 900,
    burstCount: 3,
    burstIntervalMs: 80,
    spread:     0.07,
    projectileSpeed: 22,
    projectileType: 'bullet',
  },
  fireball: {
    key:        'fireball',
    label:      'Fireball',
    damage:     10,
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
    // ── Tina (Hexe) ──────────────────────────────────────────────────────────
    frostnova: {
      key: 'frostnova', label: 'Frostnova', icon: 'icon-frostnova',
      damage: 40, cooldownMs: 5000,
      projectileType: 'frostnova',    // handled as AoE burst, not projectile
      aoeRadius: 2.5, slowFactor: 0.4, slowDurationMs: 2000,
      melee: false,
    },
    chainlightning: {
      key: 'chainlightning', label: 'Kettenblitz', icon: 'icon-chainlightning',
      damage: 55, cooldownMs: 4000,
      projectileType: 'chain',
      projectileSpeed: 22,
      melee: false,
    },
    // ── Martina (Teamleiterin) ────────────────────────────────────────────────
    summon_minion: {
      key: 'summon_minion', label: 'Minion rufen', icon: 'icon-summon-minion',
      damage: 0, cooldownMs: 4000,
      projectileType: 'summon',
      melee: false,
    },
    shield_minion: {
      key: 'shield_minion', label: 'Minion schützen', icon: 'icon-shield-minion',
      damage: 0, cooldownMs: 6000,
      projectileType: 'buff',
      melee: false,
    },
    frenzy_minion: {
      key: 'frenzy_minion', label: 'Minion Raserei', icon: 'icon-frenzy-minion',
      damage: 0, cooldownMs: 8000,
      projectileType: 'buff',
      melee: false,
    },
    // ── Oskar (Mechaniker) ────────────────────────────────────────────────────
    vehicle_switch: {
      key: 'vehicle_switch', label: 'Fahrzeug wechseln', icon: 'icon-vehicle-switch',
      damage: 0, cooldownMs: 3000,
      projectileType: 'vehicle_switch',
      melee: false,
    },
    vehicle_repair: {
      key: 'vehicle_repair', label: 'Reparieren', icon: 'icon-repair',
      damage: -40, cooldownMs: 8000,   // negative damage = heal
      projectileType: 'repair',
      target: 'self',
      melee: false,
    },
    motorcycle_sprint: {
      key: 'motorcycle_sprint', label: 'Motorrad-Sprint', icon: 'icon-sprint',
      damage: 20, cooldownMs: 2000,
      projectileType: 'sprint',
      durationMs: 1500, speedBoost: 2.5,
      melee: false,
    },
    // ── Patrick (Softwareentwickler) — Specials ───────────────────────────────
    stealth: {
      key: 'stealth', label: 'Unsichtbarkeit', icon: 'icon-stealth',
      damage: 0, cooldownMs: 8000, durationMs: 2000,
      projectileType: 'stealth',
      melee: false,
    },
    teleport: {
      key: 'teleport', label: 'Teleportation', icon: 'icon-teleport',
      damage: 0, cooldownMs: 6000, rangeTiles: 5,
      projectileType: 'teleport',
      melee: false,
    },
};

const WEAPON_ORDER = ['handgun', 'rifle', 'fireball', 'club', 'katana'];

class WeaponSystem {
  constructor(abilities, onFire) {
    if (typeof abilities === 'function') {
      onFire = abilities;
      abilities = WEAPON_ORDER;
    }
    this._abilities  = abilities || WEAPON_ORDER;
    this._onFire     = onFire;
    this._cooldowns  = new Map();
    this._burstState = null;
    this.currentIndex = 0;
    this.current = WEAPONS[this._abilities[0]];
  }

  select(indexOrKey) {
    if (typeof indexOrKey === 'string') {
      const idx = this._abilities.indexOf(indexOrKey);
      if (idx < 0) return;
      this.currentIndex = idx;
    } else {
      this.currentIndex = ((indexOrKey % this._abilities.length) + this._abilities.length) % this._abilities.length;
    }
    this.current = WEAPONS[this._abilities[this.currentIndex]];
  }

  next() { this.select(this.currentIndex + 1); }
  prev() { this.select(this.currentIndex - 1); }

  tryFire(originPos, dirVec, shooterId) {
    const now = performance.now();
    const w = this.current;
    const last = this._cooldowns.get(w.key) || 0;
    if (now - last < w.cooldownMs) return false;
    this._cooldowns.set(w.key, now);

    if (w.melee) {
      this._onFire(w, originPos, dirVec, shooterId);
      return true;
    }

    if (w.burstCount && w.burstCount > 1) {
      this._fireSingle(w, originPos, dirVec, shooterId);
      this._burstState = {
        weaponKey:  w.key,
        remaining:  w.burstCount - 1,
        nextAt:     now + w.burstIntervalMs,
        originPos:  { ...originPos },
        dirVec:     { ...dirVec },
        shooterId,
      };
    } else {
      this._fireSingle(w, originPos, dirVec, shooterId);
    }
    return true;
  }

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
  getAllWeapons()    { return this._abilities.map(k => WEAPONS[k]); }

  resetCooldowns() {
    this._cooldowns.clear();
  }

  canFire(key) {
    const w = WEAPONS[key];
    if (!w) return false;
    const now = performance.now();
    const last = this._cooldowns.get(key) || 0;
    return (now - last >= w.cooldownMs);
  }

  fire(key, originPos, dirVec, shooterId) {
    const w = WEAPONS[key];
    if (!w) return false;
    const now = performance.now();
    this._cooldowns.set(key, now);
    if (w.melee) {
      this._onFire(w, originPos, dirVec, shooterId);
      return true;
    }
    this._fireSingle(w, originPos, dirVec, shooterId);
    return true;
  }
}

if (typeof window !== 'undefined') {
  window.MayhemWeapons = { WeaponSystem, WEAPONS, WEAPON_ORDER };
}
