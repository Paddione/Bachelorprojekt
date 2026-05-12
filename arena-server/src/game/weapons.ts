import { WEAPONS, TICK_MS } from './constants';
import type { PlayerState } from './state';
import type { WeaponId } from './state';
import { lineCast, angleTo } from './physics';
import type { Aabb } from './map';
import type { GameEvent } from '../proto/messages';

export interface HitscanResult {
  hit: boolean;
  victim: string | null;
  weaponId: string;
}

// Tick weapon cooldown timers for one player. Returns the updated player (mutates in-place).
export function tickWeaponCooldowns(p: PlayerState, dtMs: number): void {
  if (p.weapon.fireCooldownRemainingMs > 0) {
    p.weapon.fireCooldownRemainingMs = Math.max(0, p.weapon.fireCooldownRemainingMs - dtMs);
  }
  if (p.weapon.reloading) {
    p.weapon.reloadRemainingMs = Math.max(0, p.weapon.reloadRemainingMs - dtMs);
    if (p.weapon.reloadRemainingMs <= 0) {
      const def = p.weapon.id === 'glock' ? WEAPONS.glock :
                  p.weapon.id === 'deagle' ? WEAPONS.deagle : WEAPONS.m4a1;
      p.weapon.ammo = def.mag;
      p.weapon.reloading = false;
    }
  }
  if (p.meleeCooldownRemainingMs > 0) {
    p.meleeCooldownRemainingMs = Math.max(0, p.meleeCooldownRemainingMs - dtMs);
  }
}

// Attempt to fire weapon. Returns hitscan result (hit = damage should be applied).
export function tryFireWeapon(
  shooter: PlayerState,
  players: Record<string, PlayerState>,
  walls: Aabb[],
): HitscanResult | null {
  if (shooter.weapon.id === 'glock' || shooter.weapon.id === 'deagle' || shooter.weapon.id === 'm4a1') {
    const def = WEAPONS[shooter.weapon.id];
    if (shooter.weapon.fireCooldownRemainingMs > 0) return null;
    if (shooter.weapon.reloading) return null;
    if (shooter.weapon.ammo <= 0) {
      startReload(shooter);
      return null;
    }

    shooter.weapon.ammo--;
    shooter.weapon.fireCooldownRemainingMs = 1000 / def.fireRate;

    // Spread: add random offset to aim angle
    const spread = (Math.random() - 0.5) * 2 * def.spreadRad;
    const angle = shooter.facing + spread;
    const bx = shooter.x + Math.cos(angle) * def.rangePx;
    const by = shooter.y + Math.sin(angle) * def.rangePx;

    // Hitscan: find nearest living enemy in the ray's path
    let closestT = lineCast(shooter.x, shooter.y, bx, by, walls);
    let victim: string | null = null;

    for (const [key, target] of Object.entries(players)) {
      if (key === shooter.key || !target.alive) continue;
      // Check if ray passes through target hitbox (approx circle r=14)
      const tHit = rayVsCircle(shooter.x, shooter.y, bx, by, target.x, target.y, 14);
      if (tHit !== null && tHit < closestT) {
        closestT = tHit;
        victim = key;
      }
    }

    if (shooter.weapon.ammo <= 0 && !(shooter.weapon as any).infinite) {
      startReload(shooter);
    }

    return { hit: victim !== null, victim, weaponId: shooter.weapon.id };
  }
  return null;
}

// Attempt melee attack. Returns list of keys hit.
export function tryMelee(
  attacker: PlayerState,
  players: Record<string, PlayerState>,
): string[] {
  if (attacker.meleeCooldownRemainingMs > 0) return [];
  attacker.meleeCooldownRemainingMs = WEAPONS.melee.cooldownMs;

  const coneDeg = WEAPONS.melee.coneDeg;
  const range = WEAPONS.melee.rangePx;
  const halfCone = (coneDeg / 2) * (Math.PI / 180);
  const hit: string[] = [];

  for (const [key, target] of Object.entries(players)) {
    if (key === attacker.key || !target.alive) continue;
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > range) continue;
    const angle = Math.atan2(dy, dx);
    let diff = angle - attacker.facing;
    // Normalize to [-π, π]
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) <= halfCone) hit.push(key);
  }
  return hit;
}

export function startReload(p: PlayerState): void {
  if (p.weapon.reloading) return;
  const def = p.weapon.id === 'glock' ? WEAPONS.glock :
              p.weapon.id === 'deagle' ? WEAPONS.deagle : WEAPONS.m4a1;
  p.weapon.reloading = true;
  p.weapon.reloadRemainingMs = def.reloadMs;
}

export function pickupWeapon(p: PlayerState, weaponId: WeaponId): void {
  const def = weaponId === 'glock' ? WEAPONS.glock :
              weaponId === 'deagle' ? WEAPONS.deagle : WEAPONS.m4a1;
  p.weapon = {
    id: weaponId,
    ammo: def.mag,
    reloading: false,
    reloadRemainingMs: 0,
    fireCooldownRemainingMs: 0,
  };
}

// Apply damage to target (considering armor, shield powerup). Returns actual damage applied.
export function applyDamage(
  target: PlayerState,
  rawDamage: number,
): number {
  if (!target.alive) return 0;
  if (target.spawnInvulnRemainingMs > 0) return 0;
  const hasShield = target.activePowerups.some(p => p.kind === 'shield');
  if (hasShield) return 0;

  let dmg = rawDamage;
  if (target.armor > 0) {
    target.armor = Math.max(0, target.armor - dmg);
    dmg = 0; // armor absorbs one hit
  }
  if (dmg > 0) {
    target.hp = Math.max(0, target.hp - dmg);
  }
  return dmg;
}

// --- Private helpers ---

function rayVsCircle(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, r: number,
): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  discriminant = Math.sqrt(discriminant);
  const t1 = (-b - discriminant) / (2 * a);
  const t2 = (-b + discriminant) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}