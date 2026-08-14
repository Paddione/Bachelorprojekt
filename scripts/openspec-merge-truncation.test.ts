import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyDelta } from './openspec-merge.mjs';

// T005310: Wächter gegen Trunkierung — ein Delta mit weniger Szenarien als das
// SSOT-Requirement (beobachteter Schaden: PR #4440, 591 → 586) muss den Merge
// abbrechen, außer der Caller setzt explizit allowShrink. Gilt für den expliziten
// MODIFIED-Zweig UND den ADDED→MODIFIED-Auto-Convert (Review-Befund IMPORTANT 1).
// Prüfmodus: Command-Output-Verifikation (T002448-M4) — Fail-Verhalten (throw),
// stderr-Warnungen und Datei-Inhalte, kein Source-Grep.

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

// Der Bypass-Fall: ADDED-Delta auf ein Requirement, das in der SSOT bereits
// existiert — applyDelta auto-convertiert zu MODIFIED und macht denselben
// full-block replacement wie ein expliziter MODIFIED. Der Inhalt hier ist
// absichtlich trunkierend (1 statt 3 Szenarien).
const TRUNCATING_ADDED_DELTA = `## ADDED Requirements

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

// Vitest 4 mockt process.exit selbst (Message 'process.exit unexpectedly called with "1"'),
// das explizite spyOn stellt die exakte 'process.exit(1)'-Message her (gleiches
// Fixture-Muster wie openspec-merge.test.ts).
function expectExit() {
  vi.spyOn(process, 'exit').mockImplementationOnce(() => { throw new Error('process.exit(1)') });
}

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

  it('fails on a truncating MODIFIED delta without allowShrink, leaving the SSOT unchanged', () => {
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, TRUNCATING_DELTA);
    const before = readFileSync(ssotPath, 'utf-8');
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expectExit();
    expect(() => applyDelta(deltaPath, ssotPath, '2026-08-14', false, false, false, false))
      .toThrow('process.exit(1)');
    // Auswertung VOR mockRestore: mockRestore leert mock.calls.
    const warned = warn.mock.calls.some(([chunk]) => String(chunk).includes('truncates scenarios'));
    warn.mockRestore();
    expect(warned).toBe(true);
    // Spec-Szenario 1: "the SSOT is left unchanged" — byte-identisch.
    expect(readFileSync(ssotPath, 'utf-8')).toBe(before);
  });

  it('merges a complete MODIFIED delta', () => {
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, COMPLETE_DELTA);
    expect(() => applyDelta(deltaPath, ssotPath, '2026-08-14', false, false, false, false))
      .not.toThrow();
    const merged = readFileSync(ssotPath, 'utf-8');
    expect(merged).toContain('#### Scenario: alpha');
    expect(merged).toContain('#### Scenario: gamma');
  });

  it('merges a truncating delta when allowShrink is set and still emits the warning', () => {
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, TRUNCATING_DELTA);
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() => applyDelta(deltaPath, ssotPath, '2026-08-14', false, false, false, true))
      .not.toThrow();
    const warned = warn.mock.calls.some(([chunk]) => String(chunk).includes('truncates scenarios'));
    warn.mockRestore();
    expect(warned).toBe(true);
    // Der Merge fand wirklich statt: Requirement-Inhalt ist ersetzt (nur noch
    // das Delta-Szenario, die beiden weggefallenen fehlen).
    const merged = readFileSync(ssotPath, 'utf-8');
    expect(merged).toContain('#### Scenario: alpha');
    expect(merged).not.toContain('#### Scenario: beta');
    expect(merged).not.toContain('#### Scenario: gamma');
  });

  it('fails on a truncating ADDED delta auto-converted to MODIFIED without allowShrink', () => {
    const deltaPath = join(root, 'delta.md');
    writeFileSync(deltaPath, TRUNCATING_ADDED_DELTA);
    const before = readFileSync(ssotPath, 'utf-8');
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expectExit();
    expect(() => applyDelta(deltaPath, ssotPath, '2026-08-14', false, false, false, false))
      .toThrow('process.exit(1)');
    const warned = warn.mock.calls.some(([chunk]) => String(chunk).includes('truncates scenarios'));
    warn.mockRestore();
    expect(warned).toBe(true);
    // Bypass geschlossen: auch der Auto-Convert-Zweig lässt die SSOT unverändert.
    expect(readFileSync(ssotPath, 'utf-8')).toBe(before);
  });
});
