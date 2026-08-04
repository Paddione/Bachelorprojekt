import { describe, it, expect } from 'vitest';
import { phaseDurations } from './factory-floor-client';

describe('phaseDurations', () => {
  it('returns an empty array for no events', () => {
    expect(phaseDurations([])).toEqual([]);
  });

  it('sorts events ascending by timestamp', () => {
    const out = phaseDurations([
      { phase: 'design', state: 'entered', detail: null, driver: 'A', at: '2026-06-27T10:00:00Z' },
      { phase: 'scout', state: 'entered', detail: null, driver: 'A', at: '2026-06-27T09:00:00Z' },
    ]);
    expect(out[0].phase).toBe('scout');
    expect(out[1].phase).toBe('design');
  });

  it('assigns null durationSec to the first event', () => {
    const out = phaseDurations([
      { phase: 'scout', state: 'entered', detail: null, driver: 'A', at: '2026-06-27T09:00:00Z' },
    ]);
    expect(out[0].durationSec).toBeNull();
  });

  it('computes the duration in seconds between consecutive events', () => {
    const out = phaseDurations([
      { phase: 'scout', state: 'entered', detail: null, driver: 'A', at: '2026-06-27T09:00:00Z' },
      { phase: 'design', state: 'entered', detail: null, driver: 'A', at: '2026-06-27T09:05:00Z' },
      { phase: 'plan', state: 'entered', detail: null, driver: 'A', at: '2026-06-27T09:11:30Z' },
    ]);
    expect(out[0].durationSec).toBeNull();
    expect(out[1].durationSec).toBe(300);
    expect(out[2].durationSec).toBe(390);
  });
});
