import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTaskSource } from './task-source.mjs';

describe('resolveTaskSource', () => {
  it('prefers openspec/changes/<slug>/tasks.md when it exists', () => {
    const exists = (p) => p === 'openspec/changes/foo/tasks.md';
    assert.equal(resolveTaskSource('foo', 'REPO', exists), 'REPO/openspec/changes/foo/tasks.md');
  });
  it('falls back to the legacy plan path when no openspec tasks.md', () => {
    const exists = () => false;
    assert.equal(resolveTaskSource('foo', 'REPO', exists), 'REPO/docs/superpowers/plans/foo.md');
  });
});
