// tests/e2e/lib/systemtest-runner.test.ts
//
// Unit test for deriveOptionsFromSeed — pure function, no browser, no real
// seed import. Picked up by the playwright.config.ts `unit` project.

import { test, expect } from '@playwright/test';
import { deriveOptionsFromSeed } from './systemtest-runner';

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
