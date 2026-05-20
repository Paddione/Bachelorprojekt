export const WEAPONS = Object.freeze({
  handgun:  { type: 'ranged', dmg: 25, range: Infinity, cooldownMs: 250,  mag: 12, reloadMs: 1100, slot: 'ranged' },
  rifle:    { type: 'ranged', dmg: 35, range: Infinity, cooldownMs: 600,  mag: 5,  reloadMs: 1500, slot: 'ranged', pickupOnly: true },
  fireball: { type: 'ranged', dmg: 70, range: 30,       cooldownMs: 1500, mag: 3,  reloadMs: 0,    slot: 'ranged', pickupOnly: true, burn: { dps: 5, durMs: 3000 } },
  club:     { type: 'melee',  dmg: 50, range: 2.5,      cooldownMs: 700,  slot: 'melee', knockback: 8 },
  katana:   { type: 'melee',  dmg: 60, range: 3.0,      cooldownMs: 500,  slot: 'melee', sweepArcDeg: 90 },
});

export const STARTER_LOADOUT = { melee: 'club', ranged: 'handgun' };
