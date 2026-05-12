import {
  MAP_W, MAP_H, ZONE_DELAY_MS, ZONE_SHRINK_DURATION_MS,
  ZONE_FINAL_RADIUS_PX, ZONE_DAMAGE_INTERVAL_MS,
} from './constants';
import type { ZoneState, PlayerState } from './state';
import type { GameEvent } from '../proto/messages';
import { applyDamage } from './weapons';

const ZONE_INITIAL_RADIUS = Math.min(MAP_W, MAP_H) * 0.6;

export function initZone(): ZoneState {
  return {
    cx: MAP_W / 2,
    cy: MAP_H / 2,
    radius: ZONE_INITIAL_RADIUS,
    shrinking: false,
    nextDamageMs: ZONE_DAMAGE_INTERVAL_MS,
  };
}

// Called each tick with dtMs = time elapsed since last tick
export function tickZone(
  zone: ZoneState,
  matchElapsedMs: number,
  dtMs: number,
  players: Record<string, PlayerState>,
  events: GameEvent[],
): void {
  // Start shrinking after ZONE_DELAY_MS
  if (!zone.shrinking && matchElapsedMs >= ZONE_DELAY_MS) {
    zone.shrinking = true;
    events.push({ e: 'zone-shrink-start' });
  }

  // Shrink linearly
  if (zone.shrinking && zone.radius > ZONE_FINAL_RADIUS_PX) {
    const shrinkRate = (ZONE_INITIAL_RADIUS - ZONE_FINAL_RADIUS_PX) / ZONE_SHRINK_DURATION_MS;
    zone.radius = Math.max(ZONE_FINAL_RADIUS_PX, zone.radius - shrinkRate * dtMs);
  }

  // Zone damage tick
  zone.nextDamageMs -= dtMs;
  if (zone.nextDamageMs <= 0) {
    zone.nextDamageMs = ZONE_DAMAGE_INTERVAL_MS;
    for (const [key, p] of Object.entries(players)) {
      if (!p.alive) continue;
      if (isOutsideZone(p.x, p.y, zone)) {
        applyDamage(p, 1);
        if (p.hp <= 0) {
          events.push({ e: 'kill-zone', victim: key });
        }
      }
    }
  }
}

export function isOutsideZone(x: number, y: number, zone: ZoneState): boolean {
  const dx = x - zone.cx;
  const dy = y - zone.cy;
  return dx * dx + dy * dy > zone.radius * zone.radius;
}