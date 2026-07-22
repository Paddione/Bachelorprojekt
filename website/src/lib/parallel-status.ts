// website/src/lib/parallel-status.ts
// Pure, DB-free derivation logic for the factory parallel-status panel.
// Time is passed in as an ISO string — no Date.now() in the core so the
// derivations stay deterministic and unit-testable (P3 vitest). This module
// is the frozen contract the endpoint (P1) and the tests (P3) share.

/** Raw aggregate row over tickets.tickets (node-postgres may hand back strings). */
export interface ParallelStatusRow {
  gang_tickets: number | string;
  slots_claimed: number | string;
}

/** Shape returned by GET /api/factory/parallel-status. */
export interface ParallelStatus {
  gangTickets: number;
  slotsClaimed: number;
  slotsPerBrand: number;
  nextTickAt: string | null;
}

/**
 * Map the raw aggregate row + config + derived nextTickAt into the wire shape.
 * COUNT/SUM arrive from pg as strings — Number() normalises them.
 */
export function deriveParallelStatus(
  row: ParallelStatusRow | undefined,
  slotsPerBrand: number,
  nextTickAt: string | null,
): ParallelStatus {
  return {
    gangTickets: Number(row?.gang_tickets ?? 0),
    slotsClaimed: Number(row?.slots_claimed ?? 0),
    slotsPerBrand,
    nextTickAt,
  };
}

/**
 * Next scheduled tick timestamp (ISO). If lastTickAt is missing/unparseable,
 * fall back to now + intervalSec. `nowISO` is injected for testability.
 */
export function deriveNextTickAt(
  lastTickAt: string | null,
  intervalSec: number,
  nowISO: string,
): string {
  const base = lastTickAt ? new Date(lastTickAt) : null;
  const nowMs = new Date(nowISO).getTime();
  const anchorMs = base && !Number.isNaN(base.getTime()) ? base.getTime() : nowMs;
  return new Date(anchorMs + intervalSec * 1000).toISOString();
}

/**
 * Remaining whole seconds until nextTickAt relative to `nowISO`, clamped to 0 so
 * a due/overdue tick yields 0 (UI renders "Tick fällig" + auto-refetch at 0).
 * Returns 0 for a null/unparseable nextTickAt. `nowISO` injected for testability.
 */
export function deriveCountdownSec(nextTickAt: string | null, nowISO: string): number {
  if (!nextTickAt) return 0;
  const target = new Date(nextTickAt);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.max(0, Math.floor((target.getTime() - new Date(nowISO).getTime()) / 1000));
}
