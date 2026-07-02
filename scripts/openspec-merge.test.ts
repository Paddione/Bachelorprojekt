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
});
