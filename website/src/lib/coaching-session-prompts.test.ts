import { describe, it, expect } from 'vitest';
import {
  STEP_DEFINITIONS,
  getStepDef,
  buildUserPrompt,
  type Phase,
} from './coaching-session-prompts';

describe('STEP_DEFINITIONS', () => {
  it('contains exactly 10 steps', () => {
    expect(STEP_DEFINITIONS).toHaveLength(10);
  });

  it('covers all four phases', () => {
    const phases = new Set(STEP_DEFINITIONS.map((s) => s.phase));
    expect(phases).toEqual(new Set<Phase>(['problem_ziel', 'analyse', 'loesung', 'umsetzung']));
  });

  it('assigns sequential step numbers 1..10', () => {
    expect(STEP_DEFINITIONS.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('every step has at least one required input', () => {
    for (const s of STEP_DEFINITIONS) {
      expect(s.inputs.some((i) => i.required)).toBe(true);
    }
  });

  it('every step has a non-empty systemPrompt and userTemplate', () => {
    for (const s of STEP_DEFINITIONS) {
      expect(s.systemPrompt.length).toBeGreaterThan(0);
      expect(s.userTemplate.length).toBeGreaterThan(0);
    }
  });
});

describe('getStepDef', () => {
  it('returns the matching step for valid step numbers', () => {
    expect(getStepDef(1).stepName).toBe('Erstanamnese');
    expect(getStepDef(5).stepName).toBe('Ressourcenanalyse');
    expect(getStepDef(10).stepName).toBe('Transfersicherung');
  });

  it('throws on unknown step numbers', () => {
    expect(() => getStepDef(0)).toThrow();
    expect(() => getStepDef(11)).toThrow(/Step 11 not found/);
    expect(() => getStepDef(-1)).toThrow();
  });
});

describe('buildUserPrompt', () => {
  it('substitutes tokens with the matching inputs', () => {
    const def = getStepDef(1);
    const out = buildUserPrompt(def, {
      anlass: 'Karrierewechsel',
      vorerfahrung: 'keine',
      situation: 'Ich überlege, die Branche zu wechseln.',
    });
    expect(out).toContain('Anlass: Karrierewechsel');
    expect(out).toContain('Vorerfahrung: keine');
    expect(out).toContain('Aktuelle Situation: Ich überlege, die Branche zu wechseln.');
  });

  it('replaces missing tokens with an em-dash placeholder', () => {
    const def = getStepDef(1);
    const out = buildUserPrompt(def, { anlass: 'Test', situation: 'X' });
    expect(out).toContain('Vorerfahrung: —');
  });

  it('does not crash on an empty inputs object', () => {
    const def = getStepDef(1);
    const out = buildUserPrompt(def, {});
    expect(out).toContain('Anlass: —');
  });
});
