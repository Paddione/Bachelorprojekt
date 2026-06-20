import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTaskSource } from './task-source.mjs';

describe('resolveTaskSource', () => {
  it('returns openspec/changes/<slug>/tasks.md when it exists', () => {
    const exists = (p) => p === 'openspec/changes/foo/tasks.md';
    assert.equal(resolveTaskSource('foo', 'REPO', exists), 'REPO/openspec/changes/foo/tasks.md');
  });
  it('throws when no openspec tasks.md found', () => {
    const exists = () => false;
    assert.throws(() => resolveTaskSource('foo', 'REPO', exists), /No tasks\.md found/);
  });
});
