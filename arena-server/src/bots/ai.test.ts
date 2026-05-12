import { describe, it, expect } from 'vitest';
import { BotAI } from './ai';
import { buildGrid } from './nav';
import { CONCRETE_ARENA } from '../game/map';
import type { MatchState, PlayerState } from '../game/state';
import { initZone } from '../game/zone';
import { MAP_W, MAP_H } from '../game/constants';

function makeMatchState(botKey: string, otherKey = 'enemy@mentolder'): MatchState {
  const makeP = (key: string, x: number, y: number, isBot: boolean): PlayerState => ({
    key, displayName: key, brand: 'mentolder', characterId: 'blonde-guy', isBot,
    x, y, facing: 0, hp: 2, armor: 0, alive: true, forfeit: false,
    dodging: false, dodgeCooldownRemainingMs: 0, spawnInvulnRemainingMs: 0,
    meleeCooldownRemainingMs: 0,
    weapon: { id: 'glock', ammo: 12, reloading: false, reloadRemainingMs: 0, fireCooldownRemainingMs: 0 },
    activePowerups: [], kills: 0, deaths: 0, respectCoins: 0, disconnectedMs: 0, place: null,
  });
  return {
    matchId: 'test', tick: 0, phase: 'in-match', startedAt: 0,
    players: {
      [botKey]: makeP(botKey, MAP_W / 2, MAP_H / 2, true),
      [otherKey]: makeP(otherKey, MAP_W / 2 + 100, MAP_H / 2, false),
    },
    items: [], powerups: [],
    zone: initZone(),
    doors: [{ id: 'north', locked: true }, { id: 'south', locked: false }],
    itemSpawnRemainingMs: 60_000, powerupSpawnRemainingMs: 90_000,
    aliveCount: 2, everAliveCount: 2, nextItemId: 0, eliminationOrder: [],
  };
}

describe('BotAI', () => {
  it('returns a valid BotInput when alive', () => {
    const grid = buildGrid(CONCRETE_ARENA.walls);
    const bot = new BotAI('bot_1', grid);
    const match = makeMatchState('bot_1');
    const input = bot.decide(match, 33);
    expect(input).toMatchObject({
      wasd: expect.any(Number),
      aim: expect.any(Number),
      fire: expect.any(Boolean),
      melee: expect.any(Boolean),
    });
    expect(input.wasd).toBeGreaterThanOrEqual(0);
    expect(input.wasd).toBeLessThanOrEqual(8);
  });

  it('does not fire when dead', () => {
    const grid = buildGrid(CONCRETE_ARENA.walls);
    const bot = new BotAI('bot_1', grid);
    const match = makeMatchState('bot_1');
    match.players['bot_1'].alive = false;
    const input = bot.decide(match, 33);
    expect(input.fire).toBe(false);
    expect(input.wasd).toBe(0);
  });

  it('transitions to ENGAGE when enemy is visible and close', () => {
    const grid = buildGrid(CONCRETE_ARENA.walls);
    const bot = new BotAI('bot_1', grid);
    const match = makeMatchState('bot_1');
    // Enemy at same position (LOS guaranteed, distance=0 < ENGAGE_RANGE)
    match.players['enemy@mentolder'].x = MAP_W / 2 + 50;
    match.players['enemy@mentolder'].y = MAP_H / 2;
    // Run multiple decision cycles to ensure state transition
    let fired = false;
    for (let i = 0; i < 20; i++) {
      const input = bot.decide(match, 33);
      if (input.fire) { fired = true; break; }
    }
    expect(fired).toBe(true);
  });
});