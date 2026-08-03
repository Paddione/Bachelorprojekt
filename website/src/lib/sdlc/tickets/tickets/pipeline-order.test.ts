import { describe, it, expect } from 'vitest';
import {
  ALL_TICKET_STATUSES,
  PIPELINE_LANES,
  PIPELINE_STATUSES,
  STATUS_BUCKETS,
  type LaneKey,
  type TicketStatus,
} from './pipeline-order';

describe('ALL_TICKET_STATUSES', () => {
  it('contains exactly the 11 known ticket statuses', () => {
    expect(ALL_TICKET_STATUSES).toHaveLength(11);
  });

  it('contains no duplicates', () => {
    expect(new Set(ALL_TICKET_STATUSES).size).toBe(ALL_TICKET_STATUSES.length);
  });
});

describe('PIPELINE_LANES', () => {
  it('declares 9 lanes (7 main + 2 side)', () => {
    expect(PIPELINE_LANES).toHaveLength(9);
  });

  it('every lane has a unique key', () => {
    const keys = PIPELINE_LANES.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the main (non-side) lanes cover exactly the 9 linear statuses', () => {
    const main = PIPELINE_LANES.filter((l) => !l.side).flatMap((l) => l.statuses);
    expect(main).toHaveLength(9);
  });

  it('side lanes cover blocked and archived', () => {
    const sideStatuses = PIPELINE_LANES.filter((l) => l.side).flatMap((l) => l.statuses);
    expect(sideStatuses).toEqual(['blocked', 'archived']);
  });
});

describe('PIPELINE_STATUSES', () => {
  it('is the front-to-back list of linear statuses (side:false lanes)', () => {
    expect(PIPELINE_STATUSES[0]).toBe('triage');
    expect(PIPELINE_STATUSES[PIPELINE_STATUSES.length - 1]).toBe('done');
  });

  it('contains no blocked / archived entries (those are side lanes)', () => {
    expect(PIPELINE_STATUSES).not.toContain('blocked');
    expect(PIPELINE_STATUSES).not.toContain('archived');
  });
});

describe('STATUS_BUCKETS', () => {
  it('maps every ticket status to exactly one lane key', () => {
    for (const s of ALL_TICKET_STATUSES) {
      const lane = STATUS_BUCKETS[s as TicketStatus];
      expect(lane).toBeDefined();
    }
  });

  it('routes blocked/archived to their side lanes', () => {
    expect(STATUS_BUCKETS.blocked).toBe<LaneKey>('attention');
    expect(STATUS_BUCKETS.archived).toBe<LaneKey>('archive');
  });

  it('routes the in-flight statuses to the hall lane', () => {
    expect(STATUS_BUCKETS.in_progress).toBe<LaneKey>('hall');
    expect(STATUS_BUCKETS.in_review).toBe<LaneKey>('hall');
  });

  it('routes done to the shipped lane', () => {
    expect(STATUS_BUCKETS.done).toBe<LaneKey>('shipped');
  });
});

describe('shipped lane label', () => {
  it('labels the shipped lane Versand (SSOT)', () => {
    const shipped = PIPELINE_LANES.find((l) => l.key === 'shipped');
    expect(shipped?.label).toBe('Versand');
  });
});
