// [T003459] Ableitung der Insights-Kennzahlen aus den Tageszeilen der View
// `tickets.v_factory_metrics`. Bewusst frei von DOM und fetch, damit die
// Rechenregeln einzeln pruefbar sind — die Komponenten reichen nur durch.
import type { FactoryMetricRow } from '../stores/factory-floor-store';

export interface DerivedMetrics {
  /** Summe der ausgelieferten Features im Fenster. */
  shipped: number;
  /** Nach Tagesmenge gewichtete Zykluszeit in Stunden, null wenn nichts lief. */
  avgCycleTimeH: number | null;
  /** Eskalationen im Fenster. */
  escalations: number;
  /** Zahl der Tage, die tatsaechlich Daten beigesteuert haben. */
  daysCovered: number;
}

/**
 * Die Zeilen kommen laut `listFactoryMetrics()` neuester Tag zuerst. Darauf
 * verlassen wir uns NICHT: bei einer Sortieraenderung in der View waere sonst
 * still das falsche Fenster ausgewertet, ohne dass ein Test anschlaegt. Deshalb
 * wird hier explizit nach `day` absteigend sortiert.
 */
export function windowRows(rows: FactoryMetricRow[], days: number): FactoryMetricRow[] {
  return [...rows]
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .slice(0, Math.max(0, days));
}

export function deriveMetrics(rows: FactoryMetricRow[], days = 7): DerivedMetrics {
  const win = windowRows(rows, days);

  const shipped = win.reduce((s, r) => s + (r.features_shipped ?? 0), 0);
  const escalations = win.reduce((s, r) => s + (r.escalations ?? 0), 0);

  // Gewichtet nach features_shipped, nicht als Mittel der Tagesmittel: ein Tag
  // mit einem einzigen Ticket wuerde sonst genauso schwer wiegen wie ein Tag
  // mit zwanzig, und ein einzelner Ausreisser koennte die Woche dominieren.
  // Tage ohne Auslieferung tragen keine Zykluszeit bei und fallen deshalb aus
  // Zaehler UND Nenner — sie duerfen den Schnitt nicht gegen null ziehen.
  let weighted = 0;
  let weight = 0;
  for (const r of win) {
    if (r.avg_cycle_time_h == null) continue;
    const n = r.features_shipped ?? 0;
    if (n <= 0) continue;
    weighted += r.avg_cycle_time_h * n;
    weight += n;
  }

  return {
    shipped,
    avgCycleTimeH: weight > 0 ? weighted / weight : null,
    escalations,
    daysCovered: win.length,
  };
}

/** Stunden menschenlesbar: unter 24 h in Stunden, darueber in Tagen. */
export function formatCycleTime(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return '—';
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}
