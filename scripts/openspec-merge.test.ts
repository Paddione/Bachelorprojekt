import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerComponent, applyDelta } from './openspec-merge.mjs';

const FIXTURE_CONFIG = `schema: spec-driven

context: |
  Stack: fixture
  OpenSpec-Komponenten: |
    alpha-component, beta-component,
    gamma-component


rules:
  proposal:
    - fixture rule
`;

describe('registerComponent', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'openspec-merge-test-'));
    mkdirSync(join(root, 'specs'), { recursive: true });
    writeFileSync(join(root, 'config.yaml'), FIXTURE_CONFIG);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('appends a new slug and fixes up the trailing comma on the previous last entry', () => {
    const changed = registerComponent(root, 'new-widget');
    expect(changed).toBe(true);
    const content = readFileSync(join(root, 'config.yaml'), 'utf-8');
    expect(content).toContain('gamma-component,');
    expect(content).toContain('new-widget');
  });

  it('is idempotent — calling it twice with the same slug only appends once', () => {
    registerComponent(root, 'new-widget');
    registerComponent(root, 'new-widget');
    const content = readFileSync(join(root, 'config.yaml'), 'utf-8');
    expect(content.split('new-widget')).toHaveLength(2); // exactly one occurrence
  });

  it('is a no-op (returns false, does not throw) when the header is absent', () => {
    writeFileSync(join(root, 'config.yaml'), 'schema: spec-driven\n\nrules:\n  proposal: []\n');
    expect(() => {
      const changed = registerComponent(root, 'new-widget');
      expect(changed).toBe(false);
    }).not.toThrow();
  });

  it('is a no-op when config.yaml does not exist', () => {
    rmSync(join(root, 'config.yaml'));
    expect(registerComponent(root, 'new-widget')).toBe(false);
  });
});

describe('applyDelta + registerComponent integration', () => {
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

  it('registers the slug in config.yaml when archive --create-new creates a new SSOT', () => {
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, delta);
    const ssotPath = join(root, 'specs', 'new-widget.md');

    applyDelta(deltaPath, ssotPath, '2026-07-01', true);

    const content = readFileSync(join(root, 'config.yaml'), 'utf-8');
    expect(content).toContain('new-widget');
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
