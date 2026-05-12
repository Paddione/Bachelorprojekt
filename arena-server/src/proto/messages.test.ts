import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg, isClientMsg } from './messages';

describe('protocol', () => {
  it('exposes version 1', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('round-trips a lobby:join client message', () => {
    const msg: ClientMsg = { t: 'lobby:join', code: 'ZK4M9X' };
    const json = JSON.stringify(msg);
    const back = JSON.parse(json) as ClientMsg;
    expect(isClientMsg(back)).toBe(true);
    expect(back.t).toBe('lobby:join');
  });

  it('round-trips a server lobby:state', () => {
    const msg: ServerMsg = {
      t: 'lobby:state', code: 'ZK4M9X', phase: 'open',
      players: [], expiresAt: Date.now() + 60_000,
    };
    expect(JSON.parse(JSON.stringify(msg)).t).toBe('lobby:state');
  });

  it('round-trips a spectator:join client message', () => {
    const msg: ClientMsg = { t: 'spectator:join', code: 'ZK4M9X' };
    expect(isClientMsg(JSON.parse(JSON.stringify(msg)))).toBe(true);
  });
});