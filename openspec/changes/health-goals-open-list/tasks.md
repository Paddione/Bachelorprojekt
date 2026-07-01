---
title: "health-goals-open-list — Offene-Ziele-Report + Ticket-Vorschlag"
ticket_id: "T001406"
domains: [scripts, testing]
status: planning
---

# health-goals-open-list — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/health-goals-update.sh` prints, after the existing Prio-C table-refresh report, a list of every Prio-C goal whose marker is `⚠` (target not met) plus a ready-to-run `scripts/ticket.sh create …` suggestion per open goal.

**Architecture:** Extend the existing Python heredoc inside `health-goals-update.sh`. The per-row `ok`/`marker` computation is decoupled from the existing "value changed" gate so it also runs for unchanged rows; matching `⚠` rows are collected into an `open_goals` list and rendered as an extra stdout block after the current report. A minimal env-var seam (`HG_GOALS_FILE`, pre-supplied `HG_VALUES_FILE`) makes the script testable against a fixture without invoking the live measurement script.

**Tech Stack:** Bash + embedded Python 3 (`python3 - … <<'PY'`), BATS for tests.

## Global Constraints

- No new CLI flag; the open-goals report runs unconditionally, including under `--dry-run` (dry-run only suppresses the write to `.claude/lib/goals.md`).
- No automatic ticket creation and no interactive prompts — the script stays non-interactive for agent/CI contexts.
- No change to the existing table-write behaviour (parsing, marker logic, exit codes) or to `scripts/health-goals-check.sh`.
- Generated `ticket.sh create` command omits `--brand` (defaults to `mentolder` in `create.sh`) — no brand-domain literal appears in code (S3).
- `cmp_op` symbols are rendered in ASCII (`<=`/`>=`/`==`) in the ticket description to avoid copy-paste encoding surprises.

## Delta / Requirement Reference

The requirement and its four scenarios are the SSOT in
`openspec/changes/health-goals-open-list/specs/t001358-sec05-health-goals.md`
(operation: `## ADDED Requirements` → `### Requirement: Open-Goals Report with Ticket Suggestion`). This plan implements them; each scenario maps to a BATS case in Task 1:

- Scenario "Open goal with unchanged value is listed" → Task 1 test `unchanged open goal is listed`.
- Scenario "Ticket command suggestion is well-formed" → Task 1 test `ticket command is well-formed`.
- Scenario "No open goals" → Task 1 test `no open goals prints the empty line`.
- Scenario "Report is identical under --dry-run" → Task 1 test `report block is identical under dry-run`.

## File Structure

- Modify: `scripts/health-goals-update.sh` — add the `HG_GOALS_FILE` / pre-supplied `HG_VALUES_FILE` seam, decouple the `ok`/`marker` computation from the change gate, collect `open_goals`, and print the report block.
- Create: `tests/spec/repo-health-goals.bats` — BATS suite driving the script against a fixture `goals.md` + fixture values file.

## Pre-flight — Plan-Quality-Gates (S1–S4)

- `scripts/health-goals-update.sh`: live `wc -l` = 120; not baselined (`jq -r '."S1:scripts/health-goals-update.sh".metric // "nicht-baselined"'` → `nicht-baselined`) → effective threshold = static `.sh` limit 500 → **Budget 380**. Ample room; the report block adds ~35 lines.
- `tests/spec/repo-health-goals.bats`: new file. S1 is **not gated for `.bats`** (no `.bats` entry in `docs/code-quality/gates.yaml` `s1.limits`, and `_ext_limit` in `scripts/plan-lint.sh` returns 0 for it) → no line budget applies.
- S2 (import cycles): not applicable — Bash + embedded Python, no TS/JS import graph.
- S3 (hardcoded hostnames): none introduced; the generated command carries no brand-domain literal.
- S4 (orphans): the new `.bats` file lives under `tests/**/*.bats`, already listed in `gates.yaml` `s4.reference_sources`, and references the existing script — no orphan risk for either file.

---

### Task 1: Failing BATS suite for the open-goals report

**Files:**
- Create: `tests/spec/repo-health-goals.bats`

**Interfaces:**
- Consumes: `scripts/health-goals-update.sh` invoked with env `HG_GOALS_FILE=<fixture goals.md>` and `HG_VALUES_FILE=<fixture values file>` (the seam added in Task 2). Values-file line format: `<gid> <actual> <cmp_op> <target>` with `cmp_op ∈ {le,ge,eq}`.
- Produces: nothing consumed by later tasks; this is the red test that Task 2 turns green.

- [ ] **Step 1: Write the failing test file**

```bash
cat > tests/spec/repo-health-goals.bats <<'BATS'
#!/usr/bin/env bats
# tests/spec/repo-health-goals.bats
# SSOT: openspec/specs/t001358-sec05-health-goals.md
# Covers: Open-Goals Report with Ticket Suggestion (health-goals-update.sh).

SCRIPT="scripts/health-goals-update.sh"

setup() {
  REPO_ROOT="$(git rev-parse --show-toplevel)"
  cd "$REPO_ROOT"
  TMP="$(mktemp -d)"
  GOALS="$TMP/goals.md"
  VALUES="$TMP/values.txt"
}

teardown() {
  rm -rf "$TMP"
}

# Fixture with one open (⚠) row and one green (✓) row.
_write_mixed_fixture() {
  cat > "$GOALS" <<'MD'
| **ID** | Ziel | Aktuell | Target | Basis-Messung |
|--------|------|---------|--------|---------------|
| **G-AGENTIC17** | Command-Orphans via S4 | 3 ⚠ | ≤ 0 | `echo 3` |
| **G-RH01** | Gate-Violations | 26 ✓ | ≤ 30 | `echo 26` |
MD
  cat > "$VALUES" <<'VAL'
G-AGENTIC17 3 le 0
G-RH01 26 le 30
VAL
}

# Fixture with only green rows.
_write_green_fixture() {
  cat > "$GOALS" <<'MD'
| **ID** | Ziel | Aktuell | Target | Basis-Messung |
|--------|------|---------|--------|---------------|
| **G-RH01** | Gate-Violations | 26 ✓ | ≤ 30 | `echo 26` |
MD
  cat > "$VALUES" <<'VAL'
G-RH01 26 le 30
VAL
}

@test "unchanged open goal is listed" {
  _write_mixed_fixture
  run env HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" bash "$SCRIPT" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Offene Ziele (Target verfehlt):"* ]]
  [[ "$output" == *"G-AGENTIC17"* ]]
  [[ "$output" == *"Target: <= 0"* ]]
}

@test "ticket command is well-formed" {
  _write_mixed_fixture
  run env HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" bash "$SCRIPT" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"scripts/ticket.sh create"* ]]
  # exactly one of each required flag in the suggestion
  [ "$(grep -c -- '--type' <<<"$output")" -eq 1 ]
  [ "$(grep -c -- '--title' <<<"$output")" -eq 1 ]
  [ "$(grep -c -- '--description' <<<"$output")" -eq 1 ]
  [ "$(grep -c -- '--priority' <<<"$output")" -eq 1 ]
  [[ "$output" == *'--title "Health-Goal: G-AGENTIC17'* ]]
}

@test "no open goals prints the empty line" {
  _write_green_fixture
  run env HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" bash "$SCRIPT" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"keine — alle Prio-C-Gates grün."* ]]
  [[ "$output" != *"scripts/ticket.sh create"* ]]
}

@test "report block is identical under dry-run" {
  _write_mixed_fixture
  run env HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" bash "$SCRIPT" --dry-run
  dry="$(sed -n '/Offene Ziele/,$p' <<<"$output")"
  _write_mixed_fixture
  run env HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" bash "$SCRIPT"
  normal="$(sed -n '/Offene Ziele/,$p' <<<"$output")"
  [ "$dry" = "$normal" ]
}
BATS
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `bats tests/spec/repo-health-goals.bats`
Expected: FAIL — the script has no `HG_GOALS_FILE` seam yet and prints no "Offene Ziele" block, so the assertions do not match (the first assertion `expected: FAIL`).

- [ ] **Step 3: Commit the red test**

```bash
git add tests/spec/repo-health-goals.bats
git commit -m "test: add failing open-goals report spec for health-goals-update"
```

---

### Task 2: Implement the open-goals report + testability seam

**Files:**
- Modify: `scripts/health-goals-update.sh`

**Interfaces:**
- Consumes: fixture env vars from Task 1 (`HG_GOALS_FILE`, `HG_VALUES_FILE`).
- Produces: the "Offene Ziele (Target verfehlt):" stdout block and, per open goal, a `scripts/ticket.sh create --type task --title … --description … --priority mittel` suggestion.

- [ ] **Step 1: Add the fixture seam (goals-file override + pre-supplied values)**

Replace the current block (lines 27–36):

```bash
GOALS_FILE=".claude/lib/goals.md"
VALUES_FILE="$(mktemp)"
trap 'rm -f "$VALUES_FILE"' EXIT

HG_VALUES_FILE="$VALUES_FILE" bash scripts/health-goals-check.sh "${CHECK_ARGS[@]}" >/dev/null || true

if [ ! -s "$VALUES_FILE" ]; then
  echo "keine Messwerte erhalten — abgebrochen" >&2
  exit 1
fi
```

with:

```bash
GOALS_FILE="${HG_GOALS_FILE:-.claude/lib/goals.md}"

# Testability seam: if the caller pre-supplies a non-empty HG_VALUES_FILE we
# reuse it verbatim (fixture/CI); otherwise mktemp + run the live check script.
if [ -n "${HG_VALUES_FILE:-}" ] && [ -s "${HG_VALUES_FILE:-}" ]; then
  VALUES_FILE="$HG_VALUES_FILE"
else
  VALUES_FILE="$(mktemp)"
  trap 'rm -f "$VALUES_FILE"' EXIT
  HG_VALUES_FILE="$VALUES_FILE" bash scripts/health-goals-check.sh "${CHECK_ARGS[@]}" >/dev/null || true
fi

if [ ! -s "$VALUES_FILE" ]; then
  echo "keine Messwerte erhalten — abgebrochen" >&2
  exit 1
fi
```

- [ ] **Step 2: Collect open goals in the parse loop**

Inside the Python heredoc, add an `open_goals` accumulator next to `changed`/`skipped_format`/`excluded`:

```python
changed = []
skipped_format = []
excluded = []
open_goals = []
```

Then, in the row loop, move the `ok`/`marker` computation **before** the `old_val == actual` change-gate so it runs for every measured row, and collect `⚠` rows. Replace the block from `old_val = cm.group(1)` down to `changed.append(...)`:

```python
    old_val = cm.group(1)
    ok = {
        "le": int(actual) <= int(target),
        "ge": int(actual) >= int(target),
        "eq": int(actual) == int(target),
    }.get(cmp_op, False)
    marker = "✓" if ok else "⚠"
    if not ok:
        open_goals.append((gid, ziel_cell.strip(), actual, cmp_op, target))
    if old_val == actual:
        continue
    lines[i] = f"| **{gid}** |{ziel_cell}| {actual} {marker} |{target_cell}|{rest_cell}|\n"
    changed.append((gid, old_val, actual, ok))
```

- [ ] **Step 3: Print the report block**

After the `excluded` block (before the `if changed and not dry_run:` write block), insert:

```python
CMP_SYMBOL = {"le": "<=", "ge": ">=", "eq": "=="}

def _sh_escape(text):
    return text.replace("\\", "\\\\").replace('"', '\\"').replace("`", "\\`")

print("\nOffene Ziele (Target verfehlt):")
if not open_goals:
    print("  keine — alle Prio-C-Gates grün.")
else:
    for gid, ziel_text, actual, cmp_op, target in sorted(open_goals):
        sym = CMP_SYMBOL.get(cmp_op, cmp_op)
        title = _sh_escape(f"Health-Goal: {gid} — {ziel_text}")
        desc = _sh_escape(
            f"Aktuell: {actual}, Target: {sym} {target}. Siehe .claude/lib/goals.md#{gid}"
        )
        print(f"  ⚠ {gid} — {ziel_text}: {actual} (Target: {sym} {target})")
        print("    scripts/ticket.sh create --type task \\")
        print(f'      --title "{title}" \\')
        print(f'      --description "{desc}" \\')
        print("      --priority mittel")
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `bats tests/spec/repo-health-goals.bats`
Expected: PASS (all four cases green).

- [ ] **Step 5: Commit the implementation**

```bash
git add scripts/health-goals-update.sh
git commit -m "feat: print open-goals report with ticket suggestion in health-goals-update"
```

---

### Task 3: Verify, regenerate freshness artifacts, and refresh test inventory

**Files:**
- Modify: `website/src/data/test-inventory.json` (regenerated by `task test:inventory` because a new BATS file was added).

**Interfaces:**
- Consumes: the committed changes from Tasks 1–2.
- Produces: green CI-equivalent gates and an up-to-date test inventory.

- [ ] **Step 1: Regenerate the test inventory (new BATS file was added)**

Run: `task test:inventory`
This updates `website/src/data/test-inventory.json`; CI fails if it drifts from the committed version.

- [ ] **Step 2: Run the mandatory gate commands**

```bash
task test:changed          # targeted tests for changed domains (BATS selection + quality)
task freshness:regenerate  # refresh generated artifacts (test-inventory, repo-index, …)
task freshness:check       # CI equivalent: freshness + quality:check (S1–S4 ratchet) + baseline assertion
```

Expected: all three exit 0.

- [ ] **Step 3: Confirm the plan-lint gate on this plan**

Run: `bash scripts/plan-lint.sh openspec/changes/health-goals-open-list/tasks.md`
Expected: `PLAN-LINT: PASS`.

- [ ] **Step 4: Commit the regenerated inventory + any freshness artifacts**

```bash
git add website/src/data/test-inventory.json
git commit -m "chore: regenerate test inventory for repo-health-goals spec"
```
