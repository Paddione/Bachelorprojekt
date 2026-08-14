import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyDelta } from './openspec-merge.mjs';

// T005310: Wächter gegen MODIFIED-Trunkierung — ein Delta mit weniger Szenarien als das
// SSOT-Requirement (beobachteter Schaden: PR #4440, 591 → 586) muss den Merge abbrechen,
// außer der Caller setzt explizit allowShrink.

const SSOT = `# Test Spec

## Purpose

fixture

## Requirements

### Requirement: Staged lane fixture

prose paragraph

#### Scenario: alpha

- **GIVEN** a
- **THEN** b

#### Scenario: beta

- **GIVEN** c
- **THEN** d

#### Scenario: gamma

- **GIVEN** e
- **THEN** f
`;

const TRUNCATING_DELTA = `## MODIFIED Requirements

### Requirement: Staged lane fixture

prose paragraph

#### Scenario: alpha

- **GIVEN** a
- **THEN** b
`;

const COMPLETE_DELTA = `## MODIFIED Requirements

### Requirement: Staged lane fixture

prose paragraph

#### Scenario: alpha

- **GIVEN** a
- **THEN** b

#### Scenario: beta

- **GIVEN** c
- **THEN** d

#### Scenario: gamma

- **GIVEN** e
- **THEN** f
`;

describe('applyDelta truncation guard', () => {
  let root;
  let ssotPath;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'openspec-truncation-'));
    ssotPath = join(root, 'specs', 'fixture.md');
    mkdirSync(join(root, 'specs'), { recursive: true });
    writeFileSync(ssotPath, SSOT);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('fails on a truncating MODIFIED delta without allowShrink', () => {
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, TRUNCATING_DELTA);
    // Gleiches Fixture-Muster wie openspec-merge.test.ts: Vitest 4 mockt
    // process.exit selbst (Message 'process.exit unexpectedly called with "1"'),
    // das explizite spyOn stellt die exakte 'process.exit(1)'-Message her.
    vi.spyOn(process, 'exit').mockImplementationOnce(() => { throw new Error('process.exit(1)') });
    expect(() => applyDelta(deltaPath, ssotPath, '2026-08-14', false, false, false, false))
      .toThrow('process.exit(1)');
  });

  it('merges a complete MODIFIED delta', () => {
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, COMPLETE_DELTA);
    expect(() => applyDelta(deltaPath, ssotPath, '2026-08-14', false, false, false, false))
      .not.toThrow();
  });

  it('merges a truncating delta when allowShrink is set', () => {
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, TRUNCATING_DELTA);
    expect(() => applyDelta(deltaPath, ssotPath, '2026-08-14', false, false, false, true))
      .not.toThrow();
  });
});
