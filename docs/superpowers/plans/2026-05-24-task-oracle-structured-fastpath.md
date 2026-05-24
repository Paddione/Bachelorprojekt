---
title: Task Oracle Structured Fast-Path Implementation Plan
ticket_id: null
domains: []
status: active
pr_number: null
---

# Task Oracle Structured Fast-Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a regex-based fast-path at the top of `scripts/task-oracle.sh` that detects `namespace:action [ENV=X]` structured input and executes the task directly, bypassing the LLM entirely.

**Architecture:** A single bash `=~` check at the script entry point tests the GOAL against a structural regex. On match, the task name is validated against `task --list-all`, ENV is resolved using the existing `:all-prods`/`__BOTH__` sequential-run logic (no duplication), and the task runs. All other input falls through unchanged to the existing Hermes path.

**Tech Stack:** bash, go-task, bats-core

---

### Task 1: Write failing BATS tests

**Files:**
- Create: `tests/unit/task-oracle-fastpath.bats`

- [ ] **Step 1: Create the test file with a fake `task` binary and all test cases**

```bash
# tests/unit/task-oracle-fastpath.bats
#!/usr/bin/env bats
# task-oracle-fastpath.bats — Structured fast-path in task-oracle.sh

load test_helper

ORACLE="${PROJECT_DIR}/scripts/task-oracle.sh"

setup() {
  FAKE_BIN="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$FAKE_BIN"

  # Fake task: handles --list-all, --summary, and execution
  cat > "${FAKE_BIN}/task" <<'TASK'
#!/usr/bin/env bash
if [[ "$1" == "--list-all" ]]; then
  printf '* workspace:deploy:  Deploy workspace services\n'
  printf '* workspace:verify:  Verify workspace\n'
  printf '* website:redeploy:  Rebuild and deploy website\n'
  printf '* feature:website:  Rebuild website on BOTH prod\n'
  printf '* feature:website:all-prods:  All-prods website deploy\n'
  exit 0
fi
if [[ "$1" == "--summary" ]]; then
  printf '\n\nDeploy workspace services (ENV=mentolder|korczewski)\n'
  exit 0
fi
echo "TASK_CALLED: $*"
exit 0
TASK
  chmod +x "${FAKE_BIN}/task"
  export PATH="${FAKE_BIN}:${PATH}"

  # Suppress Hermes — point HERMES at a non-executable so the availability
  # check fails immediately and the oracle never reaches the Hermes block.
  export HERMES=/dev/null
}

@test "structured input with ENV runs task directly" {
  run bash "$ORACLE" "workspace:deploy ENV=mentolder"
  [ "$status" -eq 0 ]
  [[ "$output" == *"TASK_CALLED: workspace:deploy ENV=mentolder"* ]]
}

@test "stderr carries [fast-path] tag for structured input" {
  run bash "$ORACLE" "workspace:deploy ENV=mentolder"
  [ "$status" -eq 0 ]
  [[ "$output" == *"[fast-path]"* ]]
}

@test "structured input without ENV runs task with no ENV override" {
  run bash "$ORACLE" "workspace:deploy"
  [ "$status" -eq 0 ]
  [[ "$output" == *"TASK_CALLED: workspace:deploy"* ]]
  [[ "$output" != *"TASK_CALLED: workspace:deploy ENV="* ]]
}

@test "ENV=both uses all-prods sibling when it exists" {
  run bash "$ORACLE" "feature:website ENV=both"
  [ "$status" -eq 0 ]
  [[ "$output" == *"TASK_CALLED: feature:website:all-prods"* ]]
}

@test "ENV=both without all-prods sibling runs sequentially on both clusters" {
  run bash "$ORACLE" "workspace:deploy ENV=both"
  [ "$status" -eq 0 ]
  [[ "$output" == *"TASK_CALLED: workspace:deploy ENV=mentolder"* ]]
  [[ "$output" == *"TASK_CALLED: workspace:deploy ENV=korczewski"* ]]
}

@test "unknown task name exits 1 with descriptive error" {
  run bash "$ORACLE" "workspace:dploy"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Unknown task"* ]]
  [[ "$output" == *"workspace:dploy"* ]]
}

@test "natural language input does not trigger fast-path" {
  # NL falls through to Hermes (suppressed) → OpenClaw (not running) → exit 1
  run bash "$ORACLE" "deploy the website to mentolder"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Neither Hermes nor OpenClaw"* ]]
}

@test "input with only a namespace (no colon-action) does not trigger fast-path" {
  run bash "$ORACLE" "workspace"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Neither Hermes nor OpenClaw"* ]]
}
```

- [ ] **Step 2: Run the tests — confirm all 8 fail**

```bash
cd /home/patrick/Bachelorprojekt
bats tests/unit/task-oracle-fastpath.bats
```

Expected: all 8 tests FAIL (fast-path code does not exist yet). If any pass accidentally, investigate before continuing.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/unit/task-oracle-fastpath.bats
git commit -m "test(oracle): failing BATS tests for structured fast-path"
```

---

### Task 2: Implement the fast-path in task-oracle.sh

**Files:**
- Modify: `scripts/task-oracle.sh` — insert fast-path block after line 6 (after `GOAL=` assignment, before `REPO=`)

- [ ] **Step 1: Read the current file to confirm the insertion point**

```bash
head -15 /home/patrick/Bachelorprojekt/scripts/task-oracle.sh
```

Expected output shows `GOAL=` on line 6, `REPO=` on line 7, `MODEL=` on line 8. The fast-path block goes between lines 6 and 7.

- [ ] **Step 2: Insert the fast-path block**

Open `scripts/task-oracle.sh` and insert the following block immediately after the `GOAL=` line (line 6) and before the `REPO=` line:

```bash
# ── Structured fast-path: skip LLM for "namespace:action [ENV=X]" input ──────
# Matches e.g. "workspace:deploy ENV=mentolder", "feature:website", "brett:build ENV=both"
FASTPATH_REGEX='^([a-z][a-z0-9_-]*:[a-z][a-z0-9_:-]*)([[:space:]]+ENV=(dev|mentolder|korczewski|both))?[[:space:]]*$'
if [[ "$GOAL" =~ $FASTPATH_REGEX ]]; then
  FP_TASK="${BASH_REMATCH[1]}"
  FP_ENV="${BASH_REMATCH[3]}"   # "dev"|"mentolder"|"korczewski"|"both"|""

  REPO_FP="/home/patrick/Bachelorprojekt"

  # Validate task exists in the Taskfile
  set +o pipefail
  VALID_FP=$(cd "$REPO_FP" && task --list-all 2>/dev/null \
    | grep '^\* ' | sed 's/^\* //' \
    | awk '{n=split($0,p,/:  +/); if(n>=2) print p[1]}')
  set -o pipefail

  if ! echo "$VALID_FP" | grep -qxF "$FP_TASK"; then
    echo "✗ Unknown task: '${FP_TASK}' — run 'task --list-all' to see valid tasks" >&2
    exit 1
  fi

  FP_FINAL="$FP_TASK"
  FP_EXEC_ENV=""

  if [[ "$FP_ENV" == "both" ]]; then
    ALL_PRODS="${FP_TASK}:all-prods"
    if echo "$VALID_FP" | grep -qxF "$ALL_PRODS"; then
      FP_FINAL="$ALL_PRODS"
      echo "→ [fast-path] Using :all-prods variant: ${FP_FINAL}" >&2
    else
      FP_EXEC_ENV="__BOTH__"
    fi
  elif [[ -n "$FP_ENV" ]]; then
    FP_EXEC_ENV="ENV=${FP_ENV}"
  fi

  TASK_DESC_FP=$(cd "$REPO_FP" && task --summary "$FP_FINAL" 2>/dev/null | sed -n '3p' || true)
  echo "→ [fast-path] Task: ${FP_FINAL}${FP_EXEC_ENV:+  ${FP_EXEC_ENV}}" >&2
  [[ -n "$TASK_DESC_FP" ]] && echo "  ${TASK_DESC_FP}" >&2

  if [[ "${FP_EXEC_ENV:-}" == "__BOTH__" ]]; then
    echo "→ Running on mentolder then korczewski..." >&2
    cd "$REPO_FP" && task "$FP_FINAL" ENV=mentolder
    cd "$REPO_FP" && task "$FP_FINAL" ENV=korczewski
  else
    # shellcheck disable=SC2086
    cd "$REPO_FP" && task "$FP_FINAL" ${FP_EXEC_ENV:-}
  fi
  exit $?
fi
# ─────────────────────────────────────────────────────────────────────────────
```

Note: `REPO_FP` is a local variable to avoid colliding with the `REPO=` declaration that follows. After the fast-path block, `REPO=` on the next line still sets the module-level variable for the Hermes path.

- [ ] **Step 3: Verify the file passes bash syntax check**

```bash
bash -n /home/patrick/Bachelorprojekt/scripts/task-oracle.sh
```

Expected: no output, exit 0.

- [ ] **Step 4: Commit the implementation**

```bash
git add scripts/task-oracle.sh
git commit -m "feat(oracle): structured fast-path bypasses LLM for namespace:action [ENV=X] input"
```

---

### Task 3: Run tests and verify

**Files:** none (verification only)

- [ ] **Step 1: Run the full BATS test suite for the fast-path**

```bash
cd /home/patrick/Bachelorprojekt
bats tests/unit/task-oracle-fastpath.bats
```

Expected: all 8 tests pass. If any fail, check:
- The fake `task` binary format: `* ns:action:  description` (colon + 2 spaces before description)
- The BASH_REMATCH indices: `[1]` = task name, `[3]` = ENV value (group 2 is the full ` ENV=X` clause)
- `set -euo pipefail` interactions around `grep -qxF` (add `|| true` if needed)

- [ ] **Step 2: Run the existing scripts syntax test to confirm no regression**

```bash
bats tests/unit/scripts.bats --filter "all scripts"
```

Expected: PASS.

- [ ] **Step 3: Manual smoke test — structured form**

```bash
bash /home/patrick/Bachelorprojekt/scripts/task-oracle.sh 'cluster:status'
```

Expected stderr: `→ [fast-path] Task: cluster:status` followed by actual task output. No Hermes invocation.

- [ ] **Step 4: Manual smoke test — NL still works**

Verify Hermes is running, then:

```bash
bash /home/patrick/Bachelorprojekt/scripts/task-oracle.sh 'show cluster status'
```

Expected: Hermes path executes (stderr shows namespace selection, no `[fast-path]` tag).

- [ ] **Step 5: Manual smoke test — typo exits cleanly**

```bash
bash /home/patrick/Bachelorprojekt/scripts/task-oracle.sh 'cluster:statuss'
```

Expected: exit 1, stderr `✗ Unknown task: 'cluster:statuss' — run 'task --list-all' to see valid tasks`.

- [ ] **Step 6: Final commit if any fixup was needed; otherwise done**

```bash
git log --oneline -3
```

Confirm the two commits from Tasks 1 and 2 appear cleanly. No fixup needed if all tests passed first time.
