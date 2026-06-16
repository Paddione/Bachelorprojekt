---
ticket_id: T000909
plan_ref: null
status: active
date: 2026-06-16
domains: [website, infra, db, test]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# OpenSpec-Native Workflow + `awaiting_deploy` State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the OpenSpec directory/delta format natively (`openspec/` + `scripts/openspec.sh` + CI gate), and introduce a new ticket state `awaiting_deploy` end-to-end so the "merged ≠ in prod" blind spot becomes visible on the Factory-Floor cockpit.

**Architecture:** Four independent slices. **A** adds the `openspec/` layout + a pure-bash verb script `scripts/openspec.sh` (propose/apply/archive/validate) wired into CI as `task test:openspec`. **B** threads a new `awaiting_deploy` status through the TS status model, the Svelte lane, the rollup view (in BOTH its `.sql` migration and its `cockpit-schema.ts` SSOT), `pipeline.js`'s done-return, and the queue/slot filters. **C** points the Factory at `openspec/changes/<slug>/tasks.md` as standard input. **D** points `dev-flow-plan`'s output at the `openspec/` layout. Each slice ships working, testable software on its own; A and B are the load-bearing ones.

**Tech Stack:** Bash (BATS), TypeScript/Svelte (Vitest), PostgreSQL (pg-mem), go-task, OpenSpec format conventions.

---

## Baseline / S1 budget audit (per file, against the EFFECTIVE threshold)

All measured in this worktree on 2026-06-16. Effective threshold = baseline value if baselined, else static extension limit.

| File | Ext limit | wc -l | Baseline | Effective | Budget | Strategy |
|------|-----------|-------|----------|-----------|--------|----------|
| `website/src/lib/factory-floor.ts` | 600 (.ts) | 541 | nicht-baselined | 600 | **+59** | append one enum value + one bucket entry → trivial |
| `website/src/lib/factory-floor.test.ts` | 600 | 377 | nicht-baselined | 600 | **+223** | extend existing bucket test |
| `website/src/components/FactoryFloor.svelte` | 500 (.svelte) | 486 | nicht-baselined | 500 | **+14** | TIGHT — extract the new lane into a child component (`AwaitingDeployLane.svelte`), keep net add ≤14 |
| `scripts/factory/pipeline.js` | 600 (.js) | 599 | nicht-baselined | 600 | **+1** | CRITICAL — cannot add lines inline. Extract the deploy-return logic into a new pure module `scripts/factory/deploy-transition.mjs` and *replace* lines, netting ≤+1 |
| `scripts/factory/schedule.sh` | 500 (.sh) | 75 | nicht-baselined | 500 | **+425** | no change needed (see Task B6 analysis) |
| `scripts/factory/queue.sh` | 500 (.sh) | ~22 | nicht-baselined | 500 | **+478** | no change needed (already filters `status='backlog'`) |
| `scripts/ticket.sh` | 600 (.sh)→see note | 637 | **795** | 795 | **+158** | baselined ABOVE the 600 limit; budget vs baseline 795 = +158, ample |
| `website/src/lib/tickets/cockpit-schema.ts` | 600 | 63 | nicht-baselined | 600 | **+537** | add one FILTER column |
| `website/src/lib/tickets/cockpit-schema.test.ts` | 600 | 49 | nicht-baselined | 600 | **+551** | add column assertion |
| `website/src/lib/tickets/cockpit-db.ts` | 600 | 374 | nicht-baselined | 600 | **+226** | add one field to RollupMetrics + SQL |
| `website/src/lib/tickets/cockpit-db.test.ts` | 600 | 384 | nicht-baselined | 600 | **+216** | extend |
| `scripts/migrations/2026-06-15-cockpit-rollup-view.sql` | n/a (.sql not S1-gated) | 51 | n/a | n/a | n/a | mirror cockpit-schema.ts |
| `scripts/openspec.sh` (NEW) | 500 | 0 | new | 500 | **<500** | cut with growth reserve; if >~400 split verbs into `scripts/openspec/*.sh` |
| `.claude/skills/dev-flow-plan/SKILL.md` | n/a (.md not S1-gated) | 449 | n/a | n/a | n/a | edit output paths |

**Hard S1 constraints baked into this plan:**
1. `pipeline.js` (599/600, budget +1) — Task B5 MUST extract logic to `scripts/factory/deploy-transition.mjs` and net ≤+1 line, verified with `wc -l` after the edit.
2. `FactoryFloor.svelte` (486/500, budget +14) — Task B3 extracts `AwaitingDeployLane.svelte` so the net add stays ≤14; verify with `wc -l`.
3. No new keys may be added to `docs/code-quality/baseline.json` (freshness:check key-count assertion). New files must be UNDER their static limit so they never need baselining.

**S2 (import cycles):** `scripts/factory/deploy-transition.mjs` is a pure module (string/status logic only, no import of `pipeline.js` or DB layers). `AwaitingDeployLane.svelte` imports only types from `factory-floor.ts` (already a leaf in the import graph). No new cycles in `website`/`arena-server`/`e2e`.

**S3 (hardcoded hostnames):** No brand-domain literals anywhere. Deploy commands in `pipeline.js`/`openspec.sh` use `--brand <brand>` / `ENV=<brand>` placeholders and `${REPO}` — never `*.mentolder.de`/`*.korczewski.de`.

**S4 (orphans):** `scripts/openspec.sh` is referenced by a new `task test:openspec` + `task openspec:*` Taskfile entries AND by the `dev-flow-plan` SKILL → not an orphan. `scripts/factory/deploy-transition.mjs` is imported by `pipeline.js` → not an orphan. `AwaitingDeployLane.svelte` is imported by `FactoryFloor.svelte`. New BATS file `tests/unit/openspec.bats` is wired into `task test:unit` + a `test:unit:openspec` subtask. New migration mirrors the existing one (already referenced by the cross-brand apply runbook).

---

## Anchor corrections (verified against real code, 2026-06-16)

The spec cites several anchors loosely. Corrected:

- **`factory-floor.ts:27-44`** — confirmed: `ALL_TICKET_STATUSES` (lines 27-30) and `STATUS_BUCKETS` (lines 33-44). ✅
- **`pipeline.js:597`** — the `done` return is at **line 597** (`return { status: 'done', ... }`), preceded by `phaseEvent('deploy', 'done', 'PR merged')` at **line 596**. ✅ (file is 599 lines total — budget +1).
- **`scripts/factory/schedule.sh:50`** — INCORRECT. Line 50 is inside the dependency-blocker SQL (`WHERE t.status IS DISTINCT FROM 'done'`). The actual "open for new pipeline work" filter is **`scripts/factory/queue.sh`** (`WHERE type='feature' AND status='backlog'`), which **already excludes `awaiting_deploy`** for free. No change required there; we add a regression test instead (Task B6).
- **cockpit rollup view lives in TWO places that MUST stay in sync:**
  - `scripts/migrations/2026-06-15-cockpit-rollup-view.sql` (the applied migration, 51 lines)
  - `website/src/lib/tickets/cockpit-schema.ts` → `COCKPIT_ROLLUP_VIEW_SQL` (the runtime SSOT used by `ensureCockpitViews`, 63 lines)
  - `cockpit-schema.test.ts` (pg-mem-free string asserts) enforces column presence; `cockpit-db.test.ts` exercises rollup math.
  The spec only named the `.sql`; the TS SSOT is the one actually executed at runtime. **Both** get the new `awaiting_deploy_leaves` column.
- **`update-status`** (`scripts/vda/ticket/update-status.sh`) does **not** whitelist statuses — it writes whatever string is passed (the DB column is free-text). So `awaiting_deploy` requires no enum change in bash; it just needs to be a recognized value in the TS model + view + UI.
- **`openspec/` already contains `config.yaml`** (`schema: spec-driven`, the npm-CLI's config stub). It is otherwise empty. We ADD `project.md`, `specs/`, `changes/` around it — do not delete `config.yaml`.

---

# SLICE A — `openspec/` layout + `scripts/openspec.sh` + CI gate

**Outcome:** A working `openspec/` directory with a skeleton, a `scripts/openspec.sh` implementing `propose|apply|archive|validate` backed by `ticket.sh`, and `task test:openspec` that runs `validate` (fail-closed) wired into `task test:unit`.

## Task A1: Seed the `openspec/` skeleton + project.md (ADR)

**Files:**
- Create: `openspec/project.md`
- Create: `openspec/specs/.gitkeep`
- Create: `openspec/changes/.gitkeep`
- Create: `openspec/changes/archive/.gitkeep`
- (Keep existing `openspec/config.yaml` untouched.)

- [ ] **Step 1: Write `openspec/project.md`** (the cutover ADR + format contract)

```markdown
# OpenSpec — Project Conventions

This repo uses an **OpenSpec-format-compatible native workflow**. We adopt OpenSpec's
directory layout, delta format, and lifecycle verbatim, but implement the verbs ourselves
in `scripts/openspec.sh` (wired to `scripts/ticket.sh` + the Software Factory) instead of
installing the `openspec` npm CLI. Switch path: `npm i -g openspec` runs as a drop-in
because the files are already conformant — kept cheap by the `task test:openspec` gate.

## Layout

- `openspec/specs/<capability>.md` — the living SSOT (one capability per file).
- `openspec/changes/<kebab-slug>/` — one active change == one ticket:
  - `proposal.md` (WHY + WHAT, = brainstorming output)
  - `design.md` (technical approach, optional)
  - `tasks.md` (implementation checklist, = writing-plans output, Factory input)
  - `specs/<capability>.md` (spec DELTA against the SSOT)
- `openspec/changes/archive/<YYYY-MM-DD>-<slug>/` — archived after the ticket reaches `done`;
  its delta is merged into the SSOT.

## Format conformance (the two things that guarantee switch-compatibility)

- SSOT / spec files: `### Requirement: <Name>` (H3, "SHALL" style) →
  `#### Scenario: <Name>` (H4) with `- **GIVEN/WHEN/THEN/AND**` bullets.
- Delta files: H2 operation headers `## ADDED Requirements` / `## MODIFIED Requirements` /
  `## REMOVED Requirements`, each followed by the same Requirement/Scenario structure.

## Lifecycle ↔ ticket-state mapping

| OpenSpec phase | Ticket state |
|---|---|
| proposed | `triage` / `planning` |
| approved (ready) | `plan_staged` |
| queued | `backlog` |
| active | `in_progress` / `in_review` / `qa_review` / `awaiting_deploy` |
| archived | `done` (= deployed + verified in prod) |

**Cutover:** new work from 2026-06-16 uses `openspec/`. The 211 legacy specs + 35 plans under
`docs/superpowers/` stay as a historical archive and are NOT migrated.
```

- [ ] **Step 2: Create the directory placeholders**

```bash
mkdir -p openspec/specs openspec/changes/archive
touch openspec/specs/.gitkeep openspec/changes/.gitkeep openspec/changes/archive/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add openspec/project.md openspec/specs/.gitkeep openspec/changes/.gitkeep openspec/changes/archive/.gitkeep
git commit -m "feat(openspec): seed openspec/ layout + project.md ADR"
```

## Task A2: BATS fixture + failing validate test

**Files:**
- Create: `tests/unit/openspec.bats`
- Create: `tests/unit/fixtures/openspec/valid/changes/sample-change/proposal.md`
- Create: `tests/unit/fixtures/openspec/valid/changes/sample-change/tasks.md`
- Create: `tests/unit/fixtures/openspec/valid/changes/sample-change/specs/sample-capability.md`
- Create: `tests/unit/fixtures/openspec/bad-heading/changes/sample-change/specs/sample-capability.md`

- [ ] **Step 1: Write the valid fixture delta** (`tests/unit/fixtures/openspec/valid/changes/sample-change/specs/sample-capability.md`)

```markdown
## ADDED Requirements

### Requirement: Sample Capability

The system SHALL do the sample thing.

#### Scenario: Happy path

- **GIVEN** a precondition
- **WHEN** an action occurs
- **THEN** an outcome holds
```

- [ ] **Step 2: Write the valid proposal + tasks fixtures**

`tests/unit/fixtures/openspec/valid/changes/sample-change/proposal.md`:
```markdown
# Proposal: Sample Change

## Why
Demonstrate the validator.

## What
Add a sample capability.
```

`tests/unit/fixtures/openspec/valid/changes/sample-change/tasks.md`:
```markdown
# Tasks: Sample Change

- [ ] Task 1: do the thing
```

- [ ] **Step 3: Write the bad-heading fixture** (H2 requirement instead of H3 — must fail validate)

`tests/unit/fixtures/openspec/bad-heading/changes/sample-change/specs/sample-capability.md`:
```markdown
## ADDED Requirements

## Requirement: Wrong heading level

This requirement uses H2 instead of H3 and must be rejected.
```

- [ ] **Step 4: Write `tests/unit/openspec.bats`** (failing — script does not exist yet)

```bash
#!/usr/bin/env bats
# openspec.bats — scripts/openspec.sh verbs (propose/apply/archive/validate).
# validate runs fully offline (filesystem-only). propose/apply/archive cases that
# touch the DB skip when no ticket backend is reachable (TICKET_OFFLINE=1).

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
OSX="$PROJECT_DIR/scripts/openspec.sh"
FIX="$PROJECT_DIR/tests/unit/fixtures/openspec"

@test "validate passes a well-formed change tree" {
  run env OPENSPEC_ROOT="$FIX/valid" bash "$OSX" validate
  [ "$status" -eq 0 ]
}

@test "validate fails a wrong-heading-level delta (fail-closed)" {
  run env OPENSPEC_ROOT="$FIX/bad-heading" bash "$OSX" validate
  [ "$status" -ne 0 ]
  [[ "$output" == *"heading"* || "$output" == *"Requirement"* ]]
}

@test "validate fails when a delta directory is empty/missing requirement headers" {
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/changes/empty-change/specs"
  printf '# nothing here\n' > "$tmp/changes/empty-change/specs/cap.md"
  run env OPENSPEC_ROOT="$tmp" bash "$OSX" validate
  rm -rf "$tmp"
  [ "$status" -ne 0 ]
}

@test "unknown verb exits non-zero with usage" {
  run bash "$OSX" frobnicate
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage"* || "$output" == *"Unknown"* ]]
}
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/openspec.bats`
Expected: FAIL (`scripts/openspec.sh` does not exist).

- [ ] **Step 6: Commit**

```bash
git add tests/unit/openspec.bats tests/unit/fixtures/openspec
git commit -m "test(openspec): failing BATS for openspec.sh validate + fixtures"
```

## Task A3: Implement `scripts/openspec.sh`

**Files:**
- Create: `scripts/openspec.sh`

- [ ] **Step 1: Write `scripts/openspec.sh`** (keep under 500 lines; verbs are small)

```bash
#!/usr/bin/env bash
# scripts/openspec.sh — native OpenSpec-format verbs (propose/apply/archive/validate)
# backed by scripts/ticket.sh. Files conform to OpenSpec verbatim so `npm i -g openspec`
# is a drop-in switch. validate is FILESYSTEM-ONLY and fail-closed (CI gate).
#
#   scripts/openspec.sh propose <slug> --ticket <ext-id>
#   scripts/openspec.sh apply   <slug>
#   scripts/openspec.sh archive <slug>
#   scripts/openspec.sh validate
#
# OPENSPEC_ROOT overrides the openspec/ root (used by tests against fixtures).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
OPENSPEC_ROOT="${OPENSPEC_ROOT:-$REPO/openspec}"
TICKET_SH="$REPO/scripts/ticket.sh"

die() { echo "ERROR: $*" >&2; exit 1; }

cmd_propose() {
  local slug="${1:-}"; shift || true
  local ticket=""
  while [[ $# -gt 0 ]]; do case "$1" in
    --ticket) ticket="$2"; shift 2 ;;
    *) die "Unknown propose option: $1" ;;
  esac; done
  [[ -n "$slug" ]]   || die "propose requires <slug>"
  [[ -n "$ticket" ]] || die "propose requires --ticket <ext-id>"
  local dir="$OPENSPEC_ROOT/changes/$slug"
  [[ -e "$dir" ]] && die "change '$slug' already exists at $dir"
  mkdir -p "$dir/specs"
  printf '# Proposal: %s\n\n## Why\n\n## What\n\n_Ticket: %s_\n' "$slug" "$ticket" > "$dir/proposal.md"
  printf '# Tasks: %s\n\n- [ ] (writing-plans output goes here)\n' "$slug" > "$dir/tasks.md"
  printf '## ADDED Requirements\n\n### Requirement: TODO\n\nThe system SHALL …\n\n#### Scenario: TODO\n\n- **GIVEN** …\n- **WHEN** …\n- **THEN** …\n' > "$dir/specs/$slug.md"
  echo "$ticket" > "$dir/.ticket"
  if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then
    bash "$TICKET_SH" update-status --id "$ticket" --status planning >/dev/null
  fi
  echo "proposed: $dir (ticket $ticket, status planning)"
}

cmd_apply() {
  local slug="${1:-}"
  [[ -n "$slug" ]] || die "apply requires <slug>"
  local dir="$OPENSPEC_ROOT/changes/$slug"
  [[ -d "$dir" ]] || die "no such change: $slug"
  [[ -f "$dir/tasks.md" ]] || die "change '$slug' has no tasks.md (not implementable)"
  if [[ "${TICKET_OFFLINE:-0}" != "1" && -f "$dir/.ticket" ]]; then
    bash "$TICKET_SH" update-status --id "$(cat "$dir/.ticket")" --status plan_staged >/dev/null
  fi
  echo "applied: $slug (implementable)"
}

cmd_archive() {
  local slug="${1:-}"
  [[ -n "$slug" ]] || die "archive requires <slug>"
  local dir="$OPENSPEC_ROOT/changes/$slug"
  [[ -d "$dir" ]] || die "no such change: $slug"
  # Refuse to archive unless the ticket is 'done' (prevents merging half-finished deltas).
  if [[ "${TICKET_OFFLINE:-0}" != "1" && -f "$dir/.ticket" ]]; then
    local st
    st="$(bash "$TICKET_SH" get --id "$(cat "$dir/.ticket")" 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
    [[ "$st" == "done" ]] || die "archive refused: ticket status is '${st:-unknown}', expected 'done'"
  fi
  # Merge each delta capability into the SSOT (apply ADDED/MODIFIED/REMOVED).
  local dest="$OPENSPEC_ROOT/changes/archive/$(date +%F)-$slug"
  if [[ -d "$dir/specs" ]]; then
    for capfile in "$dir/specs"/*.md; do
      [[ -e "$capfile" ]] || continue
      local cap; cap="$(basename "$capfile")"
      _merge_delta "$capfile" "$OPENSPEC_ROOT/specs/$cap"
    done
  fi
  mkdir -p "$(dirname "$dest")"
  mv "$dir" "$dest"
  echo "archived: $slug -> $dest (delta merged into SSOT)"
}

# _merge_delta <delta-file> <ssot-file>: minimal ADDED-append + MODIFIED/REMOVED note.
# Full structural merge is future work; for now ADDED requirements are appended and
# MODIFIED/REMOVED operations are recorded so the SSOT history is complete.
_merge_delta() {
  local delta="$1" ssot="$2"
  mkdir -p "$(dirname "$ssot")"
  [[ -f "$ssot" ]] || printf '# %s\n\n' "$(basename "$ssot" .md)" > "$ssot"
  printf '\n<!-- merged from change delta %s on %s -->\n' "$(basename "$delta")" "$(date +%F)" >> "$ssot"
  # Strip the H2 operation header, keep Requirement/Scenario bodies.
  grep -v -E '^## (ADDED|MODIFIED|REMOVED) Requirements\s*$' "$delta" >> "$ssot"
}

# validate: filesystem-only, fail-closed. Checks every active change dir.
cmd_validate() {
  local changes="$OPENSPEC_ROOT/changes"
  local rc=0
  [[ -d "$changes" ]] || { echo "no changes/ dir under $OPENSPEC_ROOT (ok)"; return 0; }
  shopt -s nullglob
  for dir in "$changes"/*/; do
    local base; base="$(basename "$dir")"
    [[ "$base" == "archive" ]] && continue
    # Every active change must have a spec delta directory with ≥1 capability file.
    if [[ ! -d "$dir/specs" ]]; then
      echo "FAIL: $base missing specs/ delta dir" >&2; rc=1; continue
    fi
    local had_cap=0
    for capfile in "$dir/specs"/*.md; do
      [[ -e "$capfile" ]] || continue
      had_cap=1
      _validate_delta_file "$capfile" || rc=1
    done
    [[ "$had_cap" -eq 1 ]] || { echo "FAIL: $base specs/ has no capability .md" >&2; rc=1; }
    # Active changes must carry a ticket link (.ticket sidecar).
    [[ -f "$dir/.ticket" ]] || echo "WARN: $base has no .ticket link" >&2
  done
  shopt -u nullglob
  [[ "$rc" -eq 0 ]] && echo "openspec validate: OK"
  return "$rc"
}

# _validate_delta_file: enforce H2 op header, H3 Requirement, H4 Scenario heading levels.
_validate_delta_file() {
  local f="$1" rc=0
  grep -qE '^## (ADDED|MODIFIED|REMOVED) Requirements\s*$' "$f" \
    || { echo "FAIL: $f missing '## ADDED|MODIFIED|REMOVED Requirements' header" >&2; rc=1; }
  grep -qE '^### Requirement: ' "$f" \
    || { echo "FAIL: $f has no '### Requirement: ' (H3) entry" >&2; rc=1; }
  # A bare '## Requirement:' (wrong level) is an error.
  if grep -qE '^## Requirement: ' "$f"; then
    echo "FAIL: $f uses H2 '## Requirement:' (must be H3 '### Requirement:')" >&2; rc=1
  fi
  return "$rc"
}

main() {
  [[ $# -ge 1 ]] || { echo "Usage: $0 <propose|apply|archive|validate> [args]" >&2; exit 2; }
  local cmd="$1"; shift
  case "$cmd" in
    propose)  cmd_propose  "$@" ;;
    apply)    cmd_apply    "$@" ;;
    archive)  cmd_archive  "$@" ;;
    validate) cmd_validate "$@" ;;
    *) echo "Unknown verb: $cmd" >&2; echo "Usage: $0 <propose|apply|archive|validate>" >&2; exit 2 ;;
  esac
}
main "$@"
```

- [ ] **Step 2: Make it executable + run the BATS**

Run:
```bash
chmod +x scripts/openspec.sh
./tests/unit/lib/bats-core/bin/bats tests/unit/openspec.bats
```
Expected: all PASS.

- [ ] **Step 3: Verify line count under limit**

Run: `wc -l scripts/openspec.sh`
Expected: ≤ 500 (split verbs into `scripts/openspec/*.sh` if it grows past ~400 in a later change).

- [ ] **Step 4: Commit**

```bash
git add scripts/openspec.sh
git commit -m "feat(openspec): scripts/openspec.sh propose/apply/archive/validate"
```

## Task A4: Wire `task test:openspec` + `task openspec:*` into the Taskfile

**Files:**
- Modify: `Taskfile.yml` (add `test:openspec`, `test:unit:openspec`, and `openspec:*` passthrough tasks; register `test:unit:openspec` in the `test:unit` umbrella list ~line 253-281)

- [ ] **Step 1: Add a `test:openspec` task** (near the other `test:*` tasks, ~after `test:factory` at line ~620)

```yaml
  test:openspec:
    desc: "Validate the openspec/ change tree is OpenSpec-format-conformant (fail-closed CI gate)."
    cmds:
      - bash scripts/openspec.sh validate

  test:unit:openspec:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/openspec.bats
```

- [ ] **Step 2: Add `test:unit:openspec` to the `test:unit` umbrella list** (the `cmds:` block at lines ~253-281, append a new line)

```yaml
      - task: test:unit:openspec
```

- [ ] **Step 3: Add the operator passthrough verbs** (anywhere sensible, e.g. near other ops tasks)

```yaml
  openspec:propose:
    desc: "Create an openspec change skeleton. Usage: task openspec:propose -- <slug> --ticket <ext-id>"
    cmds:
      - bash scripts/openspec.sh propose {{.CLI_ARGS}}
  openspec:apply:
    desc: "Mark an openspec change implementable. Usage: task openspec:apply -- <slug>"
    cmds:
      - bash scripts/openspec.sh apply {{.CLI_ARGS}}
  openspec:archive:
    desc: "Archive a done change + merge its delta into the SSOT. Usage: task openspec:archive -- <slug>"
    cmds:
      - bash scripts/openspec.sh archive {{.CLI_ARGS}}
  openspec:validate:
    desc: "Validate the openspec/ tree (same as test:openspec)."
    cmds:
      - bash scripts/openspec.sh validate
```

- [ ] **Step 4: Verify the tasks resolve + validate passes against the real tree**

Run:
```bash
task test:openspec
task test:unit:openspec
```
Expected: both exit 0 (the seeded `openspec/` has no active changes yet → "no changes/ dir … (ok)" or "validate: OK").

- [ ] **Step 5: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(openspec): wire test:openspec + openspec:* tasks into Taskfile + test:unit umbrella"
```

**Acceptance (Slice A):** `task test:openspec` is green; `tests/unit/openspec.bats` passes; `scripts/openspec.sh` is referenced by Taskfile (not orphan); `openspec/project.md` documents the cutover; no S1 violations (all new files under limit).

---

# SLICE B — `awaiting_deploy` state end-to-end

**Outcome:** A new `awaiting_deploy` ticket status that (1) is a recognized TS status mapped to its own bucket, (2) renders as its own Factory-Floor lane, (3) is counted by the rollup view as its own `awaiting_deploy_leaves` column (in BOTH the `.sql` migration and the `cockpit-schema.ts` SSOT), (4) is set by `pipeline.js` after merge with an explicit deploy→`done` transition, (5) is provably excluded from new-pipeline scheduling.

## Task B1: TS status model — add `awaiting_deploy` (TDD)

**Files:**
- Test: `website/src/lib/factory-floor.test.ts`
- Modify: `website/src/lib/factory-floor.ts:27-44`

- [ ] **Step 1: Write the failing test** (append to the existing bucket-mapping describe block in `factory-floor.test.ts`)

```typescript
import { ALL_TICKET_STATUSES, STATUS_BUCKETS } from './factory-floor';

describe('awaiting_deploy status', () => {
  it('is part of ALL_TICKET_STATUSES', () => {
    expect(ALL_TICKET_STATUSES).toContain('awaiting_deploy');
  });
  it('maps to its own awaitingDeploy bucket', () => {
    expect(STATUS_BUCKETS.awaiting_deploy).toBe('awaitingDeploy');
  });
  it('every status has a bucket (no undefined mapping)', () => {
    for (const s of ALL_TICKET_STATUSES) {
      expect(STATUS_BUCKETS[s]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts`
Expected: FAIL (`awaiting_deploy` not in array / bucket undefined).

- [ ] **Step 3: Add `awaiting_deploy` to the status array** (`factory-floor.ts` line 27-30)

```typescript
export const ALL_TICKET_STATUSES = [
  'triage', 'planning', 'plan_staged', 'backlog', 'in_progress',
  'in_review', 'blocked', 'qa_review', 'awaiting_deploy', 'done', 'archived',
] as const;
```

- [ ] **Step 4: Add the bucket mapping** (`factory-floor.ts` line 33-44 — add the new entry before `done`)

```typescript
export const STATUS_BUCKETS: Record<TicketStatus, string> = {
  triage:          'planning',
  planning:        'planning',
  plan_staged:     'staged',
  backlog:         'loadingDock',
  in_progress:     'hall',
  in_review:       'hall',
  blocked:         'attention',
  qa_review:       'qa',
  awaiting_deploy: 'awaitingDeploy',
  done:            'shipped',
  archived:        'archive',
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify line budget** — Run `wc -l website/src/lib/factory-floor.ts` → expect ≤ 543 (was 541, +2; budget +59, fine).

- [ ] **Step 7: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor.test.ts
git commit -m "feat(factory-floor): add awaiting_deploy status + awaitingDeploy bucket"
```

## Task B2: Surface `awaiting_deploy` items in the floor payload (TDD)

**Files:**
- Modify: `website/src/lib/factory-floor.ts` (add `getAwaitingDeploy()` + thread into `FloorPayload`/`getFloor`)
- Test: `website/src/lib/factory-floor.test.ts`

> **Why:** The floor currently has no query for `awaiting_deploy` tickets, so the new lane would be empty. Add a small read-only DAL function mirroring `getShipped`.

- [ ] **Step 1: Write the failing test** (append to `factory-floor.test.ts`; use the existing pg-mem/mock harness pattern already in the file — model it on the existing `getShipped` test)

```typescript
import { getAwaitingDeploy } from './factory-floor';

describe('getAwaitingDeploy', () => {
  it('returns tickets with status awaiting_deploy, newest first', async () => {
    // Arrange: insert two awaiting_deploy tickets + one done ticket into the test pool
    // (reuse the file's existing seedTickets/withPool helper).
    const rows = await getAwaitingDeploy();
    expect(rows.every(r => typeof r.extId === 'string')).toBe(true);
    // done tickets must NOT appear
    expect(rows.find(r => r.extId === 'DONE-1')).toBeUndefined();
  });
});
```

> If the file has no reusable pool-seeding helper, follow the exact mocking style already used by the nearest existing DAL test in this file (do not invent a new harness).

- [ ] **Step 2: Run to verify it fails**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts`
Expected: FAIL (`getAwaitingDeploy` is not exported).

- [ ] **Step 3: Add the DAL function + interface + payload field** (`factory-floor.ts`)

Add the interface near `ShippedItem` (line ~102):
```typescript
export interface AwaitingDeployItem { extId: string; title: string; mergedAt: string | null; prNumber: number | null; }
```

Add the query function near `getShipped` (after line ~272):
```typescript
/** Tickets merged to main but not yet deployed to fleet (the "merge ≠ prod" lane). */
export async function getAwaitingDeploy(limit = 12): Promise<AwaitingDeployItem[]> {
  const r = await pool.query(
    `SELECT t.external_id, t.title, t.updated_at, l.pr_number
       FROM tickets.tickets t
       LEFT JOIN (
         SELECT DISTINCT ON (from_id) from_id, pr_number
           FROM tickets.ticket_links
          WHERE kind = 'pr' AND pr_number IS NOT NULL
          ORDER BY from_id, created_at DESC
       ) l ON l.from_id = t.id
      WHERE t.status = 'awaiting_deploy'
      ORDER BY t.updated_at DESC NULLS LAST
      LIMIT $1::int`,
    [limit],
  );
  return r.rows.map((row: any) => ({
    extId: row.external_id,
    title: row.title,
    mergedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    prNumber: row.pr_number ?? null,
  }));
}
```

Add `awaitingDeploy: AwaitingDeployItem[];` to the `FloorPayload` interface (line ~115-128), and thread it into `getFloor` (line ~377-396): add `getAwaitingDeploy()` to the `Promise.all` array and include `awaitingDeploy` in the returned object.

- [ ] **Step 4: Run to verify it passes**

Run: `cd website && pnpm vitest run src/lib/factory-floor.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify line budget** — `wc -l website/src/lib/factory-floor.ts` → expect ≤ ~570 (budget +59, fine).

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor.test.ts
git commit -m "feat(factory-floor): getAwaitingDeploy DAL + payload field"
```

## Task B3: Factory-Floor lane — extract `AwaitingDeployLane.svelte` (S1 budget guard)

**Files:**
- Create: `website/src/components/factory/AwaitingDeployLane.svelte`
- Modify: `website/src/components/FactoryFloor.svelte` (import + render the lane; net add ≤14 lines)

> **Why extract:** `FactoryFloor.svelte` is 486/500 → only +14 lines of headroom. Putting the lane markup inline would blow S1. The new lane is a self-contained child component fed `data.awaitingDeploy`.

- [ ] **Step 1: Create the lane component** (`website/src/components/factory/AwaitingDeployLane.svelte`)

```svelte
<script lang="ts">
  import type { AwaitingDeployItem } from '../../lib/factory-floor';
  export let items: AwaitingDeployItem[] = [];
</script>

<section class="lg:w-1/5" data-testid="floor-awaiting-deploy" id="floor-awaiting-deploy">
  <h3 class="text-sm font-semibold text-muted mb-2">Wartet auf Deploy</h3>
  {#if items.length === 0}
    <p class="text-muted text-xs">Nichts wartet auf Deploy.</p>
  {:else}
    <ul class="space-y-2">
      {#each items as it (it.extId)}
        <li class="rounded-xl bg-amber-500/10 p-3" data-testid="awaiting-deploy-card">
          <p class="text-xs font-mono text-amber-300">{it.extId}{#if it.prNumber} · PR #{it.prNumber}{/if}</p>
          <p class="text-sm">{it.title}</p>
        </li>
      {/each}
    </ul>
  {/if}
</section>
```

- [ ] **Step 2: Wire it into `FactoryFloor.svelte`** (import in the `<script>` block, render near the QA/shipped lanes ~line 381)

Add to imports:
```svelte
  import AwaitingDeployLane from './factory/AwaitingDeployLane.svelte';
```
Render (place next to the existing shipped/qa lanes):
```svelte
  <AwaitingDeployLane items={data.awaitingDeploy ?? []} />
```
Also add `awaitingDeploy` to the `MOBILE_COL_INDEX` map (line 28) between `qs` and `done` if mobile column ordering applies: `awaitingDeploy: 9, done: 10` (renumber `done` accordingly).

- [ ] **Step 3: Verify the budget**

Run: `wc -l website/src/components/FactoryFloor.svelte`
Expected: ≤ 500 (net add ≤14). If it exceeds, move more markup into the child component.

- [ ] **Step 4: Typecheck**

Run: `cd website && pnpm check` (or `pnpm exec svelte-check --tsconfig ./tsconfig.json` if `check` is unavailable)
Expected: no new type errors.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/factory/AwaitingDeployLane.svelte website/src/components/FactoryFloor.svelte
git commit -m "feat(factory-floor): AwaitingDeployLane 'Wartet auf Deploy' lane"
```

## Task B4: Rollup view — `awaiting_deploy_leaves` column in BOTH SSOTs (TDD)

**Files:**
- Test: `website/src/lib/tickets/cockpit-schema.test.ts`
- Test: `website/src/lib/tickets/cockpit-db.test.ts`
- Modify: `website/src/lib/tickets/cockpit-schema.ts` (`COCKPIT_ROLLUP_VIEW_SQL`)
- Modify: `scripts/migrations/2026-06-15-cockpit-rollup-view.sql` (mirror)
- Modify: `website/src/lib/tickets/cockpit-db.ts` (`RollupMetrics` + the inline `fetchLeafRollup` SQL + `toRollup`)

> **Decision (per spec):** `awaiting_deploy` gets its OWN counter `awaiting_deploy_leaves` so the deploy backlog is measurable — NOT folded into `in_progress_leaves`. **Bucket-disjointness invariant:** `done + blocked + in_progress + awaiting_deploy + open == total`. So `awaiting_deploy` must be removed from any other bucket (it is currently in none — confirmed it is a brand-new status).

- [ ] **Step 1: Write the failing schema-string test** (append to `cockpit-schema.test.ts`)

```typescript
it('aggregates an awaiting_deploy_leaves column in its own bucket', () => {
  expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('awaiting_deploy_leaves');
  // awaiting_deploy must NOT leak into in_progress_leaves
  const inProgLine = COCKPIT_ROLLUP_VIEW_SQL
    .split('\n').find(l => l.includes('in_progress_leaves') && l.includes('FILTER'));
  expect(inProgLine).toBeDefined();
  expect(inProgLine).not.toContain('awaiting_deploy');
});
```

- [ ] **Step 2: Write the failing rollup-math test** (append to `cockpit-db.test.ts`, following the file's existing pg-mem seeding pattern — seed a feature with one `awaiting_deploy` leaf and assert the new field)

```typescript
it('counts awaiting_deploy leaves in their own bucket (not in_progress)', async () => {
  // Seed via the file's existing helper: a feature container with one task leaf
  // at status 'awaiting_deploy'. Then assert the rollup.
  const m = await /* existing rollup fetch helper */ fetchRollupForTest('feat-await');
  expect(m.awaitingDeploy).toBe(1);
  expect(m.inProgress).toBe(0);
});
```

> Use the actual helper name present in `cockpit-db.test.ts` (do not invent one). If the test file fetches rollups via `loadCockpit(brand)`, assert on that path instead.

- [ ] **Step 3: Run both tests to verify they fail**

Run: `cd website && pnpm vitest run src/lib/tickets/cockpit-schema.test.ts src/lib/tickets/cockpit-db.test.ts`
Expected: FAIL (`awaiting_deploy_leaves` / `awaitingDeploy` missing).

- [ ] **Step 4: Add the column to `cockpit-schema.ts`** (the `agg` CTE — add a FILTER line; and the outer SELECT — add a COALESCE line)

In the `agg` SELECT (currently lines ~32-36), add after the `in_progress_leaves` line:
```sql
        COUNT(*) FILTER (WHERE status = 'awaiting_deploy')::int AS awaiting_deploy_leaves,
```
In the outer SELECT (currently lines ~44-46), add after the `in_progress_leaves` COALESCE:
```sql
      COALESCE(a.awaiting_deploy_leaves, 0) AS awaiting_deploy_leaves,
```

- [ ] **Step 5: Mirror the SAME two edits into `scripts/migrations/2026-06-15-cockpit-rollup-view.sql`** (the `agg` block line ~30 and the outer SELECT line ~40) so the applied migration and the runtime SSOT stay identical.

- [ ] **Step 6: Thread the field through `cockpit-db.ts`** — add `awaitingDeploy: number;` to `RollupMetrics`, add `awaitingDeploy: Number(r?.awaiting_deploy_leaves ?? 0),` in `toRollup` (line ~14), and in `fetchLeafRollup`'s flat-aggregate SQL (line ~42-45) add `SUM(CASE WHEN status = 'awaiting_deploy' THEN 1 ELSE 0 END) AS awaiting_deploy_leaves,` plus the corresponding `awaitingDeploy: Number(r.awaiting_deploy_leaves ?? 0),` in its return object (line ~57).

> **Total-count invariant:** `fetchLeafRollup` computes `total_leaves` as "all non-archived". `awaiting_deploy` rows are non-archived, so they are already in `total`. No change to the total expression needed — just the new bucket.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd website && pnpm vitest run src/lib/tickets/cockpit-schema.test.ts src/lib/tickets/cockpit-db.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add website/src/lib/tickets/cockpit-schema.ts website/src/lib/tickets/cockpit-schema.test.ts \
        website/src/lib/tickets/cockpit-db.ts website/src/lib/tickets/cockpit-db.test.ts \
        scripts/migrations/2026-06-15-cockpit-rollup-view.sql
git commit -m "feat(cockpit): awaiting_deploy_leaves rollup counter (schema + migration + db)"
```

## Task B5: pipeline.js — `done`→`awaiting_deploy` + explicit deploy transition (S1: extract module, +1 budget)

**Files:**
- Create: `scripts/factory/deploy-transition.mjs` (pure module — status/return logic)
- Modify: `scripts/factory/pipeline.js:592-597` (replace the `done` return with the extracted helper; net ≤+1 line)

> **S1 CRITICAL:** `pipeline.js` is 599/600. We MUST NOT grow it. Extract the deploy-decision logic into a pure ESM module, then replace the inline block so the net line delta is ≤+1.

> **Semantics (per spec §"Der neue State"):** After a successful merge, the pipeline result becomes `awaiting_deploy` rather than `done`. A subsequent explicit deploy step advances it to `done`. **Website auto-advance exception:** the `pipeline.js` deploy phase already runs `task feature:website`-style rollout for website tickets (steps 6-8 of the deploy agent block); for those, the rollout IS the deploy → they may advance straight to `done`. Everything else (push-based) stays in `awaiting_deploy` until `task workspace:deploy` runs.

- [ ] **Step 1: Write the failing unit test** (new file `tests/unit/factory/deploy-transition.bats` OR a vitest — choose vitest since the module is `.mjs` and Node-testable)

Create `scripts/factory/deploy-transition.test.mjs`:
```javascript
import { describe, it, expect } from 'vitest';
import { decideDeployTransition } from './deploy-transition.mjs';

describe('decideDeployTransition', () => {
  it('website tickets advance straight to done (rollout = deploy)', () => {
    expect(decideDeployTransition({ isWebsite: true, deployOutput: 'PR merged' }).status).toBe('done');
  });
  it('push-based tickets stop at awaiting_deploy', () => {
    expect(decideDeployTransition({ isWebsite: false, deployOutput: 'PR merged' }).status).toBe('awaiting_deploy');
  });
  it('blocked deploy output stays blocked', () => {
    const r = decideDeployTransition({ isWebsite: false, deployOutput: 'BLOCK: deploy-guard' });
    expect(r.status).toBe('blocked');
  });
});
```

> Register this test: add `scripts/factory/deploy-transition.test.mjs` to the website vitest include OR a root vitest config — confirm where existing `scripts/**/*.test.mjs` are picked up; if none exist, wire it into `task test:unit:openspec`-style standalone via `node --test`. Prefer the existing vitest project that already globs `scripts/`. If no such project exists, convert this to a BATS test under `tests/unit/factory/` that shells `node -e`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd website && pnpm vitest run ../scripts/factory/deploy-transition.test.mjs` (adjust path to the wired project)
Expected: FAIL (module missing).

- [ ] **Step 3: Write `scripts/factory/deploy-transition.mjs`** (pure, no imports of pipeline/DB)

```javascript
// scripts/factory/deploy-transition.mjs — pure decision for the post-merge status.
// Returns the terminal/intermediate status for a ticket after the Deploy phase.
// No side effects, no imports of pipeline.js or DB layers (keeps the import graph acyclic).

/**
 * @param {{ isWebsite: boolean, deployOutput: string }} ctx
 * @returns {{ status: 'done'|'awaiting_deploy'|'blocked', reason?: string }}
 */
export function decideDeployTransition(ctx) {
  const out = String(ctx.deployOutput ?? '');
  if (/BLOCK:|deploy-guard|"status":\s*"blocked"|status:\s*'blocked'/.test(out)) {
    return { status: 'blocked', reason: 'deploy-guard' };
  }
  // Website rolls out automatically via the in-pipeline rollout steps → deploy is complete.
  if (ctx.isWebsite) return { status: 'done' };
  // Push-based services: merged to main but NOT yet on fleet → visible deploy backlog.
  return { status: 'awaiting_deploy', reason: 'merged-not-deployed' };
}
```

- [ ] **Step 4: Replace the inline `done` block in `pipeline.js`** (lines 592-597). Current:

```javascript
if (deploy.includes('deploy-guard') || deploy.includes('"status": "blocked"') || deploy.includes("status: 'blocked'")) {
  phaseEvent('deploy', 'blocked', 'deploy-guard')
  return { status: 'blocked', reason: 'deploy-guard' }
}
phaseEvent('deploy', 'done', 'PR merged')
return { status: 'done', pr: deploy, reviews: reviews.length, tasks: tasks.length, implemented: implemented.length }
```

Replace with (add the import at the top of the file's import block — `pipeline.js` already uses ESM `import`):
```javascript
const { status: deployStatus, reason: deployReason } = decideDeployTransition({ isWebsite: A.isWebsite ?? slug?.includes('website') ?? false, deployOutput: deploy })
phaseEvent('deploy', deployStatus === 'blocked' ? 'blocked' : 'done', deployStatus === 'awaiting_deploy' ? 'merged; awaiting deploy' : 'PR merged')
if (deployStatus !== 'done') { await agent(`bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status ${deployStatus}`, { label: `status:${deployStatus}`, phase: 'Deploy' }) }
return { status: deployStatus, reason: deployReason, pr: deploy, reviews: reviews.length, tasks: tasks.length, implemented: implemented.length }
```

Add to the imports at the top of `pipeline.js`:
```javascript
import { decideDeployTransition } from './deploy-transition.mjs'
```

> **Note:** determine `isWebsite` from the data already in scope — the deploy agent block (lines 543-550) already branches website vs non-website via `${deployStepCmd}`. Reuse whatever flag computes `deployStepCmd`; if it's a local `const isWebsite`, pass that. Do NOT introduce a brand-domain literal — use the slug/service flag already present.

- [ ] **Step 5: Verify the line budget (HARD GATE)**

Run: `wc -l scripts/factory/pipeline.js`
Expected: ≤ 600. If 601+, compress the replacement (e.g. inline `deployReason`) until ≤600. This is non-negotiable.

- [ ] **Step 6: Run the transition test + a pipeline load-check**

Run:
```bash
cd website && pnpm vitest run ../scripts/factory/deploy-transition.test.mjs
node --check scripts/factory/pipeline.js
```
Expected: test PASS, `node --check` OK.

- [ ] **Step 7: Commit**

```bash
git add scripts/factory/deploy-transition.mjs scripts/factory/deploy-transition.test.mjs scripts/factory/pipeline.js
git commit -m "feat(factory): pipeline done→awaiting_deploy + explicit deploy transition (extracted module)"
```

## Task B6: Scheduling exclusion regression test (no code change to queue.sh)

**Files:**
- Test: `tests/unit/openspec.bats` is the wrong home — create/extend `tests/unit/factory-blocked.bats` (already exists) OR add to a factory scheduling BATS.

> **Finding:** `queue.sh` selects `WHERE type='feature' AND status='backlog'` — `awaiting_deploy` is already excluded from new-work scheduling. We lock this in with a regression assertion rather than changing code (the spec's `schedule.sh:50` anchor was a mis-citation).

- [ ] **Step 1: Add a guard test** that asserts `queue.sh`'s SQL filters to `backlog` and never selects `awaiting_deploy`. Append to the existing `tests/unit/factory-blocked.bats`:

```bash
@test "queue.sh only schedules backlog features (excludes awaiting_deploy)" {
  run grep -E "status\s*=\s*'backlog'" "$PROJECT_DIR/scripts/factory/queue.sh"
  [ "$status" -eq 0 ]
  run grep "awaiting_deploy" "$PROJECT_DIR/scripts/factory/queue.sh"
  [ "$status" -ne 0 ]   # awaiting_deploy must NOT appear as a schedulable status
}
```

> Ensure `PROJECT_DIR` is defined in that BATS file's setup (it is in most; if not, add `PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"`).

- [ ] **Step 2: Run it**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/factory-blocked.bats`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/factory-blocked.bats
git commit -m "test(factory): assert queue.sh excludes awaiting_deploy from scheduling"
```

**Acceptance (Slice B):** Vitest green for factory-floor + cockpit; `awaiting_deploy` is a TS status in its own bucket + lane; rollup view counts `awaiting_deploy_leaves` in both `.sql` and `cockpit-schema.ts`; `pipeline.js` returns `awaiting_deploy` for push-based + `done` for website, with `pipeline.js` ≤600 lines; queue.sh exclusion locked by a test.

---

# SLICE C — Factory reads `openspec/changes/<slug>/tasks.md` as standard input

**Outcome:** The pipeline's task-loading reads `openspec/changes/<slug>/tasks.md` as the canonical task list (falling back to the legacy `docs/superpowers/plans/<slug>.md` for in-flight legacy work), and `openspec validate` protects it.

## Task C1: Add a task-source resolver to the pipeline

**Files:**
- Create: `scripts/factory/task-source.mjs` (pure resolver)
- Modify: `scripts/factory/pipeline.js` (use the resolver where it currently reads the plan path — see line 542 `--plan-file ${planFilePath ?? ...docs/superpowers/plans/${slug}.md}`)
- Test: `scripts/factory/task-source.test.mjs`

> **S1:** `pipeline.js` is at its 600 limit. The resolver is a separate module; the pipeline edit must be line-neutral (swap one expression for a function call). Verify with `wc -l` after.

- [ ] **Step 1: Write the failing test** (`scripts/factory/task-source.test.mjs`)

```javascript
import { describe, it, expect } from 'vitest';
import { resolveTaskSource } from './task-source.mjs';

describe('resolveTaskSource', () => {
  it('prefers openspec/changes/<slug>/tasks.md when it exists', () => {
    const exists = (p) => p === 'openspec/changes/foo/tasks.md';
    expect(resolveTaskSource('foo', 'REPO', exists))
      .toBe('REPO/openspec/changes/foo/tasks.md');
  });
  it('falls back to the legacy plan path when no openspec tasks.md', () => {
    const exists = () => false;
    expect(resolveTaskSource('foo', 'REPO', exists))
      .toBe('REPO/docs/superpowers/plans/foo.md');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd website && pnpm vitest run ../scripts/factory/task-source.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Write `scripts/factory/task-source.mjs`**

```javascript
// scripts/factory/task-source.mjs — resolve the canonical task list for a change.
// Prefers the OpenSpec-format tasks.md; falls back to the legacy plan path.
// Pure: the filesystem check is injected so it stays unit-testable.
import { existsSync } from 'node:fs';

/**
 * @param {string} slug
 * @param {string} repo  absolute repo root
 * @param {(p:string)=>boolean} [exists] injectable for tests
 * @returns {string} absolute path to the task source
 */
export function resolveTaskSource(slug, repo, exists = existsSync) {
  const rel = `openspec/changes/${slug}/tasks.md`;
  if (exists(slug ? rel : '__none__')) return `${repo}/${rel}`;
  return `${repo}/docs/superpowers/plans/${slug}.md`;
}
```

> The `exists(slug ? rel : ...)` keeps the injected predicate matching the test's `p === 'openspec/changes/foo/tasks.md'`. In production `existsSync` receives the relative path; if `pipeline.js` runs from `${REPO}`, pass `existsSync` directly. Adjust the predicate arg to whatever cwd the pipeline uses (verify `process.cwd()` in pipeline at runtime); if it runs from an arbitrary cwd, build an absolute path inside the resolver and check that instead — keep the two test cases passing.

- [ ] **Step 4: Use it in `pipeline.js`** — replace the `planFilePath ?? `${REPO}/docs/superpowers/plans/${slug}.md`` expression at line 542 with `resolveTaskSource(slug, REPO)` (and import `resolveTaskSource` at the top, alongside the B5 import — that's the only added import line). Keep the change line-neutral.

- [ ] **Step 5: Verify budget + node check**

Run: `wc -l scripts/factory/pipeline.js && node --check scripts/factory/pipeline.js`
Expected: ≤600, OK. (Two imports were added across B5+C1 — confirm total file still ≤600; if it tips over, combine the two new imports onto one line: `import { decideDeployTransition } from './deploy-transition.mjs'; import { resolveTaskSource } from './task-source.mjs'`.)

- [ ] **Step 6: Run the resolver test**

Run: `cd website && pnpm vitest run ../scripts/factory/task-source.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/factory/task-source.mjs scripts/factory/task-source.test.mjs scripts/factory/pipeline.js
git commit -m "feat(factory): read openspec/changes/<slug>/tasks.md as task source (legacy fallback)"
```

**Acceptance (Slice C):** `resolveTaskSource` unit-tested; pipeline uses it; `pipeline.js` still ≤600 lines and `node --check`-clean; legacy plan path still resolves for in-flight work.

---

# SLICE D — `dev-flow-plan` writes into the `openspec/` layout

**Outcome:** `dev-flow-plan`'s SKILL instructs writing the proposal + tasks into `openspec/changes/<slug>/` (via `scripts/openspec.sh propose`), while still producing the design spec. Pure documentation/skill change (no S1-gated source).

## Task D1: Update the `dev-flow-plan` SKILL output target

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md`

> **Why minimal:** the SKILL is large (449 lines) and orchestrates many steps. We make a surgical change: after the spec is written, call `scripts/openspec.sh propose` to seed `openspec/changes/<slug>/`, and direct the writing-plans subagent to ALSO write `tasks.md` there. We keep the legacy `docs/superpowers/plans/<slug>.md` write for now (Slice C's resolver falls back to it), so nothing downstream breaks during cutover.

- [ ] **Step 1: Add an `openspec propose` step** after the spec-creation block (after line ~143 where the spec frontmatter hook runs). Insert:

```markdown
### 2.5 OpenSpec-Change anlegen

Lege den OpenSpec-Change-Ordner an (seedet `proposal.md` + `tasks.md` + Delta-Skeleton und
setzt den Ticket-Status auf `planning`):

```bash
bash scripts/openspec.sh propose "<slug>" --ticket "<TICKET_EXT_ID>"
```

Übertrage den Brainstorming-Output (WARUM + WAS) nach `openspec/changes/<slug>/proposal.md`.
Der Implementierungsplan wird in **beide** Ziele geschrieben: `openspec/changes/<slug>/tasks.md`
(Factory-Standard-Input) **und** das Legacy-`docs/superpowers/plans/<date>-<slug>.md` (bis der
Cutover abgeschlossen ist; der Factory-Resolver fällt darauf zurück).
```

- [ ] **Step 2: Amend the writing-plans subagent Auftrag** (line ~167) to add: "Schreibe `tasks.md` zusätzlich nach `openspec/changes/<slug>/tasks.md` (OpenSpec-Format: H2-Operationsheader im Delta, H3-Requirement, H4-Scenario im `specs/<capability>.md`)."

- [ ] **Step 3: Add a validate step** before the commit (line ~233) so malformed deltas fail early:

```markdown
Vor dem Commit: `task test:openspec` (oder `bash scripts/openspec.sh validate`) — muss grün sein.
```

- [ ] **Step 4: Sanity-check the SKILL still parses** (it's markdown; just confirm no broken code fences)

Run: `grep -c '```' .claude/skills/dev-flow-plan/SKILL.md` → expect an even number (balanced fences).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/dev-flow-plan/SKILL.md
git commit -m "docs(dev-flow-plan): write proposal+tasks into openspec/ layout (legacy fallback kept)"
```

**Acceptance (Slice D):** `dev-flow-plan` SKILL references `scripts/openspec.sh propose` + the openspec tasks.md target + a validate gate; fences balanced; no S1-gated file touched.

---

# FINAL TASK: Full CI-equivalent verification + inventory

**Files:** none (verification only), then commit regenerated artifacts.

> This MUST be the last task. It reproduces the CI gates locally including the S1–S4 ratchet, and regenerates the test inventory because we added BATS + Vitest tests.

- [ ] **Step 1: Targeted tests for changed domains**

Run: `task test:changed`
Expected: vitest (website) + selected BATS + quality all green. Investigate any failure before proceeding.

- [ ] **Step 2: OpenSpec gate explicitly**

Run: `task test:openspec && ./tests/unit/lib/bats-core/bin/bats tests/unit/openspec.bats`
Expected: both green.

- [ ] **Step 3: Regenerate the test inventory (new tests were added)**

Run: `task test:inventory`
Then: `git add website/src/data/test-inventory.json`
Expected: the inventory now lists `openspec.bats`, the new factory tests, and the new vitest specs.

- [ ] **Step 4: Regenerate freshness artifacts**

Run: `task freshness:regenerate`
Then stage any regenerated files (`docs/generated/**`, `docs/code-quality/repo-index.json`, etc.):
```bash
git add -A docs/generated docs/code-quality
```

- [ ] **Step 5: Run the CI-equivalent freshness + quality ratchet (S1–S4 + baseline key-count assertion)**

Run: `task freshness:check`
Expected: PASS. If S1 fails, the offending file grew past its effective threshold — go back and shrink it (most likely `pipeline.js` or `FactoryFloor.svelte`); do NOT add a baseline entry (the key-count assertion will fail on baseline growth).

- [ ] **Step 6: Manifest validation (a `.sql` migration changed, no kustomize change — still cheap to confirm)**

Run: `task workspace:validate`
Expected: PASS (no manifest structure regressions).

- [ ] **Step 7: Final commit of regenerated artifacts**

```bash
git add website/src/data/test-inventory.json docs/generated docs/code-quality
git commit -m "chore: regenerate test-inventory + freshness artifacts for openspec workflow"
```

- [ ] **Step 8: Confirm clean tree + line budgets one last time**

Run:
```bash
git status --porcelain
wc -l scripts/factory/pipeline.js website/src/components/FactoryFloor.svelte scripts/openspec.sh
```
Expected: clean tree; `pipeline.js` ≤600, `FactoryFloor.svelte` ≤500, `openspec.sh` ≤500.

---

## Self-review notes (spec coverage)

- Slice A (layout + openspec.sh + validate + CI gate `test:openspec`) → Tasks A1-A4. ✅
- Slice B (`awaiting_deploy` end-to-end: TS model B1, payload B2, lane B3, rollup-both-SSOTs B4, pipeline transition B5, scheduling exclusion B6). ✅ Corrected the `schedule.sh:50` mis-citation to `queue.sh` + the dual-SSOT rollup (TS + .sql).
- Slice C (Factory reads `openspec/changes/<slug>/tasks.md`) → Task C1 with legacy fallback. ✅
- Slice D (dev-flow-plan output into openspec) → Task D1. ✅
- Error handling: `validate` fail-closed (A2/A3), `archive` refuses non-`done` (A3), `awaiting_deploy`→`done` only via deploy path (B5). ✅
- Testing matrix from spec §Testing: BATS openspec (A2), Vitest factory-floor bucket (B1), SQL rollup counter (B4), lane (B3). E2E lane is explicitly a follow-up ticket per spec → not in this plan. ✅

## Open questions / risks flagged during planning

1. **Dual rollup SSOT (highest risk):** the cockpit view exists in BOTH `scripts/migrations/2026-06-15-cockpit-rollup-view.sql` AND `website/src/lib/tickets/cockpit-schema.ts` (the one actually executed by `ensureCockpitViews`). They are NOT auto-synced and no test asserts they match. Task B4 edits both, but a future drift is possible. Consider a follow-up that makes the migration generate from the TS constant (out of scope here).
2. **`pipeline.js` at 599/600:** budget is +1 across the whole plan. B5 and C1 each add an import; the plan mitigates by extracting logic to pure modules and (if needed) collapsing both imports onto one line. If the file is even 1 line over after both, the extraction must absorb more. This is the tightest constraint in the plan.
3. **`isWebsite` flag in pipeline.js:** the auto-advance exception needs a reliable website/non-website signal. The deploy agent block already branches on it (`deployStepCmd`), but the exact in-scope variable must be confirmed at implementation time. If absent, derive from the ticket's touched_files (website/** ⇒ website) rather than any domain literal.
4. **Archive delta-merge is minimal:** `_merge_delta` appends ADDED bodies and records MODIFIED/REMOVED as notes rather than doing a structural in-place edit of the SSOT. This is faithful to "delta merged" for ADDED (the common case) but a full MODIFIED/REMOVED applier is future work — acceptable for MVP cutover, flagged for a follow-up.
5. **Scheduling anchor:** spec said `schedule.sh:50`; reality is `queue.sh` (`status='backlog'`) already excludes `awaiting_deploy`. No behavior change needed — locked by a regression test (B6). Confirm with reviewers that no OTHER scheduler path (e.g. a retry/requeue path) re-selects non-backlog statuses.
6. **`update-status` is unvalidated:** the bash path writes any status string, so `awaiting_deploy` "just works" there — but it also means a typo would silently persist. Out of scope to add enum validation, flagged.
