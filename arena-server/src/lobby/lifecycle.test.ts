import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Lifecycle } from './lifecycle';
import * as registry from './registry';
import type { PlayerSlot } from '../proto/messages';

function humanSlot(key: string, name = 'P'): PlayerSlot {
  return { key, displayName: name, brand: 'mentolder', characterId: 'blonde-guy',
           isBot: false, ready: true, alive: true };
}

describe('Lifecycle', () => {
  beforeEach(() => {
    for (const l of registry.listLobbies()) registry.removeLobby(l.code);
    vi.useFakeTimers();
  });

  it('opens then auto-fills bots and enters in-match after 60s', () => {
    const onBroadcast = vi.fn();
    const lc = new Lifecycle({ onBroadcast, persist: { insertLobby: async () => {}, updateLobbyPhase: async () => {} } as any, bc: { emitMatchSnapshot: vi.fn(), emitMatchDiff: vi.fn(), emitMatchEvent: vi.fn(), emitMatchEnd: vi.fn() } as any });
    const { code } = lc.open({ hostKey: 'patrick@mentolder', hostName: 'Patrick' });
    const lobby = registry.getLobby(code)!;
    expect(lobby.phase).toBe('open');
    expect(lobby.players.size).toBe(1);

    vi.advanceTimersByTime(60_001);
    expect(lobby.phase).toBe('starting');
    expect(lobby.players.size).toBe(4);
    vi.advanceTimersByTime(5_001);
    expect(lobby.phase).toBe('in-match');
  });

  it('rejects a second open while one is active', () => {
    const lc = new Lifecycle({ onBroadcast: () => {}, persist: { insertLobby: async () => {}, updateLobbyPhase: async () => {} } as any, bc: { emitMatchSnapshot: vi.fn(), emitMatchDiff: vi.fn(), emitMatchEvent: vi.fn(), emitMatchEnd: vi.fn() } as any });
    lc.open({ hostKey: 'patrick@mentolder', hostName: 'Patrick' });
    expect(() => lc.open({ hostKey: 'other@mentolder', hostName: 'X' })).toThrow(/409|conflict/i);
  });

  it('starts at 5s when 4 humans join', () => {
    const lc = new Lifecycle({ onBroadcast: () => {}, persist: { insertLobby: async () => {}, updateLobbyPhase: async () => {} } as any, bc: { emitMatchSnapshot: vi.fn(), emitMatchDiff: vi.fn(), emitMatchEvent: vi.fn(), emitMatchEnd: vi.fn() } as any });
    const { code } = lc.open({ hostKey: 'h1@mentolder', hostName: 'h1' });
    lc.join(code, humanSlot('h2@mentolder'));
    lc.join(code, humanSlot('h3@mentolder'));
    lc.join(code, humanSlot('h4@korczewski'));
    expect(registry.getLobby(code)!.phase).toBe('starting');
  });
});