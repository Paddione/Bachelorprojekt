// All v1 game-system numbers. Plan 1 uses timings + map dims;
// Plan 2 will read the rest. Changing any value here is a content change,
// not a code change — do not deep-link these values from outside src/game/.

export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;

// Lobby timings
export const LOBBY_OPEN_DURATION_MS   = 60_000;
export const LOBBY_STARTING_DURATION_MS = 5_000;
export const LOBBY_RESULTS_DURATION_MS = 30_000;
export const SLOW_MO_DURATION_MS      = 800;
export const PROTOCOL_VERSION         = 1;

// Map (sandbox.jsx port)
export const MAP_W = 960;
export const MAP_H = 540;

// Player
export const PLAYER_HP = 2;
export const PLAYER_ARMOR_CAP = 1;
export const PLAYER_MOVE_SPEED = 180;
export const PLAYER_HITBOX_W = 24;
export const PLAYER_HITBOX_H = 24;
export const SPAWN_INVULN_MS = 1500;
export const DODGE_IFRAME_MS = 400;
export const DODGE_COOLDOWN_MS = 1200;
export const DODGE_DISTANCE = 90;

// Weapons (hitscan, 1 damage)
export const WEAPONS = {
  glock:  { fireRate: 2.5, mag: 12, reloadMs: 1400, spreadRad: 0.052, rangePx: 500, infinite: true },
  deagle: { fireRate: 1.5, mag:  7, reloadMs: 2000, spreadRad: 0.017, rangePx: 700 },
  m4a1:   { fireRate: 8.0, mag: 30, reloadMs: 2400, spreadRad: 0.087, rangePx: 600 },
  melee:  { cooldownMs: 800, coneDeg: 90, rangePx: 40, ohko: true },
} as const;

// Items
export const ITEM_SPAWN_CYCLE_MS = 60_000;
export const ITEMS_PER_DROP = 3;

// Powerups
export const POWERUP_SPAWN_CYCLE_MS = 90_000;
export const POWERUPS = {
  shield: { durationMs: 3_000 },
  speed:  { durationMs: 5_000, moveMultiplier: 1.6 },
  damage: { durationMs: 5_000, damageMultiplier: 2 },
  emp:    { durationMs: 3_000, radiusPx: 250 },
  cloak:  { durationMs: 4_000, alpha: 0.15 },
} as const;

// Zone
export const ZONE_DELAY_MS = 30_000;
export const ZONE_SHRINK_DURATION_MS = 180_000;
export const ZONE_FINAL_RADIUS_PX = 200;
export const ZONE_DAMAGE_INTERVAL_MS = 3_000;

// Bot config
export const BOT_KEYS = ['bot_1', 'bot_2', 'bot_3'] as const;
export const BOT_DEFAULT_CHARACTERS = ['brown-guy', 'long-red-girl', 'blonde-long-girl'] as const;