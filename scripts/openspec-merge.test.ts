import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyDelta } from './openspec-merge.mjs';

const FIXTURE_CONFIG = `schema: spec-driven

context: |
  Stack: fixture

rules:
  proposal:
    - fixture rule
`;

describe('applyDelta integration', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'openspec-merge-test-'));
    mkdirSync(join(root, 'specs'), { recursive: true });
    writeFileSync(join(root, 'config.yaml'), FIXTURE_CONFIG);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const delta = `## ADDED Requirements

### Requirement: Block C

The system SHALL add a brand new block C.

#### Scenario: C added

- **GIVEN** no C
- **THEN** C exists
`;

  it('creates a new SSOT and leaves config.yaml untouched on --create-new', () => {
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, delta);
    const ssotPath = join(root, 'specs', 'new-widget.md');
    const before = readFileSync(join(root, 'config.yaml'), 'utf-8');
    applyDelta(deltaPath, ssotPath, '2026-07-01', true);
    expect(readFileSync(ssotPath, 'utf-8')).toContain('## Purpose');
    expect(readFileSync(join(root, 'config.yaml'), 'utf-8')).toBe(before);
  });

  it('refuses a one-off ticket/gate slug via process.exit', () => {
    vi.spyOn(process, 'exit').mockImplementationOnce(() => { throw new Error('process.exit(1)') });
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, delta);
    expect(() => applyDelta(deltaPath, join(root, 'specs', 't000000-foo.md'), '2026-07-01', true, false)).toThrow('process.exit(1)');
  });

  it('does not touch config.yaml when the SSOT already exists (MODIFIED path)', () => {
    const ssotPath = join(root, 'specs', 'existing.md');
    writeFileSync(ssotPath, '# existing\n\n## Purpose\n\nx\n\n## Requirements\n\n### Requirement: Block A\n\nBody.\n');
    const deltaPath = join(root, 'delta-modified.md');
    writeFileSync(deltaPath, `## MODIFIED Requirements\n\n### Requirement: Block A\n\nREPLACED content.\n`);

    const before = readFileSync(join(root, 'config.yaml'), 'utf-8');
    applyDelta(deltaPath, ssotPath, '2026-07-01', false);
    const after = readFileSync(join(root, 'config.yaml'), 'utf-8');

    expect(after).toBe(before);
  });

  it('applies a second delta with the same basename+date but different content (marker must not collide) [T001473]', () => {
    const ssotPath = join(root, 'specs', 'parent.md');
    writeFileSync(ssotPath, '# parent\n\n## Purpose\n\nx\n\n## Requirements\n\n### Requirement: Block A\n\nBody.\n');

    const dir1 = mkdtempSync(join(tmpdir(), 'openspec-merge-delta1-'));
    const dir2 = mkdtempSync(join(tmpdir(), 'openspec-merge-delta2-'));
    // Parent-SSOT-Slug convention: both deltas are named after the parent SSOT.
    const delta1Path = join(dir1, 'parent.md');
    const delta2Path = join(dir2, 'parent.md');
    writeFileSync(delta1Path, `## ADDED Requirements\n\n### Requirement: Block B\n\nFirst delta content.\n`);
    writeFileSync(delta2Path, `## ADDED Requirements\n\n### Requirement: Block C\n\nSecond delta content.\n`);

    applyDelta(delta1Path, ssotPath, '2026-07-02', false);
    applyDelta(delta2Path, ssotPath, '2026-07-02', false);

    const finalContent = readFileSync(ssotPath, 'utf-8');
    expect(finalContent).toContain('### Requirement: Block B');
    expect(finalContent).toContain('### Requirement: Block C');

    rmSync(dir1, { recursive: true, force: true });
    rmSync(dir2, { recursive: true, force: true });
  });

  it('refuses ADDED when a requirement with the same name already exists [T001473]', () => {
    const ssotPath = join(root, 'specs', 'dup.md');
    writeFileSync(ssotPath, '# dup\n\n## Purpose\n\nx\n\n## Requirements\n\n### Requirement: Block A\n\nBody.\n');
    const deltaPath = join(root, 'delta-dup.md');
    writeFileSync(deltaPath, `## ADDED Requirements\n\n### Requirement: Block A\n\nDuplicate add.\n`);

    vi.spyOn(process, 'exit').mockImplementationOnce(() => { throw new Error('process.exit(1)') });
    expect(() => applyDelta(deltaPath, ssotPath, '2026-07-02', false)).toThrow('process.exit(1)');
  });
});
