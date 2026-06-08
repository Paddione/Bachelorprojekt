import { test } from 'node:test';
import assert from 'node:assert';
import { stepsToTextarea, shouldPrefill, DEFAULT_COACHING_STEPS } from '../src/client/lobby-template-fill';

test('stepsToTextarea joins steps with newlines', () => {
  assert.strictEqual(stepsToTextarea(['a', 'b', 'c']), 'a\nb\nc');
  assert.strictEqual(stepsToTextarea([]), '');
});

test('shouldPrefill is true only when the textarea is empty/whitespace', () => {
  assert.strictEqual(shouldPrefill(''), true);
  assert.strictEqual(shouldPrefill('   \n  '), true);
  assert.strictEqual(shouldPrefill('existing'), false);
});

test('DEFAULT_COACHING_STEPS has the four standard phases', () => {
  assert.deepStrictEqual(DEFAULT_COACHING_STEPS, ['Aufstellen', 'Wahrnehmen', 'Verändern', 'Abschluss']);
  assert.strictEqual(stepsToTextarea(DEFAULT_COACHING_STEPS), 'Aufstellen\nWahrnehmen\nVerändern\nAbschluss');
});
