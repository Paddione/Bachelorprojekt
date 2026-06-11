// brett/test/topbar-filter.test.ts — T000607: Figuren-Filter
import { test } from 'node:test';
import assert from 'node:assert';
import { matchesFigureFilter } from '../src/client/ui/topbar-filter';

// ── matchesFigureFilter ──────────────────────────────────────────────────────

test('matchesFigureFilter: empty query matches everything', () => {
  assert.strictEqual(matchesFigureFilter('Anna', ''), true);
  assert.strictEqual(matchesFigureFilter('', ''), true);
  assert.strictEqual(matchesFigureFilter('Bernd', ''), true);
});

test('matchesFigureFilter: case-insensitive substring match', () => {
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'anna'), true);
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'ANNA'), true);
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'müller'), true);
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'Müller'), true);
});

test('matchesFigureFilter: no match returns false', () => {
  assert.strictEqual(matchesFigureFilter('Anna', 'Bernd'), false);
  assert.strictEqual(matchesFigureFilter('', 'x'), false);
});

test('matchesFigureFilter: partial match anywhere in label', () => {
  assert.strictEqual(matchesFigureFilter('Karl-Heinz', 'heinz'), true);
  assert.strictEqual(matchesFigureFilter('Karl-Heinz', 'karl'), true);
  assert.strictEqual(matchesFigureFilter('Karl-Heinz', '-'), true);
});

test('matchesFigureFilter: null/undefined label treated as empty string', () => {
  assert.strictEqual(matchesFigureFilter(null as any, ''), true);
  assert.strictEqual(matchesFigureFilter(undefined as any, ''), true);
  assert.strictEqual(matchesFigureFilter(null as any, 'x'), false);
});
