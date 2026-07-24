import type { SessionStep } from './coaching-session-db';
import type { StepDefinition } from './coaching-session-prompts';

export type ProtocolEntryKind = 'quote' | 'ki';
export interface ProtocolEntry { kind: ProtocolEntryKind; label: string; text: string; }
export interface ProtocolStep { stepNumber: number; stepName: string; phase: string; phaseLabel: string; entries: ProtocolEntry[]; }

export function buildProtocol(steps: SessionStep[], defs: StepDefinition[]): ProtocolStep[] {
  return defs.map((def) => {
    const beatStates = steps.find((s) => s.stepNumber === def.stepNumber)?.beats ?? [];
    const entries: ProtocolEntry[] = [];
    def.beats.forEach((beat, i) => {
      const st = beatStates.find((b) => b.beatIndex === i);
      if (beat.kind === 'instruction' && beat.capture) {
        const text = (st?.captured ?? '').trim();
        if (text) entries.push({ kind: 'quote', label: beat.capture.label, text });
      } else if (beat.kind === 'ki_prompt') {
        const text = (st?.aiResponse ?? '').trim();
        if (text) entries.push({ kind: 'ki', label: beat.regie ?? 'KI-Ergebnis', text });
      }
    });
    return { stepNumber: def.stepNumber, stepName: def.stepName, phase: def.phase, phaseLabel: def.phaseLabel, entries };
  });
}

export function buildExecutiveSummaryInput(protocol: ProtocolStep[]): string {
  return protocol.map((s) => {
    const body = s.entries.length
      ? s.entries.map((e) => (e.kind === 'quote' ? `- ${e.label}: ${e.text}` : `- KI: ${e.text}`)).join('\n')
      : '- (keine protokollierten Beats)';
    return `## Schritt ${s.stepNumber}: ${s.stepName} (${s.phaseLabel})\n${body}`;
  }).join('\n\n');
}
