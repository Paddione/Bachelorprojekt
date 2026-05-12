import { describe, it, expect } from 'vitest';
import { tickPowerupSpawn, tickPowerupPickups, tickActivePowerups } from './powerups';
import type { MatchState, PlayerState } from './state';
import { POWERUP_SPAWN_CYCLE_MS } from './constants';

function baseState(): MatchState {
  return {
    matchId: 'test', tick: 0, phase: 'in-match', startedAt: 0,
    players: {}, items: [], powerups: [],
    zone: { cx: 480, cy: 270, radius: 300, shrinking: false, nextDamageMs: 3000 },
    doors: [], itemSpawnRemainingMs: 60_000, powerupSpawnRemainingMs: POWERUP_SPAWN_CYCLE_MS,
    aliveCount: 1, everAliveCount: 1, nextItemId: 0, eliminationOrder: [],
  };
}

function makePlayer(x = 100, y = 100): PlayerState {
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

describe('powerups', () => {
  it('spawns a powerup after the spawn cycle', () => {
    const state = baseState();
    state.powerupSpawnRemainingMs = 1;
    const spots = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 },
                   { x: 400, y: 100 }, { x: 500, y: 100 }];
    tickPowerupSpawn(state, spots, 33);
    expect(state.powerups).toHaveLength(1);
  });

  it('player picks up powerup on overlap', () => {
    const state = baseState();
    const player = makePlayer(100, 100);
    state.players[player.key] = player;
    state.powerups = [{ id: 'pu1', kind: 'shield', x: 100, y: 100 }];
    const events: any[] = [];
    tickPowerupPickups(state, events);
    expect(player.activePowerups).toHaveLength(1);
    expect(player.activePowerups[0].kind).toBe('shield');
    expect(state.powerups).toHaveLength(0);
    expect(events[0]).toMatchObject({ e: 'pickup-powerup', kind: 'shield' });
  });

  it('powerup expires at correct tick', () => {
    const state = baseState();
    const player = makePlayer();
    player.activePowerups = [{ kind: 'shield', expiresAtTick: 5 }];
    state.players[player.key] = player;
    state.tick = 5;
    const events: any[] = [];
    tickActivePowerups(state, events);
    expect(player.activePowerups).toHaveLength(0);
    expect(events[0]).toMatchObject({ e: 'powerup-expire', kind: 'shield' });
  });

  it('powerup does not expire before its tick', () => {
    const state = baseState();
    const player = makePlayer();
    player.activePowerups = [{ kind: 'speed', expiresAtTick: 100 }];
    state.players[player.key] = player;
    state.tick = 99;
    tickActivePowerups(state, []);
    expect(player.activePowerups).toHaveLength(1);
  });
});