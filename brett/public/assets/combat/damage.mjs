import { WEAPONS } from './weapons.mjs';

export function applyDamage(victim, dmg) {
  victim.hp = Math.max(0, (victim.hp ?? 0) - dmg);
  return victim.hp;
}

function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

/** Interval between burn damage ticks (ms). */
export const BURN_TICK_MS = 500;

/**
 * Starts a burn DoT timer. Calls onTick(tickIndex) every BURN_TICK_MS for durMs ms.
 * Returns the interval ID — caller can clearInterval() to cancel early.
 */
export function startBurnTimer(durMs, onTick) {
  const totalTicks = Math.floor(durMs / BURN_TICK_MS);
  let fired = 0;
  const id = setInterval(() => {
    fired++;
    onTick(fired);
    if (fired >= totalTicks) clearInterval(id);
  }, BURN_TICK_MS);
  return id;
}

/**
 * Returns true if target is within the arcDeg cone centred on the facing direction.
 * All inputs are XZ-plane scalars (Y/height is irrelevant for melee arc checks).
 */
export function sweepArcContains({ selfX, selfZ, targetX, targetZ, facingX, facingZ, arcDeg }) {
  const dx = targetX - selfX;
  const dz = targetZ - selfZ;
  const d = Math.hypot(dx, dz);
  if (d === 0) return false;
  const dot = (dx / d) * facingX + (dz / d) * facingZ;
  const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
  return angleDeg <= arcDeg / 2;
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
