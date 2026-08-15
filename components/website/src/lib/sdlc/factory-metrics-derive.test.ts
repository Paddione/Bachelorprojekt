// [T003459] Rechenregeln der Insights-Kennzahlen.
// Prüfmodus: Rückgabewerte der Funktionen, keine Quelltext-Muster.
import { describe, it, expect } from 'vitest';
import { deriveMetrics, windowRows, formatCycleTime } from './factory-metrics-derive';
import type { FactoryMetricRow } from '../stores/factory-floor-store';

function row(day: string, shipped: number, cycle: number | null, esc = 0): FactoryMetricRow {
  return { day, features_shipped: shipped, avg_cycle_time_h: cycle, escalations: esc, total_features: shipped };
}

describe('windowRows', () => {
  it('nimmt die neuesten Tage, unabhängig von der Eingabereihenfolge', () => {
    const rows = [row('2026-08-01', 1, 2), row('2026-08-05', 1, 2), row('2026-08-03', 1, 2)];
    expect(windowRows(rows, 2).map((r) => r.day)).toEqual(['2026-08-05', '2026-08-03']);
  });

  it('liefert bei weniger Zeilen als Fenstergröße alles zurück', () => {
    expect(windowRows([row('2026-08-01', 1, 2)], 7)).toHaveLength(1);
  });

  it('liefert für ein Fenster von 0 Tagen nichts', () => {
    expect(windowRows([row('2026-08-01', 1, 2)], 0)).toEqual([]);
  });
});

describe('deriveMetrics', () => {
  it('summiert Auslieferungen und Eskalationen im Fenster', () => {
    const rows = [row('2026-08-05', 3, 10, 1), row('2026-08-04', 2, 10, 2)];
    const d = deriveMetrics(rows, 7);
    expect(d.shipped).toBe(5);
    expect(d.escalations).toBe(3);
    expect(d.daysCovered).toBe(2);
  });

  it('zählt nur Tage innerhalb des Fensters', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row(`2026-08-${String(30 - i).padStart(2, '0')}`, 1, 5),
    );
    expect(deriveMetrics(rows, 7).shipped).toBe(7);
  });

  // Der eigentliche Kern: gewichtet, nicht als Mittel der Tagesmittel.
  it('gewichtet die Zykluszeit nach der Tagesmenge', () => {
    // Tag A: 1 Ticket à 100 h, Tag B: 9 Tickets à 10 h.
    // Ungewichtet wären das (100+10)/2 = 55 h — das Mittel der Tagesmittel.
    // Gewichtet: (100*1 + 10*9) / 10 = 19 h. Der Ausreißertag darf die Woche
    // nicht dominieren.
    const rows = [row('2026-08-05', 1, 100), row('2026-08-04', 9, 10)];
    expect(deriveMetrics(rows, 7).avgCycleTimeH).toBe(19);
  });

  it('lässt Tage ohne Auslieferung den Schnitt nicht gegen null ziehen', () => {
    // Der ruhige Tag trägt keine Zykluszeit bei und darf auch nicht im Nenner
    // stehen — sonst meldete ein Wochenende eine Verbesserung.
    const rows = [row('2026-08-05', 4, 12), row('2026-08-04', 0, null)];
    expect(deriveMetrics(rows, 7).avgCycleTimeH).toBe(12);
  });

  it('liefert null statt 0, wenn im Fenster nichts ausgeliefert wurde', () => {
    // Positiv-Anker: mit Daten kommt eine Zahl heraus …
    expect(deriveMetrics([row('2026-08-05', 2, 8)], 7).avgCycleTimeH).toBe(8);
    // … ohne Daten aber null — 0 h wäre eine Aussage, die niemand gemessen hat.
    expect(deriveMetrics([row('2026-08-05', 0, null)], 7).avgCycleTimeH).toBeNull();
    expect(deriveMetrics([], 7).avgCycleTimeH).toBeNull();
  });

  it('übersteht fehlende Felder ohne NaN', () => {
    const broken = [{ day: '2026-08-05' } as unknown as FactoryMetricRow];
    const d = deriveMetrics(broken, 7);
    expect(d.shipped).toBe(0);
    expect(d.escalations).toBe(0);
    expect(d.avgCycleTimeH).toBeNull();
  });
});

describe('formatCycleTime', () => {
  it('zeigt Stunden unter einem Tag', () => {
    expect(formatCycleTime(3.25)).toBe('3.3 h');
  });

  it('rechnet ab 24 h in Tage um', () => {
    expect(formatCycleTime(36)).toBe('1.5 d');
  });

  it('zeigt für fehlende Werte den Platzhalter', () => {
    expect(formatCycleTime(null)).toBe('—');
    expect(formatCycleTime(NaN)).toBe('—');
  });
});
