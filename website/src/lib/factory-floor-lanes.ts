// Pure lane mapping + visibility helpers for the Software Factory floor (T001092).
// Extracted from factory-floor.ts to keep that file under its S1 line budget.
// No DB/API imports — pure functions, Vitest-testable.

export interface ShippedItem {
  extId: string;
  title: string;
  doneAt: string | null;
  prNumber: number | null;
}

export interface AwaitingDeployItem {
  extId: string;
  title: string;
  mergedAt: string | null;
  prNumber: number | null;
}

export function mapShippedRow(row: {
  external_id: string;
  title: string;
  done_at: string | null;
  pr_number: number | null;
}): ShippedItem {
  return {
    extId: row.external_id,
    title: row.title,
    doneAt: row.done_at ? new Date(row.done_at).toISOString() : null,
    prNumber: row.pr_number ?? null,
  };
}

export function mapAwaitingRow(row: {
  external_id: string;
  title: string;
  updated_at: string | null;
  pr_number: number | null;
}): AwaitingDeployItem {
  return {
    extId: row.external_id,
    title: row.title,
    mergedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    prNumber: row.pr_number ?? null,
  };
}

// Merge = Abschluss (T001092): the happy path no longer produces awaiting_deploy,
// so this lane is empty in normal operation and is hidden. It only renders when a
// ticket was *manually* left in awaiting_deploy (a held-back special case).
export function isAwaitingDeployLaneVisible(items: AwaitingDeployItem[]): boolean {
  return items.length > 0;
}
