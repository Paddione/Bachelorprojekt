---
title: "openspec-auto-register — Implementation Plan"
ticket_id: T001389
domains: [scripts, openspec]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-auto-register — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `scripts/openspec.sh archive --create-new` creates a brand-new SSOT
spec file, automatically and idempotently register the component slug in
`openspec/config.yaml`'s `OpenSpec-Komponenten` list, so the T001304 CI drift gate
(`checkConfigDrift()` in `scripts/openspec-validate.ts`) passes without a manual
follow-up commit.

**Architecture:** Add a pure, line-scanning helper `registerComponent(openspecRoot, slug)`
to `scripts/openspec-merge.mjs` (the same file that already owns SSOT-file creation
via `applyDelta()`). Call it, best-effort (never aborting the archive), right after
the new-SSOT-stub is written in `applyDelta()`'s `createNew` branch.

**Tech Stack:** Node.js (ESM, `node:fs`/`node:path`), Vitest, BATS.

## Global Constraints

- Never corrupt `openspec/config.yaml` — any parse/shape mismatch is a silent
  best-effort no-op, not a thrown error (from design spec `docs/superpowers/specs/2026-07-01-openspec-auto-register-design.md`).
- Idempotent: re-running `registerComponent` with an already-registered slug must
  not duplicate the entry.
- Only fires for genuinely new components (`!existsSync(ssotPath) && createNew`);
  MODIFIED/REMOVED/RENAMED deltas against an existing SSOT must never touch
  `config.yaml`.
- No new runtime dependency (no YAML parser) — line-based scanning only, matching
  the existing `findBlocks`/`parseDelta` style already in `scripts/openspec-merge.mjs`.

---

## File Structure

```
scripts/openspec-merge.mjs        # MODIFY — add + call registerComponent()
scripts/openspec-merge.test.ts   # CREATE — vitest unit tests for registerComponent()
tests/spec/openspec-workflow.bats # ALREADY MODIFIED (this session) — T001389 BATS tests (RED)
openspec/config.yaml              # untouched by this plan (registerComponent only ever
                                   # mutates copies/fixtures in tests; the real file only
                                   # changes at archive-time in a live run, not in this PR)
```

**S1 budget:** `scripts/openspec-merge.mjs` is `.mjs` (static limit 500 lines per
`scripts/plan-lint.sh` `_ext_limit`); current size is 133 lines (`wc -l`), no
baseline override in `docs/code-quality/baseline.json` for this path — effective
threshold 500, this change adds ~35 lines → residual budget stays comfortably
positive. No split needed.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED) — already committed this session.** The BATS
      tests `T001389: archive --create-new registers the new component slug in
      config.yaml` and `T001389: registering the same component twice does not
      duplicate the entry` were added to `tests/spec/openspec-workflow.bats` and
      confirmed failing on this branch before any implementation:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
# expected: FAIL — tests 25 and 26 (T001389 registration + idempotency) fail
# because scripts/openspec-merge.mjs has no registerComponent() yet.
# (Test 12, a pre-existing OPENSPEC_TELEMETRY BATS failure in 3 unrelated
# workflow files, is out of scope for T001389 — do not attempt to fix it here.)
```

- [x] **Fix-Step (GREEN).** Implement `registerComponent()` and wire it into
      `applyDelta()` (Task 1 below), then add the Vitest unit tests (Task 2),
      then re-run the BATS suite to confirm GREEN (Task 3).

### Task 1: Add `registerComponent()` and wire it into `applyDelta()`

**Files:**
- Modify: `scripts/openspec-merge.mjs`

**Interfaces:**
- Produces: `export function registerComponent(openspecRoot, slug)` → returns
  `true` if it appended the slug, `false` if it was a no-op (already present, or
  `config.yaml`/header not found/malformed).
- Consumes (already in file): `readFileSync`, `writeFileSync`, `existsSync` from
  `node:fs`; `dirname`, `basename`, `join` — `join` is a **new** import needed
  from `node:path` (the file currently only imports `dirname, basename`).

- [x] **Step 1.1: Add the `join` import**

Edit the top-of-file import line:

```js
import { dirname, basename } from 'node:path'
```

→

```js
import { dirname, basename, join } from 'node:path'
```

- [x] **Step 1.2: Add `registerComponent()` — insert after `applyDelta()` (after line 116, before `function main(argv)`)**

```js
// Idempotently register a newly-created SSOT component slug into
// openspec/config.yaml's `OpenSpec-Komponenten` list (T001389 — closes the
// T001304 CI drift gate without a manual follow-up commit). Best-effort: any
// unexpected config.yaml shape is a silent no-op, never a thrown error.
export function registerComponent(openspecRoot, slug) {
  const configPath = join(openspecRoot, 'config.yaml')
  if (!existsSync(configPath)) return false

  const lines = readFileSync(configPath, 'utf-8').split('\n')
  const headerIdx = lines.findIndex(l => /^\s*OpenSpec-Komponenten:\s*\|\s*$/.test(l))
  if (headerIdx === -1) return false

  let end = headerIdx + 1
  while (end < lines.length && /^\s+\S/.test(lines[end])) end++
  const bodyLines = lines.slice(headerIdx + 1, end)
  if (bodyLines.length === 0) return false

  const existing = new Set(
    bodyLines.join('\n').split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
  )
  if (existing.has(slug)) return false

  const indent = (bodyLines[0].match(/^\s*/) || [''])[0] || '    '
  const lastIdx = end - 1
  if (!/,\s*$/.test(lines[lastIdx])) {
    lines[lastIdx] = lines[lastIdx].replace(/\s+$/, '') + ','
  }
  lines.splice(end, 0, `${indent}${slug}`)
  writeFileSync(configPath, lines.join('\n'))
  return true
}
```

- [x] **Step 1.3: Call `registerComponent()` from `applyDelta()`'s new-SSOT branch**

Find the existing block in `applyDelta()`:

```js
  if (!existsSync(ssotPath)) {
    if (!createNew) {
      fail(`Target '${ssotPath}' does not exist. Point the delta at an existing spec, or pass --create-new for a genuinely new component.`)
    }
    mkdirSync(dirname(ssotPath), { recursive: true })
    writeFileSync(ssotPath, `# ${basename(ssotPath, '.md')}\n\n## Purpose\n\nSSOT spec.\n\n## Requirements\n`)
  }
```

Replace it with:

```js
  if (!existsSync(ssotPath)) {
    if (!createNew) {
      fail(`Target '${ssotPath}' does not exist. Point the delta at an existing spec, or pass --create-new for a genuinely new component.`)
    }
    mkdirSync(dirname(ssotPath), { recursive: true })
    writeFileSync(ssotPath, `# ${basename(ssotPath, '.md')}\n\n## Purpose\n\nSSOT spec.\n\n## Requirements\n`)
    try {
      const openspecRoot = dirname(dirname(ssotPath))
      registerComponent(openspecRoot, basename(ssotPath, '.md'))
    } catch (e) {
      // Best-effort: never abort archive/apply because of config.yaml registration.
      process.stderr.write(`WARN: registerComponent failed (non-fatal): ${e.message}\n`)
    }
  }
```

- [x] **Step 1.4: Run the BATS suite to confirm GREEN**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
# expected: PASS — tests 25, 26, 27 (all T001389 tests) now pass.
# Test 12 (OPENSPEC_TELEMETRY) remains the one pre-existing, unrelated failure.
```

- [x] **Step 1.5: Commit**

```bash
git add scripts/openspec-merge.mjs
git commit -m "fix(openspec): auto-register new SSOT components in config.yaml [T001389]"
```

### Task 2: Add Vitest unit tests for `registerComponent()`

**Files:**
- Create: `scripts/openspec-merge.test.ts`

**Interfaces:**
- Consumes: `registerComponent`, `applyDelta` exported from `./openspec-merge.mjs`
  (Task 1).

- [x] **Step 2.1: Write the test file**

```js
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
```

- [x] **Step 2.2: Run the new test file to confirm it fails without Task 1's code**

Run: `npx vitest run scripts/openspec-merge.test.ts`
Expected: FAIL — `registerComponent` is not exported yet if Task 1 hasn't landed
on this checkout (skip this step if Task 1 is already committed; in that case run
Step 2.3 directly and expect PASS).

- [x] **Step 2.3: Run the test file to confirm it passes**

```bash
npx vitest run scripts/openspec-merge.test.ts
# expected: PASS — all 6 tests green.
```

- [x] **Step 2.4: Commit**

```bash
git add scripts/openspec-merge.test.ts
git commit -m "test(openspec): add vitest coverage for registerComponent [T001389]"
```

### Task 3: Final BATS + OpenSpec validation pass

**Files:**
- None changed (verification only).

- [x] **Step 3.1: Re-run the full BATS spec file**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
# expected: PASS for all T001389 tests (25, 26, 27); the pre-existing,
# unrelated OPENSPEC_TELEMETRY failure (test 12) is out of scope for T001389.
```

- [x] **Step 3.2: Re-run `openspec validate`**

```bash
bash scripts/openspec.sh validate
# expected: "openspec validate: OK"
```

## Final Verification

- [ ] **Final Verification.** Run the three mandatory CI gates (plus the
      test-inventory regen since new BATS tests + a new test file were added):

```bash
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```
