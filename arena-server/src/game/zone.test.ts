import { describe, it, expect } from 'vitest';
import { initZone, tickZone, isOutsideZone } from './zone';
import { MAP_W, MAP_H, ZONE_DELAY_MS, ZONE_FINAL_RADIUS_PX } from './constants';
import type { PlayerState } from './state';

function makeAlivePlayer(x = MAP_W / 2, y = MAP_H / 2): PlayerState {
  return {
    key: 'p@mentolder', displayName: 'T', brand: 'mentolder',
    characterId: 'blonde-guy', isBot: false,
    x, y, facing: 0, hp: 2, armor: 0, alive: true, forfeit: false,
    dodging: false, dodgeCooldownRemainingMs: 0, spawnInvulnRemainingMs: 0,
    meleeCooldownRemainingMs: 0,
    weapon: { id: 'glock', ammo: 12, reloading: false, reloadRemainingMs: 0, fireCooldownRemainingMs: 0 },
    activePowerups: [], kills: 0, deaths: 0, respectCoins: 0, disconnectedMs: 0, place: null,
  };
}

describe('zone', () => {
  it('does not shrink before ZONE_DELAY_MS', () => {
    const zone = initZone();
    const initial = zone.radius;
    tickZone(zone, ZONE_DELAY_MS - 1, 33, {}, []);
    expect(zone.radius).toBe(initial);
    expect(zone.shrinking).toBe(false);
  });

  it('starts shrinking at ZONE_DELAY_MS', () => {
    const zone = initZone();
    const initial = zone.radius;
    tickZone(zone, ZONE_DELAY_MS, 33, {}, []);
    expect(zone.shrinking).toBe(true);
    expect(zone.radius).toBeLessThan(initial);
  });

  it('stops shrinking at ZONE_FINAL_RADIUS_PX', () => {
    const zone = initZone();
    zone.shrinking = true;
    zone.radius = ZONE_FINAL_RADIUS_PX + 1;
    // Large dt forces it to clamp
    tickZone(zone, ZONE_DELAY_MS + 999_999, 999_999, {}, []);
    expect(zone.radius).toBe(ZONE_FINAL_RADIUS_PX);
  });

  it('isOutsideZone detects players outside radius', () => {
    const zone = initZone();
    zone.radius = 100;
    expect(isOutsideZone(MAP_W / 2 + 200, MAP_H / 2, zone)).toBe(true);
    expect(isOutsideZone(MAP_W / 2 + 50, MAP_H / 2, zone)).toBe(false);
  });

  it('damages player outside zone each damage interval', () => {
    const zone = initZone();
    zone.shrinking = true;
    zone.radius = 10; // everyone outside
    zone.nextDamageMs = 1; // trigger immediately
    const player = makeAlivePlayer(MAP_W / 2 + 500, MAP_H / 2);
    tickZone(zone, ZONE_DELAY_MS + 1, 33, { [player.key]: player }, []);
    expect(player.hp).toBe(1);
  });

  it('emits zone-shrink-start event exactly once', () => {
    const zone = initZone();
    const events: any[] = [];
    tickZone(zone, ZONE_DELAY_MS, 33, {}, events);
    tickZone(zone, ZONE_DELAY_MS + 33, 33, {}, events);
    expect(events.filter(e => e.e === 'zone-shrink-start')).toHaveLength(1);
  });
});