// website/src/lib/tickets/lastenheft.ts
//
// Pure helpers for the Pflichtenheft → Lastenheft requirements-lock feature.
// No imports → no import cycles (S2). The requirements live in the
// tickets.requirements_list TEXT[] column; the lock state lives in the existing
// `readiness` JSONB under `lastenheft_locked`. The "Pflichtenheft" (draft) vs
// "Lastenheft" (locked, AI-ready) distinction is derived purely from that flag.

export const LASTENHEFT_LOCK_KEY = 'lastenheft_locked';

/** Statuses from which locking forward-transitions a ticket into the autopilot lane. */
export const LOCK_FORWARD_FROM = ['triage', 'planning', 'plan_staged'] as const;

/** Trim each line and drop empties — the canonical requirement list. */
export function normalizeRequirements(
  list: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  if (!list) return [];
  return list.map((s) => (s ?? '').trim()).filter((s) => s.length > 0);
}

/** A Lastenheft may only be locked with at least one non-empty requirement. */
export function canLock(
  list: readonly (string | null | undefined)[] | null | undefined,
): boolean {
  return normalizeRequirements(list).length >= 1;
}

/** Forward-only status transition on lock; never regresses an in-flight ticket. */
export function nextStatusOnLock(current: string): string {
  return (LOCK_FORWARD_FROM as readonly string[]).includes(current) ? 'backlog' : current;
}

/** Derived UI label for the requirements list. */
export function requirementsLabel(locked: boolean): 'Lastenheft' | 'Pflichtenheft' {
  return locked ? 'Lastenheft' : 'Pflichtenheft';
}

/** Read the lock flag out of a readiness JSONB object (fail-closed). */
export function isLastenheftLocked(
  readiness: Record<string, unknown> | null | undefined,
): boolean {
  return readiness?.[LASTENHEFT_LOCK_KEY] === true;
}
