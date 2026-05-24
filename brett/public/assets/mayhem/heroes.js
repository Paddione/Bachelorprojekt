'use strict';
// Hero registry — pure data. Rendering, weapon assignment, and special abilities
// are wired in mayhem.js. MinionManager lives here (no Three.js dep for core logic).

const HEROES = {
  patrick: {
    id: 'patrick', name: 'Patrick',
    description: 'Softwareentwickler · Katana · Pistole · Rifle',
    color: 0x6f8db8,
    figure: { face: 'present', hair: 'hair-short', clothing: null, hairTint: null },
    abilities: ['katana', 'handgun', 'rifle'],
    passive: null,
    unlocked: true,
  },
  tina: {
    id: 'tina', name: 'Tina',
    description: 'Hexe · Frostnova · Feuerball · Kettenblitz',
    color: 0xa83a30,
    figure: { face: 'curious', hair: 'hair-long', clothing: 'robe',
              hairTint: 'hue-rotate(320deg) saturate(180%)' },
    abilities: ['frostnova', 'fireball', 'chainlightning'],
    passive: null,
    unlocked: true,   // Scheibe 2 complete
  },
  martina: {
    id: 'martina', name: 'Martina',
    description: 'Teamleiterin · Minion · Shield · Raserei',
    color: 0xb8c0a8,
    figure: { face: 'resolved', hair: 'hair-long', clothing: 'coat',
              hairTint: 'sepia(60%) hue-rotate(30deg)' },
    abilities: ['summon_minion', 'shield_minion', 'frenzy_minion'],
    passive: { maxMinions: 2 },
    unlocked: true,   // Scheibe 3 complete
  },
  oskar: {
    id: 'oskar', name: 'Oskar',
    description: 'Mechaniker · Motorrad · Auto · Reparatur',
    color: 0xc8a96e,
    figure: { face: 'observing', hair: 'hair-short', clothing: 'vest',
              hairTint: 'sepia(40%) hue-rotate(30deg)' },
    abilities: ['vehicle_switch', 'vehicle_repair', 'motorcycle_sprint'],
    passive: { startsInVehicle: 'motorcycle' },
    unlocked: true,   // Scheibe 4 complete
  },
};

const HERO_ORDER = ['patrick', 'tina', 'martina', 'oskar'];

// Assigns a hero to an avatar. Called from mayhem.js after hero_select.
// avatar must expose: heroId, heroColor, weaponSystem, setTorsoColor(), resetHero()
function assignHero(avatar, heroId, WeaponSystem, onFire) {
  const h = HEROES[heroId];
  if (!h) return;
  avatar.heroId    = heroId;
  avatar.heroColor = h.color;
  avatar.weaponSystem = new WeaponSystem(h.abilities, onFire);
  avatar.setTorsoColor(h.color);
  avatar.resetHero();
}

// ── MinionManager ────────────────────────────────────────────────────────────
// Manages Martina's minions. Three.js mesh creation is injected via factory fn.
class MinionManager {
  constructor({ maxMinions = 2, minionMeshFactory, onHit, onSync } = {}) {
    this._max     = maxMinions;
    this._minions = new Map(); // id → { pos, target, hp, shielded, frenzied, mesh, ... }
    this._mkMesh  = minionMeshFactory || (() => null);
    this._onHit   = onHit  || (() => {});
    this._onSync  = onSync || (() => {});
    this._seq     = 0;
  }

  get count() { return this._minions.size; }

  spawn(ownerPos, enemyRef) {
    if (this._minions.size >= this._max) return null;
    const id  = `minion-${++this._seq}`;
    const pos = { x: ownerPos.x + (Math.random() - 0.5), y: 0, z: ownerPos.z + (Math.random() - 0.5) };
    const mesh = this._mkMesh(pos);
    this._minions.set(id, { id, pos, target: enemyRef, hp: 60, shielded: false, frenzied: false,
                            lastAttack: 0, mesh, speedMult: 1 });
    this._onSync({ type: 'minion_spawn', minionId: id, x: pos.x, z: pos.z });
    return id;
  }

  shieldOldest() {
    const oldest = this._minions.values().next().value;
    if (!oldest) return;
    oldest.shielded = true;
    if (oldest.mesh) window.MayhemEffects?.spawnShieldRing(oldest.mesh);
  }

  frenzyOldest() {
    const oldest = this._minions.values().next().value;
    if (!oldest) return;
    oldest.frenzied   = true;
    oldest.speedMult  = 2;
    oldest._frenzyEnd = Date.now() + 3000;
    if (oldest.mesh) window.MayhemEffects?.spawnFrenzyParticles(oldest.mesh);
  }

  tick(dt, nowMs) {
    for (const [id, m] of this._minions) {
      // Frenzy expiry
      if (m.frenzied && nowMs > m._frenzyEnd) { m.frenzied = false; m.speedMult = 1; }

      // Move toward target
      const enemy = m.target;
      if (!enemy || !enemy.pos) continue;
      const dx = enemy.pos.x - m.pos.x, dz = enemy.pos.z - m.pos.z;
      const dist = Math.hypot(dx, dz);
      const speed = 3.5 * m.speedMult * dt;
      if (dist > 1.5) {
        m.pos.x += (dx / dist) * speed;
        m.pos.z += (dz / dist) * speed;
        if (m.mesh) { m.mesh.position.x = m.pos.x; m.mesh.position.z = m.pos.z; }
        this._onSync({ type: 'minion_update', minionId: id, x: m.pos.x, z: m.pos.z });
      } else {
        // Melee attack
        if (nowMs - m.lastAttack > 800) {
          m.lastAttack = nowMs;
          const dmg = m.frenzied ? 30 : 15;
          this._onHit({ minionId: id, targetId: enemy.id, damage: dmg });
        }
      }
    }
  }

  takeDamage(minionId, dmg) {
    const m = this._minions.get(minionId);
    if (!m) return;
    if (m.shielded) {
      m.shielded = false;
      if (m.mesh) window.MayhemEffects?.removeShieldRing(m.mesh);
      return;  // absorb
    }
    m.hp -= dmg;
    if (m.hp <= 0) this._killMinion(minionId);
  }

  _killMinion(id) {
    const m = this._minions.get(id);
    if (!m) return;
    if (m.mesh && m.mesh.parent) m.mesh.parent.remove(m.mesh);
    this._minions.delete(id);
    this._onSync({ type: 'minion_die', minionId: id });
  }

  clear() {
    for (const id of this._minions.keys()) this._killMinion(id);
  }
}

if (typeof window !== 'undefined') {
  window.MayhemHeroes = { HEROES, HERO_ORDER, assignHero, MinionManager };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HEROES, HERO_ORDER, assignHero, MinionManager };
}
