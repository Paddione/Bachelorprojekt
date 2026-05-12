import { describe, it, expect } from 'vitest';
import { tryFireWeapon, tryMelee, applyDamage, startReload } from './weapons';
import type { PlayerState } from './state';

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    key: 'p1@mentolder', displayName: 'Test', brand: 'mentolder',
    characterId: 'blonde-guy', isBot: false,
    x: 100, y: 100, facing: 0,
    hp: 2, armor: 0, alive: true, forfeit: false,
    dodging: false, dodgeCooldownRemainingMs: 0,
    spawnInvulnRemainingMs: 0, meleeCooldownRemainingMs: 0,
    weapon: { id: 'glock', ammo: 12, reloading: false, reloadRemainingMs: 0, fireCooldownRemainingMs: 0 },
    activePowerups: [], kills: 0, deaths: 0, respectCoins: 0, disconnectedMs: 0, place: null,
    ...overrides,
  };
}

describe('tryFireWeapon', () => {
  it('misses when no targets', () => {
    const shooter = makePlayer({ facing: 0 });
    const result = tryFireWeapon(shooter, {}, []);
    expect(result).not.toBeNull();
    expect(result!.hit).toBe(false);
    expect(result!.victim).toBeNull();
  });

  it('hits target directly in front', () => {
    const shooter = makePlayer({ x: 100, y: 100, facing: 0 });
    const target = makePlayer({ key: 'p2@mentolder', x: 200, y: 100 });
    const result = tryFireWeapon(shooter, { [target.key]: target }, []);
    expect(result!.hit).toBe(true);
    expect(result!.victim).toBe(target.key);
  });

  it('respects fire cooldown', () => {
    const shooter = makePlayer({ weapon: { id: 'glock', ammo: 12, reloading: false, reloadRemainingMs: 0, fireCooldownRemainingMs: 100 } });
    const result = tryFireWeapon(shooter, {}, []);
    expect(result).toBeNull();
  });

  it('misses target behind a wall', () => {
    const wall = { x1: 149, y1: 80, x2: 151, y2: 120 };
    const shooter = makePlayer({ x: 100, y: 100, facing: 0 });
    const target = makePlayer({ key: 'p2@mentolder', x: 200, y: 100 });
    const result = tryFireWeapon(shooter, { [target.key]: target }, [wall]);
    expect(result!.hit).toBe(false);
  });
});

describe('tryMelee', () => {
  it('hits target within cone and range', () => {
    const attacker = makePlayer({ x: 100, y: 100, facing: 0 });
    const target = makePlayer({ key: 'p2@mentolder', x: 130, y: 100 });
    const hit = tryMelee(attacker, { [target.key]: target });
    expect(hit).toContain(target.key);
  });

  it('misses target behind', () => {
    const attacker = makePlayer({ x: 100, y: 100, facing: 0 });
    const target = makePlayer({ key: 'p2@mentolder', x: 70, y: 100 });
    const hit = tryMelee(attacker, { [target.key]: target });
    expect(hit).toHaveLength(0);
  });

  it('misses target beyond range', () => {
    const attacker = makePlayer({ x: 100, y: 100, facing: 0 });
    const target = makePlayer({ key: 'p2@mentolder', x: 200, y: 100 });
    const hit = tryMelee(attacker, { [target.key]: target });
    expect(hit).toHaveLength(0);
  });
});

describe('applyDamage', () => {
  it('reduces HP directly when no armor', () => {
    const p = makePlayer({ hp: 2, armor: 0 });
    applyDamage(p, 1);
    expect(p.hp).toBe(1);
  });

  it('armor absorbs one hit', () => {
    const p = makePlayer({ hp: 2, armor: 1 });
    applyDamage(p, 1);
    expect(p.hp).toBe(2);
    expect(p.armor).toBe(0);
  });

  it('shield blocks damage entirely', () => {
    const p = makePlayer({ hp: 2, activePowerups: [{ kind: 'shield', expiresAtTick: 9999 }] });
    applyDamage(p, 1);
    expect(p.hp).toBe(2);
  });

  it('spawn invuln blocks damage', () => {
    const p = makePlayer({ hp: 2, spawnInvulnRemainingMs: 500 });
    applyDamage(p, 1);
    expect(p.hp).toBe(2);
  });
});