// Öffentliche Fassade des Coaching-Beat-Modells: Typen + STEP_DEFINITIONS (aus
// coaching-session-beats) plus Beat-Helfer. Consumer importieren weiterhin von hier.
export type {
  Phase,
  StepInput,
  InstructionBeat,
  KiPromptBeat,
  Beat,
  StepDefinition,
} from './coaching-session-beats';

import type { StepDefinition, Beat, KiPromptBeat } from './coaching-session-beats';
import { STEP_DEFINITIONS } from './coaching-session-beats';

export { STEP_DEFINITIONS };

export function getStepDef(stepNumber: number): StepDefinition {
  const def = STEP_DEFINITIONS.find((s) => s.stepNumber === stepNumber);
  if (!def) throw new Error(`Step ${stepNumber} not found`);
  return def;
}

export function getBeat(stepNumber: number, beatIndex: number): Beat {
  const beat = getStepDef(stepNumber).beats[beatIndex];
  if (!beat) throw new Error(`Beat ${beatIndex} of step ${stepNumber} not found`);
  return beat;
}

export function isKiPromptBeat(beat: Beat): beat is KiPromptBeat {
  return beat.kind === 'ki_prompt';
}

/**
 * Baut den User-Prompt eines ki_prompt-Beats:
 *  - {capturedFrom:INDEX} → read-only-Einsetzung des captured-Texts (priorCaptures[INDEX]),
 *  - {key} → eigene inputs.
 * capturedFrom zuerst ersetzen (INDEX enthält ':' und wird von \w nicht erfasst — Reihenfolge
 * dennoch explizit, damit keine Teilstrings kollidieren).
 */
export function buildUserPrompt(
  beat: KiPromptBeat,
  inputs: Record<string, string>,
  priorCaptures: Record<number, string> = {},
): string {
  return beat.userTemplate
    .replace(/\{capturedFrom:(\d+)\}/g, (_m, idx) => priorCaptures[Number(idx)] ?? '—')
    .replace(/\{(\w+)\}/g, (_m, key) => inputs[key] ?? '—');
}
