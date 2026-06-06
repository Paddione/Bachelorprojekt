// brett/src/client/lobby-coaching.ts — Phase D / D10
//
// Pure helper for the lobby "Coaching-Ablauf" editor. No three.js/DOM imports →
// node/tsx-importable and unit-testable. The lobby UI calls this to turn the
// free-text editor into an `admin_coaching_steps_set` payload (existing server
// path); empty input yields null so nothing is sent.

export interface CoachingStepsPayload {
  steps: string[];
  index: number;
}

/**
 * Parse a newline-separated step list. Trims each line and drops blank lines.
 * Returns `null` for empty/whitespace-only input (caller sends nothing).
 */
export function buildCoachingStepsPayload(raw: string): CoachingStepsPayload | null {
  const steps = (raw ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (steps.length === 0) return null;
  return { steps, index: 0 };
}
