// brett/test/server-config.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { buildConfig } from '../src/server/index';

test('buildConfig: returns only non-mode config (brand resolved separately)', () => {
  assert.deepStrictEqual(buildConfig({}), {});
});

test('buildConfig: ignores any BRETT_DEFAULT_MODE env (mode concept removed)', () => {
  assert.deepStrictEqual(buildConfig({ BRETT_DEFAULT_MODE: 'mayhem' }), {});
});
