---
title: "openspec-upstream-cli — Implementation Plan"
ticket_id: T001262
domains: [openspec, tooling]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-upstream-cli — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

_Ticket: T001262_

**Goal:** Replace the raw-append delta merge in `scripts/openspec.sh` with an operation-aware Node.js merge helper so that archiving MODIFIED / REMOVED / RENAMED changes no longer corrupts the SSOT specs, and harden the validator to detect stub and dangling-target deltas.

**Architecture:** A new pure-ish Node helper `scripts/openspec-merge.mjs` parses the SSOT into `### Requirement:` blocks and applies each delta operation correctly (replace / delete / rename / insert-into-Requirements-section). `scripts/openspec.sh:_merge_delta()` delegates to it. The merge helper is the **fail-closed guard**: it exits 1 when a MODIFIED/REMOVED/RENAMED target is missing, when a RENAMED block lacks its `**Renamed-to:**` directive, or when the delta still contains an unedited skeleton stub. The TS validator (`scripts/openspec-validate.ts`) gains `RENAMED` section support and **reports** stub + cross-reference problems as warnings, so it surfaces them without breaking the live-tree integration gate for the 11 in-flight changes that still carry skeleton stubs.

**Tech Stack:** Bash (`scripts/openspec.sh`), Node.js ESM (`scripts/openspec-merge.mjs`), TypeScript + Vitest (`scripts/openspec-validate.ts` / `.test.ts`), BATS (`tests/spec/openspec-workflow.bats`).

## Global Constraints

- **No new npm dependencies.** Node built-ins only (`node:fs`, `node:path`, `node:url`).
- **API compatibility (G6).** `scripts/openspec.sh propose|apply|archive|validate`, the exported functions of `scripts/openspec-validate.ts`, and every `task openspec:*` target keep their current signatures and exit semantics.
- **The live-tree integration test must stay green.** `scripts/openspec-validate.test.ts` runs `validateTree(REPO_ROOT/openspec)` and asserts `errors.length === 0`. New stub/cross-reference findings MUST be emitted as `warnings`, never `errors`, in the bulk `validateChange`/`validateTree` path. Hard rejection lives only in `scripts/openspec-merge.mjs` (archive path).
- **Exact target matching.** A requirement is matched by the trimmed text after `### Requirement: ` — exact string equality, never substring, to avoid hitting similarly-named blocks.
- **`OPENSPEC_ROOT` override** stays honored by `scripts/openspec.sh` for fixture-driven tests.

### S1 line budgets (all files not-baselined → effective threshold = static extension limit)

| Datei | Ist | Budget | Statisches Limit |
|-------|-----|--------|------------------|
| `scripts/openspec.sh` | 200 | 300 | 500 |
| `scripts/openspec-validate.ts` | 127 | 473 | 600 |
| `scripts/openspec-merge.mjs` | 0 | 500 | 500 |
| `tests/spec/openspec-workflow.bats` | 104 | 196 | 300 |

All four files stay well under their effective thresholds after the planned additions (`openspec.sh` net ~±0, `openspec-merge.mjs` ~130 new, `openspec-validate.ts` ~+60, `openspec-workflow.bats` ~+60). No module split required.

---

## File Structure

```
scripts/openspec-merge.mjs          (NEW ~130 lines) — operation-aware delta→SSOT merge + fail-closed guard
scripts/openspec.sh                 (MODIFY _merge_delta + _validate_delta_file RENAMED) — delegates merge to the helper
scripts/openspec-validate.ts        (MODIFY) — RENAMED section regex + stub/cross-ref warnings + specsRoot threading
scripts/openspec-validate.test.ts   (MODIFY) — vitest cases for RENAMED-valid, stub-warning, cross-ref-warning
tests/spec/openspec-workflow.bats   (MODIFY) — BATS cases exercising openspec-merge.mjs per operation
tests/fixtures/openspec/            (NEW) — mini SSOT + one delta per operation (read-only test inputs)
  ssot-sample.md
  delta-added.md
  delta-modified.md
  delta-modified-missing.md
  delta-removed.md
  delta-renamed.md
  delta-renamed-no-direction.md
  delta-stub.md
```

---

## Task 1: Fixtures + failing BATS tests for the merge helper (RED)

**Files:**
- Create: `tests/fixtures/openspec/ssot-sample.md`
- Create: `tests/fixtures/openspec/delta-added.md`, `delta-modified.md`, `delta-modified-missing.md`, `delta-removed.md`, `delta-renamed.md`, `delta-renamed-no-direction.md`, `delta-stub.md`
- Modify: `tests/spec/openspec-workflow.bats`

**Interfaces:**
- Produces (consumed by Task 2): the CLI contract `node scripts/openspec-merge.mjs apply <deltaPath> <ssotPath>` — applies the delta to the SSOT file in place, exit 0 on success, exit 1 with an error on stderr naming the offending requirement when a MODIFIED/REMOVED/RENAMED target is missing, when a RENAMED block has no `**Renamed-to:**`, or when the delta contains a skeleton stub.

- [ ] **Step 1: Write the SSOT fixture**

Create `tests/fixtures/openspec/ssot-sample.md`:

```markdown
# sample

## Purpose

Fixture SSOT for openspec-merge.mjs tests.

## Requirements

### Requirement: Block A

The system SHALL keep block A original content.

#### Scenario: A holds

- **GIVEN** original A
- **THEN** unchanged

### Requirement: Deprecated Feature

The system SHALL be removed by a REMOVED delta.

### Requirement: Old Name

The system SHALL be renamed by a RENAMED delta.
```

- [ ] **Step 2: Write the delta fixtures**

Create `tests/fixtures/openspec/delta-added.md`:

```markdown
## ADDED Requirements

### Requirement: Block C

The system SHALL add a brand new block C.

#### Scenario: C added

- **GIVEN** no C
- **THEN** C exists
```

Create `tests/fixtures/openspec/delta-modified.md`:

```markdown
## MODIFIED Requirements

### Requirement: Block A

The system SHALL hold block A REPLACED content.

#### Scenario: A replaced

- **GIVEN** new A
- **THEN** replaced
```

Create `tests/fixtures/openspec/delta-modified-missing.md`:

```markdown
## MODIFIED Requirements

### Requirement: NonExistent Block

The system SHALL fail because this target is absent from the SSOT.
```

Create `tests/fixtures/openspec/delta-removed.md`:

```markdown
## REMOVED Requirements

### Requirement: Deprecated Feature

Removed because obsolete (this reason text must NOT land in the SSOT).
```

Create `tests/fixtures/openspec/delta-renamed.md`:

```markdown
## RENAMED Requirements

### Requirement: Old Name

**Renamed-to:** New Name

Renamed for clarity.
```

Create `tests/fixtures/openspec/delta-renamed-no-direction.md`:

```markdown
## RENAMED Requirements

### Requirement: Old Name

Renamed but missing the direction directive.
```

Create `tests/fixtures/openspec/delta-stub.md`:

```markdown
## ADDED Requirements

### Requirement: TODO

The system SHALL …

#### Scenario: TODO

- **GIVEN** …
- **THEN** …
```

- [ ] **Step 3: Append the BATS tests**

Add to the end of `tests/spec/openspec-workflow.bats` (the `setup()` already exports `REPO`):

```bash
# ── T001262: operation-aware delta merge (scripts/openspec-merge.mjs) ──#

_merge_setup() {            # copy the read-only SSOT fixture into a writable temp file
  FX="$REPO/tests/fixtures/openspec"
  SSOT="$BATS_TEST_TMPDIR/ssot.md"
  cp "$FX/ssot-sample.md" "$SSOT"
}

@test "T001262: ADDED inserts a new requirement into the Requirements section" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-added.md" "$SSOT"
  [ "$status" -eq 0 ]
  grep -q '^### Requirement: Block C$' "$SSOT"
  # inserted before any trailing H2, i.e. still inside the requirements body
  [ "$(grep -c '^### Requirement: ' "$SSOT")" -eq 4 ]
}

@test "T001262: MODIFIED replaces a requirement in-place, not duplicated" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-modified.md" "$SSOT"
  [ "$status" -eq 0 ]
  [ "$(grep -c '^### Requirement: Block A$' "$SSOT")" -eq 1 ]
  grep -q 'REPLACED content' "$SSOT"
  ! grep -q 'original content' "$SSOT"
}

@test "T001262: MODIFIED with a nonexistent target fails with exit 1" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-modified-missing.md" "$SSOT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"NonExistent Block"* ]]
  grep -q '^### Requirement: Block A$' "$SSOT"   # SSOT left intact
}

@test "T001262: REMOVED deletes the requirement and drops the reason text" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-removed.md" "$SSOT"
  [ "$status" -eq 0 ]
  ! grep -q '^### Requirement: Deprecated Feature$' "$SSOT"
  ! grep -q 'Removed because obsolete' "$SSOT"
}

@test "T001262: RENAMED rewrites the heading and keeps the body" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-renamed.md" "$SSOT"
  [ "$status" -eq 0 ]
  grep -q '^### Requirement: New Name$' "$SSOT"
  ! grep -q '^### Requirement: Old Name$' "$SSOT"
}

@test "T001262: RENAMED without **Renamed-to:** fails with exit 1" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-renamed-no-direction.md" "$SSOT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Renamed-to"* ]]
}

@test "T001262: a stub delta is rejected with exit 1" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-stub.md" "$SSOT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"stub"* ]]
}

@test "T001262: merge is idempotent (second apply is a no-op skip)" {
  _merge_setup
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-added.md" "$SSOT"
  [ "$status" -eq 0 ]
  run node "$REPO/scripts/openspec-merge.mjs" apply "$FX/delta-added.md" "$SSOT"
  [ "$status" -eq 0 ]
  [ "$(grep -c '^### Requirement: Block C$' "$SSOT")" -eq 1 ]
}
```

- [ ] **Step 4: Run the new BATS tests to verify they fail**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats`
Expected: FAIL — every `T001262:` test errors because `scripts/openspec-merge.mjs` does not exist yet (`Cannot find module`). This is the RED phase. `expected: FAIL`.

- [ ] **Step 5: Commit the fixtures and failing tests**

```bash
git add tests/fixtures/openspec tests/spec/openspec-workflow.bats
git commit -m "test(openspec): add fixtures + failing merge-helper BATS suite [T001262]"
```

---

## Task 2: Implement `scripts/openspec-merge.mjs` (GREEN for merge)

**Files:**
- Create: `scripts/openspec-merge.mjs`

**Interfaces:**
- Consumes: the CLI contract and fixtures from Task 1.
- Produces (consumed by Task 3): `applyDelta(deltaPath, ssotPath, today?)` default-exported behaviour via `node scripts/openspec-merge.mjs apply <delta> <ssot>`; named exports `parseDelta(text)`, `findBlocks(lines)` for potential reuse.

- [ ] **Step 1: Write the full helper**

Create `scripts/openspec-merge.mjs`:

```javascript
#!/usr/bin/env node
// scripts/openspec-merge.mjs — operation-aware OpenSpec delta → SSOT merge.
// Replaces the raw-append merge in scripts/openspec.sh:_merge_delta(). Parses the
// SSOT into `### Requirement:` blocks and applies ADDED/MODIFIED/REMOVED/RENAMED
// correctly. Fail-closed: exits 1 on a missing target, a RENAMED block without a
// `**Renamed-to:**` directive, or an unedited skeleton stub.
//   node scripts/openspec-merge.mjs apply <deltaPath> <ssotPath>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

const REQ = /^### Requirement: (.+?)\s*$/
const SECTION = /^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/
const STUBS = [/^### Requirement: TODO\s*$/m, /^#### Scenario: TODO\s*$/m, /^The system SHALL …\s*$/m]

function fail(msg) {
  process.stderr.write(`ERROR: ${msg}\n`)
  process.exit(1)
}

// Parse a delta into ordered items: { op, name, lines, renamedTo }
export function parseDelta(text) {
  const out = []
  let op = null
  let cur = null
  const flush = () => { if (cur) { out.push(cur); cur = null } }
  for (const line of text.split('\n')) {
    const s = line.match(SECTION)
    if (s) { flush(); op = s[1]; continue }
    const r = line.match(REQ)
    if (r && op) { flush(); cur = { op, name: r[1].trim(), lines: [line], renamedTo: null }; continue }
    if (cur) {
      const rt = line.match(/^\*\*Renamed-to:\*\*\s*(.+?)\s*$/)
      if (rt) cur.renamedTo = rt[1].trim()
      cur.lines.push(line)
    }
  }
  flush()
  return out
}

// Locate every `### Requirement:` block: { name, start, end } (end exclusive).
// A block ends at the next H3 (`### `) or H2 (`## `) line, or EOF.
export function findBlocks(lines) {
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const r = lines[i].match(REQ)
    if (!r) { i++; continue }
    let j = i + 1
    while (j < lines.length && !/^### /.test(lines[j]) && !/^## /.test(lines[j])) j++
    blocks.push({ name: r[1].trim(), start: i, end: j })
    i = j
  }
  return blocks
}

// Index just past the `## Requirements` section (before the next H2 or EOF).
function endOfRequirements(lines) {
  const start = lines.findIndex(l => /^## Requirements\s*$/.test(l))
  if (start === -1) return lines.length
  let i = start + 1
  while (i < lines.length && !/^## /.test(lines[i])) i++
  return i
}

export function applyDelta(deltaPath, ssotPath, today = new Date().toISOString().slice(0, 10)) {
  const deltaName = basename(deltaPath)
  const delta = readFileSync(deltaPath, 'utf-8')

  for (const re of STUBS) {
    if (re.test(delta)) fail(`${deltaName}: contains unedited skeleton stub (TODO / 'The system SHALL …') — edit before archiving`)
  }

  if (!existsSync(ssotPath)) {
    mkdirSync(dirname(ssotPath), { recursive: true })
    writeFileSync(ssotPath, `# ${basename(ssotPath, '.md')}\n\n## Purpose\n\nSSOT spec.\n\n## Requirements\n`)
  }
  let content = readFileSync(ssotPath, 'utf-8')
  const marker = `<!-- merged from change delta ${deltaName} on ${today} -->`
  if (content.includes(marker)) {
    process.stdout.write(`skip (already merged): ${deltaName}\n`)
    return 0
  }

  let lines = content.split('\n')
  for (const item of parseDelta(delta)) {
    const hit = findBlocks(lines).find(b => b.name === item.name)
    if (item.op === 'ADDED') {
      const at = endOfRequirements(lines)
      lines.splice(at, 0, '', ...item.lines)
    } else if (item.op === 'MODIFIED') {
      if (!hit) fail(`${deltaName}: MODIFIED target '${item.name}' not found in ${basename(ssotPath)}`)
      lines.splice(hit.start, hit.end - hit.start, ...item.lines)
    } else if (item.op === 'REMOVED') {
      if (!hit) fail(`${deltaName}: REMOVED target '${item.name}' not found in ${basename(ssotPath)}`)
      lines.splice(hit.start, hit.end - hit.start)
    } else if (item.op === 'RENAMED') {
      if (!hit) fail(`${deltaName}: RENAMED target '${item.name}' not found in ${basename(ssotPath)}`)
      if (!item.renamedTo) fail(`${deltaName}: RENAMED '${item.name}' missing '**Renamed-to:**' directive`)
      lines[hit.start] = `### Requirement: ${item.renamedTo}`
    }
  }

  lines.push('', marker)
  writeFileSync(ssotPath, lines.join('\n').replace(/\n{3,}/g, '\n\n'))
  return 0
}

function main(argv) {
  const [verb, deltaPath, ssotPath] = argv
  if (verb !== 'apply' || !deltaPath || !ssotPath) {
    process.stderr.write('Usage: openspec-merge.mjs apply <deltaPath> <ssotPath>\n')
    process.exit(2)
  }
  return applyDelta(deltaPath, ssotPath)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
}
```

- [ ] **Step 2: Run the merge BATS tests to verify they pass**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats`
Expected: PASS — all eight `T001262:` tests are green; the pre-existing T001261/T001263/T001265 tests stay green.

- [ ] **Step 3: Commit**

```bash
git add scripts/openspec-merge.mjs
git commit -m "feat(openspec): operation-aware delta merge helper [T001262]"
```

---

## Task 3: Delegate `_merge_delta()` to the helper + RENAMED in bash validator

**Files:**
- Modify: `scripts/openspec.sh:144-150` (`_merge_delta`) and `scripts/openspec.sh:179` (`_validate_delta_file` regex)

**Interfaces:**
- Consumes: `node scripts/openspec-merge.mjs apply <delta> <ssot>` from Task 2.
- Produces: `cmd_archive()` now merges deltas correctly; `scripts/openspec.sh validate` recognizes `## RENAMED Requirements`.

- [ ] **Step 1: Replace the body of `_merge_delta()`**

Replace these lines in `scripts/openspec.sh`:

```bash
_merge_delta() {
  local delta="$1" ssot="$2"
  mkdir -p "$(dirname "$ssot")"
  [[ -f "$ssot" ]] || printf '# %s\n\n' "$(basename "$ssot" .md)" > "$ssot"
  printf '\n<!-- merged from change delta %s on %s -->\n' "$(basename "$delta")" "$(date +%F)" >> "$ssot"
  grep -v -E '^## (ADDED|MODIFIED|REMOVED) Requirements\s*$' "$delta" >> "$ssot"
}
```

with:

```bash
_merge_delta() {
  local delta="$1" ssot="$2"
  # Operation-aware merge (ADDED/MODIFIED/REMOVED/RENAMED). Fail-closed: a missing
  # target, a RENAMED without **Renamed-to:**, or a skeleton stub exits non-zero
  # and aborts the archive (set -e) before the SSOT can be corrupted.
  node "$REPO/scripts/openspec-merge.mjs" apply "$delta" "$ssot"
}
```

- [ ] **Step 2: Add RENAMED to the bash validator regex**

In `scripts/openspec.sh:_validate_delta_file()`, change the header check from:

```bash
  grep -qE '^## (ADDED|MODIFIED|REMOVED) Requirements\s*$' "$f" \
    || { echo "FAIL: $f missing '## ADDED|MODIFIED|REMOVED Requirements' header" >&2; rc=1; }
```

to:

```bash
  grep -qE '^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$' "$f" \
    || { echo "FAIL: $f missing '## ADDED|MODIFIED|REMOVED|RENAMED Requirements' header" >&2; rc=1; }
```

- [ ] **Step 3: Verify the bash validator still passes on the live tree**

Run: `bash scripts/openspec.sh validate`
Expected: PASS — prints `openspec validate: OK` (the bash validator only checks header/H3 shape; no active change is RENAMED-only, so the broadened regex changes nothing on the current tree).

- [ ] **Step 4: Smoke-test the delegation end-to-end on a throwaway copy**

Run:

```bash
tmp="$(mktemp -d)"; cp tests/fixtures/openspec/ssot-sample.md "$tmp/s.md"
( source scripts/openspec.sh 2>/dev/null || true )  # functions only; ignore "Usage" exit
node scripts/openspec-merge.mjs apply tests/fixtures/openspec/delta-modified.md "$tmp/s.md" \
  && grep -q 'REPLACED content' "$tmp/s.md" && echo OK_DELEGATION; rm -rf "$tmp"
```

Expected: prints `OK_DELEGATION` (confirms the path `_merge_delta` will invoke works against a real SSOT copy).

- [ ] **Step 5: Commit**

```bash
git add scripts/openspec.sh
git commit -m "fix(openspec): route archive merge through operation-aware helper [T001262]"
```

---

## Task 4: Harden `scripts/openspec-validate.ts` (RENAMED + stub/cross-ref warnings)

**Files:**
- Modify: `scripts/openspec-validate.ts`
- Modify: `scripts/openspec-validate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (independent of the merge helper).
- Produces: `validateDeltaFile(filePath, specsRoot?)` and `validateChange(changeDir, specsRoot?)` gain an optional `specsRoot` for cross-reference; `validateTree` passes `join(openspecRoot, 'specs')`. Stub and dangling-target findings are pushed to `warnings`, never `errors`, so the live-tree integration test stays green.

- [ ] **Step 1: Add the failing vitest cases**

Append to `scripts/openspec-validate.test.ts` (inside a new `describe`):

```typescript
describe('validateDeltaFile — T001262 hardening', () => {
  function tmpChange(deltaBody: string) {
    const tmp = mkdtempSync(join(tmpdir(), 'openspec-h-'))
    mkdirSync(join(tmp, 'specs'), { recursive: true })
    writeFileSync(join(tmp, 'specs', 'cap.md'), deltaBody)
    writeFileSync(join(tmp, '.ticket'), 'T000000\n')
    return tmp
  }

  it('accepts a RENAMED-only delta (no spurious missing-header error)', () => {
    const tmp = tmpChange('## RENAMED Requirements\n\n### Requirement: Old\n\n**Renamed-to:** New\n')
    try {
      const { result } = validateChange(tmp)
      expect(result.errors.some(e => /missing.*Requirements.*header/i.test(e))).toBe(false)
    } finally { rmSync(tmp, { recursive: true, force: true }) }
  })

  it('warns (not errors) on an unedited stub delta', () => {
    const tmp = tmpChange('## ADDED Requirements\n\n### Requirement: TODO\n\nThe system SHALL …\n')
    try {
      const { result } = validateChange(tmp)
      expect(result.ok).toBe(true)
      expect(result.warnings.some(w => /stub/i.test(w))).toBe(true)
    } finally { rmSync(tmp, { recursive: true, force: true }) }
  })

  it('warns (not errors) when a MODIFIED target is absent from the SSOT', () => {
    const specsRoot = mkdtempSync(join(tmpdir(), 'openspec-ssot-'))
    writeFileSync(join(specsRoot, 'cap.md'),
      '## Purpose\n\nx\n\n## Requirements\n\n### Requirement: Present\n\nThe system SHALL exist.\n')
    const tmp = tmpChange('## MODIFIED Requirements\n\n### Requirement: Absent\n\nThe system SHALL change.\n')
    try {
      const { result } = validateChange(tmp, specsRoot)
      expect(result.ok).toBe(true)
      expect(result.warnings.some(w => /Absent/.test(w) && /not found/i.test(w))).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
      rmSync(specsRoot, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run the new vitest cases to verify they fail**

Run: `npm run test:openspec`
Expected: FAIL — the RENAMED-only delta still trips the missing-header error, and `validateChange` does not yet accept a `specsRoot` arg nor emit stub/cross-ref warnings. `expected: FAIL`.

- [ ] **Step 3: Implement the validator changes**

In `scripts/openspec-validate.ts`, change the `validateDeltaFile` signature and body. Replace:

```typescript
function validateDeltaFile(filePath: string): Pick<ValidationResult, 'errors'> {
  const content = readFileSync(filePath, 'utf-8')
  const errors: string[] = []

  if (!/^## (ADDED|MODIFIED|REMOVED) Requirements\s*$/m.test(content)) {
    errors.push(`${filePath}: missing '## ADDED|MODIFIED|REMOVED Requirements' header`)
  }
  if (!/^### Requirement: /m.test(content)) {
    errors.push(`${filePath}: has no '### Requirement: ' (H3) entry`)
  }
  if (/^## Requirement: /m.test(content)) {
    errors.push(`${filePath}: uses H2 '## Requirement:' (must be H3 '### Requirement:')`)
  }

  return { errors }
}
```

with:

```typescript
// Names of `### Requirement:` under a given `## <op> Requirements` section.
function sectionRequirements(content: string, op: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  let inSec = false
  let cur: { name: string; body: string } | null = null
  const flush = () => { if (cur) { out.push(cur); cur = null } }
  for (const line of content.split('\n')) {
    const sec = line.match(/^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/)
    if (sec) { flush(); inSec = sec[1] === op; continue }
    if (!inSec) continue
    const r = line.match(/^### Requirement: (.+?)\s*$/)
    if (r) { flush(); cur = { name: r[1].trim(), body: '' }; continue }
    if (cur) cur.body += line + '\n'
  }
  flush()
  return out
}

function allRequirementNames(content: string): string[] {
  return [...content.matchAll(/^### Requirement: (.+?)\s*$/gm)].map(m => m[1].trim())
}

function validateDeltaFile(
  filePath: string,
  specsRoot?: string,
): { errors: string[]; warnings: string[] } {
  const content = readFileSync(filePath, 'utf-8')
  const errors: string[] = []
  const warnings: string[] = []

  if (!/^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/m.test(content)) {
    errors.push(`${filePath}: missing '## ADDED|MODIFIED|REMOVED|RENAMED Requirements' header`)
  }
  if (!/^### Requirement: /m.test(content)) {
    errors.push(`${filePath}: has no '### Requirement: ' (H3) entry`)
  }
  if (/^## Requirement: /m.test(content)) {
    errors.push(`${filePath}: uses H2 '## Requirement:' (must be H3 '### Requirement:')`)
  }

  // Stub detection (reported as warnings so in-flight skeletons don't break the gate).
  if (/^### Requirement: TODO\s*$/m.test(content)) warnings.push(`${filePath}: unedited stub '### Requirement: TODO'`)
  if (/^#### Scenario: TODO\s*$/m.test(content)) warnings.push(`${filePath}: unedited stub '#### Scenario: TODO'`)
  if (/^The system SHALL …\s*$/m.test(content)) warnings.push(`${filePath}: unexpanded 'The system SHALL …' stub`)

  // RENAMED blocks must carry a direction directive.
  for (const { name, body } of sectionRequirements(content, 'RENAMED')) {
    if (!/\*\*Renamed-to:\*\*/.test(body)) warnings.push(`${filePath}: RENAMED '${name}' missing '**Renamed-to:**' directive`)
  }

  // Cross-reference: MODIFIED/REMOVED/RENAMED targets should exist in the SSOT.
  if (specsRoot) {
    const ssotPath = join(specsRoot, basename(filePath))
    const targets = [
      ...sectionRequirements(content, 'MODIFIED'),
      ...sectionRequirements(content, 'REMOVED'),
      ...sectionRequirements(content, 'RENAMED'),
    ].map(t => t.name)
    if (targets.length > 0) {
      if (!existsSync(ssotPath)) {
        warnings.push(`${filePath}: MODIFIED/REMOVED/RENAMED but SSOT ${ssotPath} is absent`)
      } else {
        const present = new Set(allRequirementNames(readFileSync(ssotPath, 'utf-8')))
        for (const t of targets) {
          if (!present.has(t)) warnings.push(`${filePath}: target '${t}' not found in SSOT ${basename(ssotPath)}`)
        }
      }
    }
  }

  return { errors, warnings }
}
```

Then thread `specsRoot` through `validateChange`. Change its signature and the delta loop:

```typescript
export function validateChange(changeDir: string, specsRoot?: string): ChangeValidation {
```

and replace the existing delta loop:

```typescript
  for (const capFile of capFiles) {
    const { errors: fileErrors } = validateDeltaFile(join(specsDir, capFile))
    errors.push(...fileErrors)
  }
```

with:

```typescript
  for (const capFile of capFiles) {
    const { errors: fileErrors, warnings: fileWarnings } = validateDeltaFile(join(specsDir, capFile), specsRoot)
    errors.push(...fileErrors)
    warnings.push(...fileWarnings)
  }
```

Finally, in `validateTree`, pass the SSOT dir to each change. Replace:

```typescript
    const { result } = validateChange(join(changesDir, entry.name))
```

with:

```typescript
    const { result } = validateChange(join(changesDir, entry.name), specsDir)
```

- [ ] **Step 4: Run the full openspec vitest suite to verify GREEN**

Run: `npm run test:openspec`
Expected: PASS — the three new cases pass; `validateTree — repo integration` (live tree) still reports zero **errors** (the 11 in-flight stub changes now surface as warnings, which do not fail the assertion).

- [ ] **Step 5: Commit**

```bash
git add scripts/openspec-validate.ts scripts/openspec-validate.test.ts
git commit -m "feat(openspec): validator detects RENAMED, stubs, dangling targets [T001262]"
```

---

## Task 5: Final verification, inventory regen, freshness

**Files:**
- Modify (generated): `website/src/data/test-inventory.json`, plus any artifacts touched by `task freshness:regenerate`.

- [ ] **Step 1: Regenerate the test inventory (BATS suite changed)**

Run:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

Expected: the inventory now lists the new `T001262:` BATS cases; `git diff --cached` shows only inventory additions.

- [ ] **Step 2: Run the OpenSpec gates and the bash validator**

```bash
task test:openspec
task openspec:validate
bash scripts/openspec.sh validate
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
```

Expected: all PASS — vitest green (live-tree integration zero errors), `openspec validate: OK`, all BATS green.

- [ ] **Step 3: Run the three mandatory CI gates**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Expected: `task test:changed` runs the changed-domain tests green; `task freshness:regenerate` updates generated artifacts; `task freshness:check` passes (S1–S4 ratchet clean — all four touched files stay under their effective thresholds, no new baseline keys).

- [ ] **Step 4: Commit any freshness/inventory updates**

```bash
git add -A
git commit -m "chore(openspec): regen test-inventory + freshness artifacts [T001262]"
```

---

## Self-Review

- **Spec coverage:** G1 MODIFIED → Task 2 `applyDelta` MODIFIED branch + BATS in-place test. G2 REMOVED → Task 2 REMOVED branch + BATS delete test. G3 RENAMED → Task 2 RENAMED branch + bash regex (Task 3) + validator regex (Task 4) + BATS rename test. G4 stub detection → merge helper hard-fail (Task 2) + validator warning (Task 4). G5 cross-reference → merge helper hard-fail on missing target (Task 2) + validator warning (Task 4). G6 API compat → `_merge_delta` keeps its signature, validator exports keep behaviour (specsRoot optional), no new deps.
- **CI-green decision (documented):** the live-tree `validateTree` integration test forbids new `errors` on the 11 in-flight stub changes, so stub/cross-ref findings are `warnings` in the validator and hard `exit 1` only in the archive merge path — where SSOT corruption actually occurs.
- **Type consistency:** `applyDelta` / `parseDelta` / `findBlocks` names are used identically in Tasks 2 and 3. `validateDeltaFile(filePath, specsRoot?)` and `validateChange(changeDir, specsRoot?)` signatures match across Task 4 steps. `sectionRequirements` / `allRequirementNames` helper names are consistent.
- **Placeholder scan:** no open placeholders in prose; every literal skeleton token appears only inside code fences or inline-code.
