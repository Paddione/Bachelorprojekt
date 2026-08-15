import { describe, it, expect } from 'vitest';
import { aggregateDora, formatKpiTile } from '../leitstand-kpi';
import type { DeliveryMetric } from '../../delivery-metrics';

// Feste Fixture-Zeilen -> deterministische DORA-Werte (SSOT:
// openspec/changes/sdlc-leitstand-e4-livedaten/specs/sdlc-cockpit.md,
// "Aggregation is pure and tested").

function metric(partial: Partial<DeliveryMetric>): DeliveryMetric {
  return {
    ticketId: 'T000001',
    title: 'Fixture',
    prNumber: 1,
    ticketUrl: '/admin/tickets/T000001',
    prUrl: 'https://github.com/Paddione/Bachelorprojekt/pull/1',
    hoursTicketToPrOpen: null,
    hoursPrOpenToMerged: null,
    hoursMergedToLive: null,
    hoursTotal: null,
    ...partial,
  };
}

const THREE_DELIVERIES: DeliveryMetric[] = [
  metric({ ticketId: 'T000001', hoursTotal: 10 }),
  metric({ ticketId: 'T000002', hoursTotal: 20 }),
  metric({ ticketId: 'T000003', hoursTotal: 30 }),
];

describe('aggregateDora', () => {
  it('liefert deterministische DORA-Werte fuer eine feste Fixture', () => {
    const kpis = aggregateDora(THREE_DELIVERIES, { windowDays: 7, bugCount: 1 });
    // 3 Deliveries in 1 Woche -> 3.0/Woche; lead time = Mittel 20h;
    // 1 Bug / 3 Deliveries -> 0.33 (summarize rundet CFR auf 2 Dezimalstellen).
    expect(kpis.deploymentFrequencyPerWeek).toBe(3.0);
    expect(kpis.leadTimeHoursAvg).toBe(20);
    expect(kpis.changeFailureRate).toBe(0.33);
    expect(kpis.deliveries).toBe(3);
    expect(kpis.weeks).toBe(1);
    expect(kpis.mishapCount).toBe(1);
  });

  it('skaliert die Frequenz auf das Fenster (30 Tage)', () => {
    const kpis = aggregateDora(THREE_DELIVERIES, { windowDays: 30, bugCount: 0 });
    expect(kpis.deploymentFrequencyPerWeek).toBeCloseTo(0.7, 1);
    expect(kpis.weeks).toBeCloseTo(4.3, 1);
  });

  it('behandelt Leer-Eingabe ohne Fehler: Frequenz 0, Lead Time und CFR null', () => {
    const kpis = aggregateDora([], { windowDays: 7, bugCount: 0 });
    expect(kpis.deploymentFrequencyPerWeek).toBe(0);
    expect(kpis.leadTimeHoursAvg).toBeNull();
    expect(kpis.changeFailureRate).toBeNull();
    expect(kpis.deliveries).toBe(0);
  });

  it('laesst lead times ohne Stundenwerte als null, nicht als 0, durch', () => {
    const rows = [
      metric({ ticketId: 'T000001', hoursTotal: null }),
      metric({ ticketId: 'T000002', hoursTotal: 5 }),
    ];
    const kpis = aggregateDora(rows, { windowDays: 7 });
    expect(kpis.leadTimeHoursAvg).toBe(5);
  });

  it('meldet CFR nur mit Delivery-Basis (keine Division durch 0)', () => {
    expect(aggregateDora([], { windowDays: 7, bugCount: 2 }).changeFailureRate).toBeNull();
    expect(aggregateDora([metric({})], { windowDays: 7, bugCount: 1 }).changeFailureRate).toBe(1);
  });
});

describe('formatKpiTile', () => {
  it('formatiert Werte mit Nachkommastellen und Suffix', () => {
    expect(formatKpiTile(2.456, { decimals: 2, suffix: 'h' })).toBe('2.46h');
    expect(formatKpiTile(3, { decimals: 1, suffix: '/w' })).toBe('3.0/w');
  });

  it('liefert fuer null/NaN den expliziten Leerzustand statt einer Platzhalterzahl', () => {
    expect(formatKpiTile(null)).toBe('—');
    expect(formatKpiTile(NaN)).toBe('—');
    expect(formatKpiTile(null, { fallback: 'n. a.' })).toBe('n. a.');
  });

  it('formatiert 0 korrekt (kein Leerzustand fuer echte Nullen)', () => {
    expect(formatKpiTile(0, { decimals: 1 })).toBe('0.0');
  });
});
