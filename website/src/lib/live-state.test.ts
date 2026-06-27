import { describe, it, expect } from 'vitest';
import { deriveLiveState, type LiveCockpitData } from './live-state';

const baseData = (overrides: Partial<LiveCockpitData> = {}): LiveCockpitData => ({
  stream: { live: false, recording: false },
  rooms: [],
  pollActive: null,
  recentSessions: [],
  schedule: { nextEvent: null },
  ...overrides,
});

describe('live-state.deriveLiveState', () => {
  it('returns "empty" when nothing is happening', () => {
    expect(deriveLiveState(baseData())).toBe('empty');
  });

  it('returns "stream" when only the stream is live', () => {
    expect(deriveLiveState(baseData({ stream: { live: true, recording: false } }))).toBe('stream');
  });

  it('returns "stream" when only recording is on', () => {
    expect(deriveLiveState(baseData({ stream: { live: false, recording: true } }))).toBe('stream');
  });

  it('returns "rooms" when only call rooms are active', () => {
    expect(deriveLiveState(baseData({ rooms: [{ uid: 'r1', token: 't', name: 'n', participants: 1 }] as never }))).toBe('rooms');
  });

  it('returns "both" when stream + rooms are both active', () => {
    expect(deriveLiveState(baseData({
      stream: { live: true, recording: false },
      rooms: [{ uid: 'r1' }] as never,
    }))).toBe('both');
  });

  it('does not consider other fields (polls, sessions, schedule)', () => {
    expect(deriveLiveState(baseData({
      pollActive: { id: 'p1', question: '?', kind: 'text' },
      recentSessions: [{ id: 's1' }] as never,
      schedule: { nextEvent: { startsAt: '2026-05-20T10:00:00Z', label: 'meeting' } },
    }))).toBe('empty');
  });
});
