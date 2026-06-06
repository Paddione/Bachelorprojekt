'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { buildConfig } = require('../server.js');

test('buildConfig: returns only non-mode config (brand resolved separately)', () => {
  assert.deepStrictEqual(buildConfig({}), {});
});

test('buildConfig: ignores any BRETT_DEFAULT_MODE env (mode concept removed)', () => {
  assert.deepStrictEqual(buildConfig({ BRETT_DEFAULT_MODE: 'mayhem' }), {});
});
