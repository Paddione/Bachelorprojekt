// Pure DORA metric computation (T001092). No DB import — Vitest-testable.
// Reuses calcDurationH from delivery-metrics. The API route (api/admin/dora-metrics.ts)
// supplies the rows from a single query over closed tickets + pr_events.
import { calcDurationH } from './delivery-metrics';

export interface DoraDeliveryRow {
  ticketId: string;
  type: string;                 // 'feature' | 'bug' | …
  driver: 'factory' | 'devflow' | null;
  createdAt: string | null;
  mergedAt: string | null;
  prNumber: number | null;
  reverted: boolean;            // pr_events.status = 'reverted'
}

export interface DoraMetrics {
  window: string;
  deploymentFrequency: { merges: number; perWeek: number };
  leadTimeHours: { median: number | null; mean: number | null };
  changeFailureRate: { rate: number | null; reverts: number; bugs: number; merges: number; isProxy: true };
  mttrHours: { median: number | null; closedBugs: number };
  driverBreakdown: { factory: number; devflow: number };
}

export function median(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

export function mean(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeDora(
  rows: DoraDeliveryRow[],
  bugRows: DoraDeliveryRow[],
  windowDays: number,
  windowLabel: string,
): DoraMetrics {
  const merges = rows.length;
  const weeks = windowDays === 0 ? 1 : Math.max(1, windowDays / 7);
  const perWeek = merges > 0 ? Math.round((merges / weeks) * 10) / 10 : 0;

  const leadTimes = rows.map((r) => calcDurationH(r.createdAt, r.mergedAt));
  const reverts = rows.filter((r) => r.reverted).length;
  const bugs = bugRows.length;
  const rate = merges > 0 ? (reverts + bugs) / merges : null;

  // MTTR: median bug recovery time over type='bug' tickets only.
  // Uses mergedAt − createdAt of each closed bug ticket.
  // The fixes Self-Link (kind='fixes') is used only as PR-attachment — NOT as a
  // "behebt-Bug"-signal. Bug rows are supplied separately by the API route.
  const recovery = bugRows.map((b) => calcDurationH(b.createdAt, b.mergedAt));

  const driverBreakdown = { factory: 0, devflow: 0 };
  for (const r of rows) {
    if (r.driver === 'devflow') driverBreakdown.devflow += 1;
    else driverBreakdown.factory += 1; // null driver counts as factory (legacy/manual)
  }

  return {
    window: windowLabel,
    deploymentFrequency: { merges, perWeek },
    leadTimeHours: { median: median(leadTimes), mean: mean(leadTimes) },
    changeFailureRate: { rate, reverts, bugs, merges, isProxy: true },
    mttrHours: { median: median(recovery), closedBugs: bugRows.length },
    driverBreakdown,
  };
}
