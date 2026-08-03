import { describe, it, expect } from 'vitest';
import {
  mapShippedRow,
  mapAwaitingRow,
  isAwaitingDeployLaneVisible,
} from './factory-floor-lanes';

describe('factory-floor-lanes', () => {
  it('mapShippedRow normalises done_at to ISO and keeps prNumber', () => {
    const r = mapShippedRow({ external_id: 'T1', title: 'X', done_at: '2026-06-22T10:00:00Z', pr_number: 42 });
    expect(r).toEqual({ extId: 'T1', title: 'X', doneAt: '2026-06-22T10:00:00.000Z', prNumber: 42 });
  });

  it('mapShippedRow tolerates null done_at and null pr_number', () => {
    const r = mapShippedRow({ external_id: 'T2', title: 'Y', done_at: null, pr_number: null });
    expect(r.doneAt).toBeNull();
    expect(r.prNumber).toBeNull();
  });

  it('mapAwaitingRow maps updated_at to mergedAt (ISO)', () => {
    const r = mapAwaitingRow({ external_id: 'T3', title: 'Z', updated_at: '2026-06-22T09:00:00Z', pr_number: 7 });
    expect(r.mergedAt).toBe('2026-06-22T09:00:00.000Z');
    expect(r.prNumber).toBe(7);
  });

  it('isAwaitingDeployLaneVisible hides an empty lane (happy path)', () => {
    expect(isAwaitingDeployLaneVisible([])).toBe(false);
  });

  it('isAwaitingDeployLaneVisible shows a non-empty lane (manual hold-back)', () => {
    expect(isAwaitingDeployLaneVisible([{ extId: 'T4', title: 'M', mergedAt: null, prNumber: null }])).toBe(true);
  });
});
