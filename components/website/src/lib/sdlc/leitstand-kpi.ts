// leitstand-kpi.ts — pure DORA-Aggregation fuer das Leitstand-KPI-Raster
// (T008016/E4, SSOT sdlc-cockpit.md "DORA KPI Idle Grid").
//
// Reine Funktionen ohne I/O: Typen aus delivery-metrics.ts, die DORA-Werte
// werden aus `summarize`/`calcDurationH` dort abgeleitet statt dupliziert.
// Deterministisch und in vitest gegen feste Fixtures geprueft.

import type { DeliveryMetric } from '../delivery-metrics.ts';
import { summarize } from '../delivery-metrics.ts';

export interface DoraKpis {
  /** Deployment-Frequenz: Deliveries pro Woche im Fenster. */
  deploymentFrequencyPerWeek: number;
  /** Lead Time: durchschnittliche Gesamtstunden Ticket -> Live. */
  leadTimeHoursAvg: number | null;
  /** Change Failure Rate: Bugs / Deliveries im Fenster (0..1). */
  changeFailureRate: number | null;
  deliveries: number;
  weeks: number;
  mishapCount: number;
}

export interface AggregateDoraOptions {
  /** Betrachtungsfenster in Tagen (0 = "all" wie bei delivery-metrics.ts). */
  windowDays?: number;
  /** Anzahl fertiggestellter Bug-/Fix-Tickets im Fenster. */
  bugCount?: number;
}

export function aggregateDora(
  rows: DeliveryMetric[],
  opts: AggregateDoraOptions = {},
): DoraKpis {
  const windowDays = opts.windowDays ?? 7;
  const bugCount = opts.bugCount ?? 0;
  // summarize liefert throughputPerWeek (= Frequenz), avgHoursTotal
  // (= Lead Time) und mishapRate (= CFR) in derselben Fenster-Logik.
  const summary = summarize(rows, bugCount, windowDays, {});
  return {
    deploymentFrequencyPerWeek: summary.throughputPerWeek,
    leadTimeHoursAvg: summary.avgHoursTotal,
    changeFailureRate: summary.mishapRate,
    deliveries: summary.deliveries,
    weeks: summary.weeks,
    mishapCount: summary.mishapCount,
  };
}

export interface FormatKpiTileOptions {
  decimals?: number;
  suffix?: string;
  /** Expliziter Leerzustand statt Platzhalterzahl (D12/D13). */
  fallback?: string;
}

/** Formatiert einen KPI-Wert fuer eine Kachel; null/NaN -> Leerzustand. */
export function formatKpiTile(
  value: number | null,
  opts: FormatKpiTileOptions = {},
): string {
  if (value == null || Number.isNaN(value)) return opts.fallback ?? '—';
  const decimals = opts.decimals ?? 1;
  return `${value.toFixed(decimals)}${opts.suffix ?? ''}`;
}
