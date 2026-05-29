'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { resolveBrand } = require('../server.js');

test('resolveBrand defaults to mentolder', () => {
  assert.strictEqual(resolveBrand({}), 'mentolder');
});
test('resolveBrand reads BRETT_BRAND', () => {
  assert.strictEqual(resolveBrand({ BRETT_BRAND: 'korczewski' }), 'korczewski');
});
