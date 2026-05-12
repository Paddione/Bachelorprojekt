import { describe, it, expect } from 'vitest';
import type { MatchState, PlayerState } from '../shared/lobbyTypes';
import { applyDiff } from './diff';

function baseState(): MatchState {
  return {
    matchId: 'test', tick: 0, phase: 'in-match', startedAt: 0,
    players: {}, items: [], powerups: [],
    zone: { cx: 480, cy: 270, radius: 300, shrinking: false, nextDamageMs: 3000 },
    doors: [{ id: 'north', locked: true }],
    itemSpawnRemainingMs: 60_000, powerupSpawnRemainingMs: 90_000,
    aliveCount: 4, everAliveCount: 4, nextItemId: 0, eliminationOrder: [],
  };
}

function basePlayer(): PlayerState {
  return {
    key: 'alice@mentolder', displayName: 'Alice', brand: 'mentolder',
    characterId: 'blonde-guy', isBot: false,
    x: 100, y: 200, facing: 0, hp: 2, armor: 0, alive: true, forfeit: false,
    dodging: false, dodgeCooldownRemainingMs: 0, spawnInvulnRemainingMs: 0,
    meleeCooldownRemainingMs: 0,
    weapon: { id: 'glock', ammo: 12, reloading: false, reloadRemainingMs: 0, fireCooldownRemainingMs: 0 },
    activePowerups: [], kills: 0, deaths: 0, respectCoins: 0, disconnectedMs: 0, place: null,
  };
}

describe('applyDiff', () => {
  it('updates tick and aliveCount', () => {
    const s = baseState();
    applyDiff(s, [{ p: 'tick', v: 5 }, { p: 'alive', v: 3 }]);
    expect(s.tick).toBe(5);
    expect(s.aliveCount).toBe(3);
  });

  it('updates zone radius and shrinking flag', () => {
    const s = baseState();
    applyDiff(s, [{ p: 'z.r', v: 250 }, { p: 'z.s', v: true }]);
    expect(s.zone.radius).toBe(250);
    expect(s.zone.shrinking).toBe(true);
  });

  it('adds a new player from full PlayerState op', () => {
    const s = baseState();
    const p = basePlayer();
    applyDiff(s, [{ p: `p.${p.key}`, v: p }]);
    expect(s.players[p.key]).toBeDefined();
    expect(s.players[p.key].x).toBe(100);
  });

  it('updates individual player fields', () => {
    const s = baseState();
    s.players['alice@mentolder'] = basePlayer();
    applyDiff(s, [
      { p: 'p.alice@mentolder.x', v: 350 },
      { p: 'p.alice@mentolder.hp', v: 1 },
      { p: 'p.alice@mentolder.alive', v: false },
      { p: 'p.alice@mentolder.wammo', v: 8 },
      { p: 'p.alice@mentolder.wrl', v: true },
      { p: 'p.alice@mentolder.wid', v: 'deagle' },
      { p: 'p.alice@mentolder.f', v: 1.57 },
      { p: 'p.alice@mentolder.ar', v: 1 },
      { p: 'p.alice@mentolder.dodge', v: true },
    ]);
    const pl = s.players['alice@mentolder'];
    expect(pl.x).toBe(350);
    expect(pl.hp).toBe(1);
    expect(pl.alive).toBe(false);
    expect(pl.weapon.ammo).toBe(8);
    expect(pl.weapon.reloading).toBe(true);
    expect(pl.weapon.id).toBe('deagle');
    expect(pl.facing).toBeCloseTo(1.57);
    expect(pl.armor).toBe(1);
    expect(pl.dodging).toBe(true);
  });

  it('adds and removes items', () => {
    const s = baseState();
    applyDiff(s, [{ p: 'item+.i1', v: { id: 'i1', kind: 'health-pack', x: 100, y: 200 } }]);
    expect(s.items).toHaveLength(1);
    applyDiff(s, [{ p: 'item-.i1', v: null }]);
    expect(s.items).toHaveLength(0);
  });

  it('adds and removes powerups', () => {
    const s = baseState();
    applyDiff(s, [{ p: 'pu+.pu1', v: { id: 'pu1', kind: 'shield', x: 300, y: 400 } }]);
    expect(s.powerups).toHaveLength(1);
    applyDiff(s, [{ p: 'pu-.pu1', v: null }]);
    expect(s.powerups).toHaveLength(0);
  });

  it('updates door locked state', () => {
    const s = baseState();
    applyDiff(s, [{ p: 'door.north.locked', v: false }]);
    expect(s.doors.find(d => d.id === 'north')!.locked).toBe(false);
  });

  it('updates activePowerups array', () => {
    const s = baseState();
    s.players['alice@mentolder'] = basePlayer();
    const pws = [{ kind: 'shield', expiresAtTick: 100 }];
    applyDiff(s, [{ p: 'p.alice@mentolder.pw', v: pws }]);
    expect(s.players['alice@mentolder'].activePowerups).toEqual(pws);
  });

  it('ignores unknown op paths (no throw)', () => {
    const s = baseState();
    expect(() => applyDiff(s, [{ p: 'unknown.field', v: 99 }])).not.toThrow();
  });
});
