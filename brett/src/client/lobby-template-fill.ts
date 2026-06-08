// Pure helpers for prefilling the lobby coaching-steps textarea from a selected
// coaching template. No DOM/three imports → node/tsx-importable + unit-testable.

export const DEFAULT_COACHING_STEPS = ['Aufstellen', 'Wahrnehmen', 'Verändern', 'Abschluss'];

export function stepsToTextarea(steps: string[]): string {
  return (steps ?? []).join('\n');
}

/** Only prefill when the coach hasn't typed their own steps yet. */
export function shouldPrefill(currentValue: string): boolean {
  return (currentValue ?? '').trim().length === 0;
}
