// Reine Bewertung von Health-Zielen (T016657). Keine DB-, keine API-Importe:
// Dashboard, DB-Leser, Snapshot-Fallback und Rescan-Persistenz teilen dieselbe
// Wahrheit für Status und Prozent.
//
// Regeln:
// - Nur endliche Zahlen zählen als Evidenz; fehlt current oder target, ist das
//   Ergebnis unknown/null — weder Null noch erreicht.
// - Ein gespeicherter Status überstimmt die Zahlen nie.
// - Ziel 0 ist ein gültiger Wert.
// - baseline == target und Grenze verletzt → critical / 0 %.
// - Ohne baseline: erfüllt → achieved, sonst die konservative Zwischenbewertung
//   on_track ohne Prozentangabe.

export type GoalDirection = 'lower' | 'higher';
export type GoalComparison = 'le' | 'ge' | 'eq';
export type GoalStatus = 'critical' | 'at_risk' | 'on_track' | 'achieved' | 'unknown';

export interface GoalEvidence {
  current: unknown;
  target: unknown;
  baseline?: unknown;
  /** Vergleich aus einer Messung (Scan); hat Vorrang vor direction. */
  cmp?: GoalComparison;
  /** Richtung aus der Zieldefinition: lower → le, higher → ge. */
  direction?: GoalDirection;
}

export interface GoalEvaluation {
  status: GoalStatus;
  /** Health-Prozent 0–100, null wenn nicht belastbar bestimmbar. */
  percent: number | null;
}

/** Number oder numerischer String → endliche Zahl, sonst null (NaN/Infinity zählen nicht). */
export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function comparisonFor(direction: GoalDirection | undefined): GoalComparison {
  return direction === 'higher' ? 'ge' : 'le';
}

export function isMet(current: number, target: number, cmp: GoalComparison): boolean {
  if (cmp === 'eq') return current === target;
  return cmp === 'le' ? current <= target : current >= target;
}

/** Fortschritt baseline → target in [−∞, 1]; null bei Nullspanne. */
function progressOf(current: number, target: number, baseline: number, cmp: GoalComparison): number | null {
  const range = Math.abs(target - baseline);
  if (range === 0) return null;
  if (cmp === 'eq') return (range - Math.abs(current - target)) / range;
  return cmp === 'le' ? (baseline - current) / range : (current - baseline) / range;
}

export function evaluateGoal(evidence: GoalEvidence): GoalEvaluation {
  const current = toFiniteNumber(evidence.current);
  const target = toFiniteNumber(evidence.target);
  if (current === null || target === null) return { status: 'unknown', percent: null };

  const cmp = evidence.cmp ?? comparisonFor(evidence.direction);
  if (isMet(current, target, cmp)) return { status: 'achieved', percent: 100 };

  const baseline = toFiniteNumber(evidence.baseline);
  if (baseline === null) return { status: 'on_track', percent: null };

  const progress = progressOf(current, target, baseline, cmp);
  if (progress === null) return { status: 'critical', percent: 0 };

  const percent = Math.max(0, Math.min(99, Math.round(progress * 100)));
  if (progress >= 0.8) return { status: 'on_track', percent };
  if (progress >= 0.3) return { status: 'at_risk', percent };
  return { status: progress < 0 ? 'critical' : 'at_risk', percent };
}
