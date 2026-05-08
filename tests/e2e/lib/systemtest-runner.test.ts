// tests/e2e/lib/systemtest-runner.test.ts
//
// Unit test for deriveOptionsFromSeed — pure function, no browser, no real
// seed import. Picked up by the playwright.config.ts `unit` project.

import { test, expect } from '@playwright/test';
import { deriveOptionsFromSeed, computeComplianceScore, buildOutcomeFile } from './systemtest-runner';

test.describe('deriveOptionsFromSeed', () => {
  test('marks every step with non-empty agent_notes as teilweise', () => {
    const synthetic = {
      title: 'Synthetic',
      description: '',
      instructions: '',
      steps: [
        { question_text: 'q1', expected_result: 'r1', test_function_url: '/', test_role: 'admin' as const },
        { question_text: 'q2', expected_result: 'r2', test_function_url: '/', test_role: 'admin' as const, agent_notes: 'needs human' },
        { question_text: 'q3', expected_result: 'r3', test_function_url: '/', test_role: 'admin' as const },
        { question_text: 'q4', expected_result: 'r4', test_function_url: '/', test_role: 'user'  as const, agent_notes: 'second browser' },
      ],
    };
    expect(deriveOptionsFromSeed(synthetic)).toEqual({ 2: 'teilweise', 4: 'teilweise' });
  });

  test('returns empty object when no step has agent_notes', () => {
    const synthetic = {
      title: 'Synthetic',
      description: '',
      instructions: '',
      steps: [
        { question_text: 'q1', expected_result: 'r1', test_function_url: '/', test_role: 'admin' as const },
        { question_text: 'q2', expected_result: 'r2', test_function_url: '/', test_role: 'admin' as const },
      ],
    };
    expect(deriveOptionsFromSeed(synthetic)).toEqual({});
  });

  test('treats empty-string agent_notes as not requiring override', () => {
    const synthetic = {
      title: 'Synthetic',
      description: '',
      instructions: '',
      steps: [
        { question_text: 'q1', expected_result: 'r1', test_function_url: '/', test_role: 'admin' as const, agent_notes: '' },
      ],
    };
    expect(deriveOptionsFromSeed(synthetic)).toEqual({});
  });
});

test.describe('computeComplianceScore', () => {
  test('all erfüllt → 1.0', () => {
    const steps = [
      { position: 1, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'erfüllt' as const, notes: '' },
      { position: 2, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'erfüllt' as const, notes: '' },
    ];
    expect(computeComplianceScore(steps)).toBeCloseTo(1.0);
  });

  test('all teilweise → 0.5', () => {
    const steps = [
      { position: 1, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'teilweise' as const, notes: '' },
      { position: 2, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'teilweise' as const, notes: '' },
    ];
    expect(computeComplianceScore(steps)).toBeCloseTo(0.5);
  });

  test('mixed: 1 erfüllt + 1 teilweise + 1 nicht_erfüllt → (1 + 0.5) / 3', () => {
    const steps = [
      { position: 1, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'erfüllt'       as const, notes: '' },
      { position: 2, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'teilweise'     as const, notes: '' },
      { position: 3, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'nicht_erfüllt' as const, notes: '' },
    ];
    expect(computeComplianceScore(steps)).toBeCloseTo(0.5);
  });

  test('empty steps → 0', () => {
    expect(computeComplianceScore([])).toBe(0);
  });
});

test.describe('buildOutcomeFile', () => {
  test('maps recorded options and req_ids from template', () => {
    const template = {
      title: 'System-Test 99: Synthetic',
      description: '',
      instructions: '',
      steps: [
        { question_text: 'q1', expected_result: '', test_function_url: '/', test_role: 'admin' as const, req_ids: ['X-01'] },
        { question_text: 'q2', expected_result: '', test_function_url: '/', test_role: 'admin' as const },
      ],
    };
    const result = {
      templateId: 'id-99',
      templateTitle: 'System-Test 99: Synthetic',
      assignmentId: 'a-1',
      submitted: true,
      steps: [
        { position: 1, questionText: 'q1', testRole: 'admin' as const, testFunctionUrl: '/', recorded: 'erfüllt' as const,  notes: '' },
        { position: 2, questionText: 'q2', testRole: 'admin' as const, testFunctionUrl: '/', recorded: 'teilweise' as const, notes: '' },
      ],
    };
    const outcome = buildOutcomeFile(result, 99, template, 'dev');
    expect(outcome.templateNumber).toBe(99);
    expect(outcome.env).toBe('dev');
    expect(outcome.submitted).toBe(true);
    expect(outcome.complianceScore).toBeCloseTo(0.75);        // (1 + 0.5) / 2
    expect(outcome.steps[0].reqIds).toEqual(['X-01']);
    expect(outcome.steps[1].reqIds).toEqual([]);
  });
});
