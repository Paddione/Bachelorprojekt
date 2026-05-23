import { WEAPONS } from './weapons.mjs';

export const BURN_TICK_MS = 100;

export function startBurnTimer(durMs, cb) {
  let i = 0;
  const total = Math.round(durMs / BURN_TICK_MS);
  const id = setInterval(() => {
    i++;
    cb(i);
    if (i >= total) clearInterval(id);
  }, BURN_TICK_MS);
  return id;
}

export function sweepArcContains({ selfX, selfZ, targetX, targetZ, facingX, facingZ, arcDeg }) {
  const dx = targetX - selfX;
  const dz = targetZ - selfZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist === 0) return true;
  const dot = (dx / dist) * facingX + (dz / dist) * facingZ;
  const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
  return angleDeg <= arcDeg / 2;
}

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
