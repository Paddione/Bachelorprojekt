'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { buildConfig } = require('../server.js');

test('buildConfig: defaults to coaching when env var unset', () => {
  assert.deepStrictEqual(buildConfig({}), {
    defaultMode: 'coaching',
    availableModes: ['coaching'],
  });
});

test('buildConfig: coaching mode exposes only coaching', () => {
  assert.deepStrictEqual(buildConfig({ BRETT_DEFAULT_MODE: 'coaching' }), {
    defaultMode: 'coaching',
    availableModes: ['coaching'],
  });
});

test('buildConfig: mayhem mode exposes both', () => {
  assert.deepStrictEqual(buildConfig({ BRETT_DEFAULT_MODE: 'mayhem' }), {
    defaultMode: 'mayhem',
    availableModes: ['coaching', 'mayhem'],
  });
});

test('buildConfig: unknown value falls back to coaching', () => {
  assert.deepStrictEqual(buildConfig({ BRETT_DEFAULT_MODE: 'bogus' }), {
    defaultMode: 'coaching',
    availableModes: ['coaching'],
  });
});
