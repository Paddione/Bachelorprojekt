import { test } from 'node:test';
import assert from 'node:assert';
import { validateTemplateName, buildSavePayload } from '../src/client/ui/board-template-save';

test('validateTemplateName: empty string returns error', () => {
  assert.notStrictEqual(validateTemplateName(''), null);
});

test('validateTemplateName: string over 100 chars returns error', () => {
  assert.notStrictEqual(validateTemplateName('a'.repeat(101)), null);
});

test('validateTemplateName: valid name returns null', () => {
  assert.strictEqual(validateTemplateName('Familiensystem'), null);
});

test('validateTemplateName: whitespace-only returns error', () => {
  assert.notStrictEqual(validateTemplateName('   '), null);
});

test('buildSavePayload returns correct object', () => {
  const figures = [{ id: 'f1', label: 'A', x: 0, z: 0, facingY: 0 }];
  const result = buildSavePayload('  Test  ', '  Familie  ', figures) as any;
  assert.strictEqual(result.name, 'Test');
  assert.strictEqual(result.category, 'Familie');
  assert.deepStrictEqual(result.state.figures, figures);
});

test('buildSavePayload: empty category becomes null', () => {
  const result = buildSavePayload('Name', '', []) as any;
  assert.strictEqual(result.category, null);
});
