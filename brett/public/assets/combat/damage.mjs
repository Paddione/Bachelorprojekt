import { WEAPONS } from './weapons.mjs';

export function applyDamage(victim, dmg) {
  victim.hp = Math.max(0, (victim.hp ?? 0) - dmg);
  return victim.hp;
}

function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

export function validateDamageEvent({ weapon, shooter, victim, shooterPos, now }) {
  const w = WEAPONS[weapon];
  if (!w) return { ok: false, reason: 'unknown weapon' };
  if ((shooter.hp ?? 0) <= 0) return { ok: false, reason: 'shooter dead' };
  if ((victim.hp ?? 0) <= 0) return { ok: false, reason: 'victim already dead' };
  const sinceShot = now - (shooter.lastShotAt ?? 0);
  if (sinceShot < w.cooldownMs) return { ok: false, reason: `cooldown ${w.cooldownMs - sinceShot}ms left` };
  if (w.type === 'melee') {
    const d = dist3(shooterPos, victim);
    if (d > w.range * 1.4) return { ok: false, reason: `melee out of range (${d.toFixed(1)} > ${w.range})` };
  }
  return { ok: true };
}

// Returns true when target falls within the forward-facing cone — used for katana sweep hit detection.
// facingX/facingZ must be a unit vector; arcDeg is the full cone width (half on each side).
export function sweepArcContains({ selfX, selfZ, targetX, targetZ, facingX, facingZ, arcDeg }) {
  const dx = targetX - selfX;
  const dz = targetZ - selfZ;
  const len = Math.hypot(dx, dz);
  if (len === 0) return true;
  const dot = (dx / len) * facingX + (dz / len) * facingZ;
  return dot >= Math.cos((arcDeg / 2) * Math.PI / 180);
}

// Interval between fire-damage ticks (ms).
export const BURN_TICK_MS = 500;

// Fires callback(tickIndex) every BURN_TICK_MS for durMs total duration.
// tickIndex starts at 1. Returns the interval ID so the caller can cancel early.
export function startBurnTimer(durMs, callback) {
  const totalTicks = Math.round(durMs / BURN_TICK_MS);
  let tick = 0;
  const id = setInterval(() => {
    tick++;
    callback(tick);
    if (tick >= totalTicks) clearInterval(id);
  }, BURN_TICK_MS);
  return id;
}
