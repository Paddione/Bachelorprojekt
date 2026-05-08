// website/src/lib/systemtest/feature-flag.test.ts
//
// Pure-unit tests for the SYSTEMTEST_LOOP_ENABLED kill-switch. No DB, no
// Keycloak, no fixtures — just process.env mutation around isolated calls.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isSystemtestLoopEnabled } from './feature-flag';

describe('isSystemtestLoopEnabled', () => {
  const original = process.env.SYSTEMTEST_LOOP_ENABLED;

  beforeEach(() => {
    delete process.env.SYSTEMTEST_LOOP_ENABLED;
  });
  afterEach(() => {
    if (original === undefined) {
      delete process.env.SYSTEMTEST_LOOP_ENABLED;
    } else {
      process.env.SYSTEMTEST_LOOP_ENABLED = original;
    }
  });

  it('returns false when the env var is unset', () => {
    expect(isSystemtestLoopEnabled()).toBe(false);
  });

  it('returns true only for the literal string "true"', () => {
    process.env.SYSTEMTEST_LOOP_ENABLED = 'true';
    expect(isSystemtestLoopEnabled()).toBe(true);
  });

  it('returns false for any other truthy-looking string', () => {
    for (const v of ['1', 'TRUE', 'yes', 'on', ' true ', 'enabled']) {
      process.env.SYSTEMTEST_LOOP_ENABLED = v;
      expect(isSystemtestLoopEnabled(), `expected false for ${JSON.stringify(v)}`).toBe(false);
    }
  });

  it('returns false for explicit "false" / "0" / empty', () => {
    for (const v of ['false', '0', '']) {
      process.env.SYSTEMTEST_LOOP_ENABLED = v;
      expect(isSystemtestLoopEnabled(), `expected false for ${JSON.stringify(v)}`).toBe(false);
    }
  });
});
