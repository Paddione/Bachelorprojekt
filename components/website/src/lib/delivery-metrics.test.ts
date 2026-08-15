import { describe, it, expect } from 'vitest';
import { calcDurationH, toDeliveryMetric, summarize, modelMixPercent } from './delivery-metrics';
import type { DeliveryRow, DeliveryMetric } from './delivery-metrics';

describe('calcDurationH', () => {
  it('returns null when from is null', () => {
    expect(calcDurationH(null, '2026-06-14T12:00:00Z')).toBeNull();
  });

  it('returns null when to is null', () => {
    expect(calcDurationH('2026-06-14T12:00:00Z', null)).toBeNull();
  });

  it('returns null when both are null', () => {
    expect(calcDurationH(null, null)).toBeNull();
  });

  it('calculates correct hour difference', () => {
    const from = '2026-06-14T10:00:00Z';
    const to = '2026-06-14T16:30:00Z';
    expect(calcDurationH(from, to)).toBe(6.5);
  });

  it('calculates multi-day difference', () => {
    const from = '2026-06-10T08:00:00Z';
    const to = '2026-06-14T08:00:00Z';
    expect(calcDurationH(from, to)).toBe(96);
  });
});

describe('toDeliveryMetric', () => {
  const baseRow: DeliveryRow = {
    ticket_id: 'T000500',
    title: 'Feature A',
    ticket_created_at: '2026-06-10T08:00:00Z',
    done_at: '2026-06-14T16:00:00Z',
    pr_number: 123,
    pr_opened_at: '2026-06-11T10:00:00Z',
    merged_at: '2026-06-14T14:00:00Z',
  };

  it('calculates all fields with complete data', () => {
    const m = toDeliveryMetric(baseRow, '2026-06-14T18:00:00Z', 'Paddione/Bachelorprojekt');
    expect(m.ticketId).toBe('T000500');
    expect(m.prNumber).toBe(123);
    expect(m.ticketUrl).toBe('/admin/tickets/T000500');
    expect(m.prUrl).toBe('https://github.com/Paddione/Bachelorprojekt/pull/123');
    expect(m.hoursTicketToPrOpen).toBe(26);
    expect(m.hoursPrOpenToMerged).toBe(76);
    expect(m.hoursMergedToLive).toBe(4);
    expect(m.hoursTotal).toBe(106);
  });

  it('returns null fields when timestamps are missing', () => {
    const row: DeliveryRow = {
      ...baseRow,
      pr_opened_at: null,
      merged_at: null,
    };
    const m = toDeliveryMetric(row, null, 'Paddione/Bachelorprojekt');
    expect(m.hoursTicketToPrOpen).toBeNull();
    expect(m.hoursPrOpenToMerged).toBeNull();
    expect(m.hoursMergedToLive).toBeNull();
    expect(m.hoursTotal).toBeNull();
  });
});

describe('modelMixPercent', () => {
  it('calculates correct percentages', () => {
    const r = modelMixPercent({ 'anthropic/claude-opus': 5, 'anthropic/claude-sonnet': 3, 'deepseek/deepseek-chat': 2 });
    expect(r.claudePct).toBe(80);
    expect(r.deepseekPct).toBe(20);
    expect(r.otherPct).toBe(0);
  });

  it('handles empty input gracefully', () => {
    const r = modelMixPercent({});
    expect(r.claudePct).toBe(0);
    expect(r.deepseekPct).toBe(0);
    expect(r.otherPct).toBe(0);
  });
});

describe('summarize', () => {
  it('computes averages ignoring null entries', () => {
    const metrics = [
      { hoursTicketToPrOpen: 10, hoursPrOpenToMerged: 20, hoursMergedToLive: 5, hoursTotal: 35 } as unknown as DeliveryMetric,
      { hoursTicketToPrOpen: null, hoursPrOpenToMerged: null, hoursMergedToLive: null, hoursTotal: null } as unknown as DeliveryMetric,
      { hoursTicketToPrOpen: 30, hoursPrOpenToMerged: 40, hoursMergedToLive: 10, hoursTotal: 80 } as unknown as DeliveryMetric,
    ];

    const s = summarize(metrics, 2, 14, {});
    expect(s.deliveries).toBe(3);
    expect(s.avgHoursTicketToPrOpen).toBe(20);
    expect(s.avgHoursPrOpenToMerged).toBe(30);
    expect(s.avgHoursMergedToLive).toBe(7.5);
    expect(s.avgHoursTotal).toBe(57.5);
  });

  it('mishap rate is bugCount / deliveries', () => {
    const metrics = [{ hoursTicketToPrOpen: 1 } as unknown as DeliveryMetric, { hoursTicketToPrOpen: 2 } as unknown as DeliveryMetric];
    const s = summarize(metrics, 1, 7, {});
    expect(s.mishapRate).toBe(0.5);
    expect(s.mishapCount).toBe(1);
  });

  it('throughput per week works with 0 deliveries', () => {
    const s = summarize([], 0, 7, {});
    expect(s.throughputPerWeek).toBe(0);
    expect(s.deliveries).toBe(0);
    expect(s.mishapRate).toBeNull();
  });
});
