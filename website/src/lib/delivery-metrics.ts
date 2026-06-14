export interface DeliveryRow {
  ticket_id: string;
  title: string;
  ticket_created_at: string | null;
  done_at: string | null;
  pr_number: number;
  pr_opened_at: string | null;
  merged_at: string | null;
}

export interface GhWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  run_started_at: string;
  updated_at: string;
  conclusion: string | null;
  html_url: string;
}

export interface DeliveryMetric {
  ticketId: string;
  title: string;
  prNumber: number;
  ticketUrl: string;
  prUrl: string;
  hoursTicketToPrOpen: number | null;
  hoursPrOpenToMerged: number | null;
  hoursMergedToLive: number | null;
  hoursTotal: number | null;
}

export interface DeliverySummary {
  deliveries: number;
  weeks: number;
  throughputPerWeek: number;
  avgHoursTicketToPrOpen: number | null;
  avgHoursPrOpenToMerged: number | null;
  avgHoursMergedToLive: number | null;
  avgHoursTotal: number | null;
  mishapRate: number | null;
  mishapCount: number;
  claudePct: number;
  deepseekPct: number;
  otherPct: number;
}

export function calcDurationH(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  return (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
}

export function toDeliveryMetric(
  row: DeliveryRow,
  deployAt: string | null,
  ghRepo: string,
): DeliveryMetric {
  return {
    ticketId: row.ticket_id,
    title: row.title,
    prNumber: row.pr_number,
    ticketUrl: `/admin/tickets/${row.ticket_id}`,
    prUrl: `https://github.com/${ghRepo}/pull/${row.pr_number}`,
    hoursTicketToPrOpen: calcDurationH(row.ticket_created_at, row.pr_opened_at),
    hoursPrOpenToMerged: calcDurationH(row.pr_opened_at, row.merged_at),
    hoursMergedToLive: calcDurationH(row.merged_at, deployAt),
    hoursTotal: calcDurationH(row.ticket_created_at, deployAt),
  };
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function modelMixPercent(providerCounts: Record<string, number>): {
  claudePct: number;
  deepseekPct: number;
  otherPct: number;
} {
  const total = Object.values(providerCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return { claudePct: 0, deepseekPct: 0, otherPct: 0 };
  const claude = Object.entries(providerCounts)
    .filter(([k]) => k.toLowerCase().startsWith('anthropic'))
    .reduce((s, [, v]) => s + v, 0);
  const deepseek = Object.entries(providerCounts)
    .filter(([k]) => k.toLowerCase().startsWith('deepseek'))
    .reduce((s, [, v]) => s + v, 0);
  const other = total - claude - deepseek;
  return {
    claudePct: Math.round((claude / total) * 100),
    deepseekPct: Math.round((deepseek / total) * 100),
    otherPct: Math.round((other / total) * 100),
  };
}

export function summarize(
  metrics: DeliveryMetric[],
  bugCount: number,
  windowDays: number,
  providerCounts: Record<string, number>,
): DeliverySummary {
  const deliveries = metrics.length;
  const weeks = windowDays === 0 ? 1 : Math.max(1, windowDays / 7);
  const throughputPerWeek = deliveries > 0 ? Math.round((deliveries / weeks) * 10) / 10 : 0;
  const mishapRate = deliveries > 0 ? Math.round((bugCount / deliveries) * 100) / 100 : null;
  const mix = modelMixPercent(providerCounts);

  return {
    deliveries,
    weeks: Math.round(weeks * 10) / 10,
    throughputPerWeek,
    avgHoursTicketToPrOpen: avg(metrics.map((m) => m.hoursTicketToPrOpen)),
    avgHoursPrOpenToMerged: avg(metrics.map((m) => m.hoursPrOpenToMerged)),
    avgHoursMergedToLive: avg(metrics.map((m) => m.hoursMergedToLive)),
    avgHoursTotal: avg(metrics.map((m) => m.hoursTotal)),
    mishapRate,
    mishapCount: bugCount,
    claudePct: mix.claudePct,
    deepseekPct: mix.deepseekPct,
    otherPct: mix.otherPct,
  };
}
