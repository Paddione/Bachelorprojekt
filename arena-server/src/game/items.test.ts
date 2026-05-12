import { describe, it, expect } from 'vitest';
import { tickPickups, tickItemSpawn } from './items';
import type { MatchState, PlayerState } from './state';
import { ITEM_SPAWN_CYCLE_MS } from './constants';

function baseState(): MatchState {
  return {
    matchId: 'test', tick: 0, phase: 'in-match', startedAt: 0,
    players: {},
    items: [], powerups: [],
    zone: { cx: 480, cy: 270, radius: 300, shrinking: false, nextDamageMs: 3000 },
    doors: [{ id: 'north', locked: true }, { id: 'south', locked: false }],
    itemSpawnRemainingMs: ITEM_SPAWN_CYCLE_MS,
    powerupSpawnRemainingMs: 90_000,
    aliveCount: 1, everAliveCount: 1, nextItemId: 0, eliminationOrder: [],
  };
}

function makePlayer(x = 100, y = 100): PlayerState {
  return {
    key: 'p@mentolder', displayName: 'T', brand: 'mentolder',
    characterId: 'blonde-guy', isBot: false,
    x, y, facing: 0, hp: 1, armor: 0, alive: true, forfeit: false,
    dodging: false, dodgeCooldownRemainingMs: 0, spawnInvulnRemainingMs: 0,
    meleeCooldownRemainingMs: 0,
    weapon: { id: 'glock', ammo: 12, reloading: false, reloadRemainingMs: 0, fireCooldownRemainingMs: 0 },
    activePowerups: [], kills: 0, deaths: 0, respectCoins: 0, disconnectedMs: 0, place: null,
  };
}

describe('items', () => {
  it('health-pack heals player with < max HP', () => {
    const state = baseState();
    const player = makePlayer(100, 100);
    state.players[player.key] = player;
    state.items = [{ id: 'i1', kind: 'health-pack', x: 100, y: 100 }];
    const events: any[] = [];
    tickPickups(state, events);
    expect(player.hp).toBe(2);
    expect(state.items).toHaveLength(0);
    expect(events[0]).toMatchObject({ e: 'pickup-item', kind: 'health-pack' });
  });

  it('health-pack is not consumed when HP is full', () => {
    const state = baseState();
    const player = makePlayer(100, 100);
    player.hp = 2;
    state.players[player.key] = player;
    state.items = [{ id: 'i1', kind: 'health-pack', x: 100, y: 100 }];
    const events: any[] = [];
    tickPickups(state, events);
    expect(state.items).toHaveLength(1);
  });

  it('spawns items after ITEM_SPAWN_CYCLE_MS', () => {
    const state = baseState();
    state.itemSpawnRemainingMs = 1;
    const spots = Array.from({ length: 12 }, (_, i) => ({ x: i * 80, y: 100 }));
    tickItemSpawn(state, spots, 33, []);
    expect(state.items.length).toBeGreaterThan(0);
  });

  it('keycard unlocks north door', () => {
    const state = baseState();
    const player = makePlayer(100, 100);
    state.players[player.key] = player;
    state.items = [{ id: 'kc1', kind: 'keycard', x: 100, y: 100 }];
    const events: any[] = [];
    tickPickups(state, events);
    expect(state.doors.find(d => d.id === 'north')?.locked).toBe(false);
  });
});