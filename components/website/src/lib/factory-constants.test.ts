import { describe, it, expect } from 'vitest';
import { SSE_RECONNECT_MS, STUCK_MIN, STREAM_POLL_MS, STREAM_HEARTBEAT_MS } from './factory-constants';

describe('factory-constants', () => {
  it('exposes the streaming / polling intervals in milliseconds', () => {
    expect(SSE_RECONNECT_MS).toBe(5_000);
    expect(STREAM_POLL_MS).toBe(5_000);
    expect(STREAM_HEARTBEAT_MS).toBe(30_000);
  });

  it('treats a stuck pipeline as older than 15 minutes', () => {
    expect(STUCK_MIN).toBe(15);
  });
});
