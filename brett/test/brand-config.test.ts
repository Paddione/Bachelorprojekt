// brett/test/brand-config.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { resolveBrand } from '../src/server/index';

test('resolveBrand defaults to mentolder', () => {
  assert.strictEqual(resolveBrand({}), 'mentolder');
});
test('resolveBrand reads BRETT_BRAND', () => {
  assert.strictEqual(resolveBrand({ BRETT_BRAND: 'korczewski' }), 'korczewski');
});
