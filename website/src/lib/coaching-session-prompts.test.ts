import { describe, it, expect } from 'vitest';
import {
  STEP_DEFINITIONS,
  getStepDef,
  getBeat,
  isKiPromptBeat,
  buildUserPrompt,
  type Phase,
  type KiPromptBeat,
} from './coaching-session-prompts';
import {
  BASE_SYSTEM,
  TB_TEUFELSKREISLAUF,
  TB_AUSBALANCIERUNGSPROBLEME,
  TB_KOMPLEMENTAERKRAEFTE,
  TB_ERFOLGSFAKTOREN,
} from './coaching-textbausteine';

describe('STEP_DEFINITIONS (beat model)', () => {
  it('contains exactly 10 sequential steps covering all 4 phases', () => {
    expect(STEP_DEFINITIONS).toHaveLength(10);
    const phases = new Set(STEP_DEFINITIONS.map((s) => s.phase));
    expect(phases).toEqual(new Set<Phase>(['problem_ziel', 'analyse', 'loesung', 'umsetzung']));
    expect(STEP_DEFINITIONS.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('every step has a non-empty beats sequence with at least one ki_prompt beat', () => {
    for (const s of STEP_DEFINITIONS) {
      expect(s.beats.length).toBeGreaterThan(0);
      expect(s.beats.some((b) => b.kind === 'ki_prompt')).toBe(true);
    }
  });

  it('every ki_prompt beat has non-empty systemPrompt and userTemplate', () => {
    for (const s of STEP_DEFINITIONS) {
      for (const b of s.beats) {
        if (b.kind === 'ki_prompt') {
          expect(b.systemPrompt.length).toBeGreaterThan(0);
          expect(b.userTemplate.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('capture keys are unique within each step', () => {
    for (const s of STEP_DEFINITIONS) {
      const keys: string[] = [];
      for (const b of s.beats) {
        if (b.kind === 'instruction' && b.capture) {
          keys.push(b.capture.key);
        }
      }
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('every step has a non-empty description', () => {
    for (const s of STEP_DEFINITIONS) {
      expect(s.description.length).toBeGreaterThan(10);
    }
  });
});

describe('Textbaustein embedding', () => {
  function getKiSystemPrompt(stepNumber: number): string {
    const step = getStepDef(stepNumber);
    const kiBeat = step.beats.find((b) => b.kind === 'ki_prompt');
    if (!kiBeat || kiBeat.kind !== 'ki_prompt') throw new Error(`No ki_prompt beat in step ${stepNumber}`);
    return kiBeat.systemPrompt;
  }

  it('step 5 (Teufelskreislauf) embeds TB_TEUFELSKREISLAUF', () => {
    const sp = getKiSystemPrompt(5);
    expect(sp).toContain('Teufelskreislauf');
    expect(sp).toContain(TB_TEUFELSKREISLAUF);
  });

  it('step 6 (Ausbalancierungsprobleme) embeds TB_AUSBALANCIERUNGSPROBLEME', () => {
    const sp = getKiSystemPrompt(6);
    expect(sp).toContain('Ausbalancierungsproblem');
    expect(sp).toContain(TB_AUSBALANCIERUNGSPROBLEME);
  });

  it('step 7 (Komplementärkräfte) embeds TB_KOMPLEMENTAERKRAEFTE', () => {
    const sp = getKiSystemPrompt(7);
    expect(sp).toContain('Komplementärkräfte');
    expect(sp).toContain(TB_KOMPLEMENTAERKRAEFTE);
  });

  it('step 10 (Erfolgsfaktoren) embeds both TB_ERFOLGSFAKTOREN and TB_KOMPLEMENTAERKRAEFTE', () => {
    const sp = getKiSystemPrompt(10);
    expect(sp).toContain(TB_ERFOLGSFAKTOREN);
    expect(sp).toContain(TB_KOMPLEMENTAERKRAEFTE);
  });
});

describe('getBeat / isKiPromptBeat', () => {
  it('getBeat returns the correct beat for a valid (step, index) pair', () => {
    const beat0 = getBeat(1, 0); // first beat of step 1: instruction
    expect(beat0.kind).toBe('instruction');
    expect((beat0 as { kind: 'instruction'; regie: string }).regie).toContain('Begrüße');

    const beat2 = getBeat(1, 2); // third beat of step 1: ki_prompt
    expect(beat2.kind).toBe('ki_prompt');
  });

  it('isKiPromptBeat distinguishes instruction from ki_prompt beats', () => {
    expect(isKiPromptBeat(getBeat(1, 0))).toBe(false); // instruction
    expect(isKiPromptBeat(getBeat(1, 2))).toBe(true);  // ki_prompt
  });
});

describe('buildUserPrompt', () => {
  it('resolves {key} placeholders from inputs', () => {
    const beat = getBeat(2, 2) as KiPromptBeat; // step 2, ki_prompt with {capturedFrom:0} and {capturedFrom:1}
    // Create a beat that has simple {key} in its template
    const testBeat: KiPromptBeat = {
      kind: 'ki_prompt',
      inputs: [{ key: 'feedback', label: 'Feedback', required: true }],
      systemPrompt: BASE_SYSTEM,
      userTemplate: 'Coachee sagt: {feedback}',
    };
    const out = buildUserPrompt(testBeat, { feedback: 'Mir geht es gut' });
    expect(out).toBe('Coachee sagt: Mir geht es gut');
  });

  it('resolves {capturedFrom:INDEX} placeholders from priorCaptures', () => {
    const testBeat: KiPromptBeat = {
      kind: 'ki_prompt',
      inputs: [],
      systemPrompt: BASE_SYSTEM,
      userTemplate: 'Erzählung: {capturedFrom:0}\nReaktion: {capturedFrom:1}',
    };
    const out = buildUserPrompt(testBeat, {}, { 0: 'Ist-Zustand: Stress', 1: 'Reaktion: Zustimmung' });
    expect(out).toBe('Erzählung: Ist-Zustand: Stress\nReaktion: Reaktion: Zustimmung');
  });

  it('uses em-dash fallback for missing placeholders', () => {
    const testBeat: KiPromptBeat = {
      kind: 'ki_prompt',
      inputs: [{ key: 'fehlt', label: 'Fehlt', required: true }],
      systemPrompt: BASE_SYSTEM,
      userTemplate: 'Eingabe: {fehlt}',
    };
    const out = buildUserPrompt(testBeat, {});
    expect(out).toContain('—');
  });

  it('uses BASE_SYSTEM as the system prompt base', () => {
    const step1KiBeat = getBeat(1, 2) as KiPromptBeat;
    expect(step1KiBeat.systemPrompt).toBe(BASE_SYSTEM);
  });
});
