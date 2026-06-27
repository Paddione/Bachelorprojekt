import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runS5 } from './s5-lockfiles.mjs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');

test('runS5 reports violation when forbidden lockfile exists', () => {
  // website/pnpm-lock.yaml exists in the repo
  const mockGates = {
    s5: {
      rules: [
        {
          path: 'website',
          allowed: ['package-lock.json'],
          forbidden: ['pnpm-lock.yaml'],
        },
      ],
    },
  };

  const res = runS5(repoRoot, mockGates);
  assert.equal(res.gate, 'S5');
  assert.equal(res.status, 'fail');
  assert.equal(res.violations.length, 1);

  const v = res.violations[0];
  assert.equal(v.key, 'S5:website:pnpm-lock.yaml');
  assert.equal(v.path, 'website/pnpm-lock.yaml');
  assert.equal(v.metric, 1);
  assert.match(v.detail, /Forbidden lockfile found/);
});

test('runS5 passes when no forbidden lockfiles exist', () => {
  // website/package-lock.json has been removed, so this rule should pass
  const mockGates = {
    s5: {
      rules: [
        {
          path: 'website',
          allowed: ['pnpm-lock.yaml'],
          forbidden: ['package-lock.json'],
        },
        {
          path: '.',
          allowed: ['package-lock.json'],
          forbidden: ['pnpm-lock.yaml'], // pnpm-lock.yaml should not exist in root
        },
      ],
    },
  };

  const res = runS5(repoRoot, mockGates);
  assert.equal(res.gate, 'S5');
  assert.equal(res.status, 'pass');
  assert.equal(res.violations.length, 0);
});
