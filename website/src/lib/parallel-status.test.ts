import { describe, it, expect } from 'vitest';
import {
  deriveParallelStatus,
  deriveNextTickAt,
  deriveCountdownSec,
} from './parallel-status';

describe('deriveNextTickAt', () => {
  it('adds intervalSec to last-tick-at when present', () => {
    expect(deriveNextTickAt('2026-07-22T10:00:00Z', 300, '2026-07-22T10:02:00Z'))
      .toBe('2026-07-22T10:05:00.000Z');
  });

  it('falls back to now + intervalSec when last-tick-at is null', () => {
    expect(deriveNextTickAt(null, 300, '2026-07-22T10:00:00Z'))
      .toBe('2026-07-22T10:05:00.000Z');
  });

  it('honours a non-default interval', () => {
    expect(deriveNextTickAt('2026-07-22T10:00:00Z', 60, '2026-07-22T10:00:30Z'))
      .toBe('2026-07-22T10:01:00.000Z');
  });
});

describe('deriveParallelStatus', () => {
  it('maps a snake_case aggregate row to the camelCase status shape', () => {
    const out = deriveParallelStatus(
      { gang_tickets: 1, slots_claimed: 3 },
      3,
      '2026-07-22T10:05:00.000Z',
    );
    expect(out).toEqual({
      gangTickets: 1,
      slotsClaimed: 3,
      slotsPerBrand: 3,
      nextTickAt: '2026-07-22T10:05:00.000Z',
    });
  });

  it('coerces psql string columns to numbers', () => {
    // node-postgres returns COUNT/SUM as strings — the derive must normalise.
    const out = deriveParallelStatus(
      { gang_tickets: '0', slots_claimed: '0' },
      3,
      null,
    );
    expect(out.gangTickets).toBe(0);
    expect(out.slotsClaimed).toBe(0);
    expect(typeof out.gangTickets).toBe('number');
    expect(out.nextTickAt).toBeNull();
  });
});

describe('deriveCountdownSec (Countdown-Restzeit)', () => {
  it('returns the remaining whole seconds before the next tick', () => {
    expect(deriveCountdownSec('2026-07-22T10:05:00Z', '2026-07-22T10:02:30Z')).toBe(150);
  });

  it('clamps to 0 when the tick is already due (remaining <= 0)', () => {
    expect(deriveCountdownSec('2026-07-22T10:00:00Z', '2026-07-22T10:00:00Z')).toBe(0);
    expect(deriveCountdownSec('2026-07-22T10:00:00Z', '2026-07-22T10:01:00Z')).toBe(0);
  });

  it('returns 0 for a null nextTickAt', () => {
    expect(deriveCountdownSec(null, '2026-07-22T10:00:00Z')).toBe(0);
  });
});
