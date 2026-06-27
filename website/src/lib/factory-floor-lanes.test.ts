import { describe, it, expect } from 'vitest';
import { mapShippedRow, mapAwaitingRow, isAwaitingDeployLaneVisible } from './factory-floor-lanes';

describe('factory-floor-lanes', () => {
  describe('mapShippedRow', () => {
    it('maps snake_case columns to camelCase and formats done_at as ISO', () => {
      const out = mapShippedRow({
        external_id: 'T000001',
        title: 'Done ticket',
        done_at: '2026-05-20T10:00:00Z',
        pr_number: 42,
      });
      expect(out).toEqual({
        extId: 'T000001',
        title: 'Done ticket',
        doneAt: '2026-05-20T10:00:00.000Z',
        prNumber: 42,
      });
    });

    it('keeps doneAt and prNumber as null when missing', () => {
      const out = mapShippedRow({ external_id: 'T-1', title: 'X', done_at: null, pr_number: null });
      expect(out.doneAt).toBeNull();
      expect(out.prNumber).toBeNull();
    });
  });

  describe('mapAwaitingRow', () => {
    it('maps snake_case columns to camelCase and formats updated_at as ISO', () => {
      const out = mapAwaitingRow({
        external_id: 'T000002',
        title: 'Awaiting',
        updated_at: '2026-05-21T10:00:00Z',
        pr_number: 99,
      });
      expect(out).toEqual({
        extId: 'T000002',
        title: 'Awaiting',
        mergedAt: '2026-05-21T10:00:00.000Z',
        prNumber: 99,
      });
    });

    it('keeps mergedAt and prNumber as null when missing', () => {
      const out = mapAwaitingRow({ external_id: 'T-1', title: 'X', updated_at: null, pr_number: null });
      expect(out.mergedAt).toBeNull();
      expect(out.prNumber).toBeNull();
    });
  });

  describe('isAwaitingDeployLaneVisible', () => {
    it('hides the lane when empty', () => {
      expect(isAwaitingDeployLaneVisible([])).toBe(false);
    });
    it('shows the lane when at least one item is present', () => {
      expect(isAwaitingDeployLaneVisible([{ extId: 'T-1', title: 'X', mergedAt: null, prNumber: null }])).toBe(true);
    });
  });
});
