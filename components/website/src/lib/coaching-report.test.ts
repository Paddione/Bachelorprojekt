import { describe, it, expect } from 'vitest';
import { buildProtocol, buildExecutiveSummaryInput } from './coaching-report';
import { STEP_DEFINITIONS } from './coaching-session-prompts';
import type { SessionStep } from './coaching-session-db';

describe('coaching-report protocol builder (P3)', () => {
  const steps: SessionStep[] = STEP_DEFINITIONS.map((def) => ({
    id: `s${def.stepNumber}`, sessionId: 'sess', stepNumber: def.stepNumber,
    stepName: def.stepName, phase: def.phase, status: 'accepted', generatedAt: null,
    beats: def.beats.map((b, i) => {
      if (b.kind === 'instruction' && b.capture) return { beatIndex: i, captured: `CAP${def.stepNumber}`, status: 'accepted' as const };
      if (b.kind === 'ki_prompt') return { beatIndex: i, aiResponse: `KI${def.stepNumber}`, status: 'accepted' as const };
      return { beatIndex: i, status: 'accepted' as const };
    }),
  }));

  it('executive-summary input includes every one of the 10 steps content', () => {
    const text = buildExecutiveSummaryInput(buildProtocol(steps, STEP_DEFINITIONS));
    for (let n = 1; n <= 10; n++) {
      expect(text).toContain(`Schritt ${n}:`);
      expect(text).toContain(`KI${n}`);
    }
  });

  it('a capture beat becomes a quote entry, a ki_prompt beat a ki entry', () => {
    const protocol = buildProtocol(steps, STEP_DEFINITIONS);
    expect(protocol).toHaveLength(10);
    const step1 = protocol[0];
    expect(step1.entries.some((e) => e.kind === 'quote' && e.text === 'CAP1')).toBe(true);
    expect(step1.entries.some((e) => e.kind === 'ki' && e.text === 'KI1')).toBe(true);
  });
});
