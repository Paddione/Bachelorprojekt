---
title: wakeup-dispatcher-bridge-wiring
ticket_id: T001845
domains: [factory, tooling]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# wakeup-dispatcher-bridge-wiring — Implementation Plan

Wire the already-built-but-unwired `scripts/factory/dispatcher-bridge.sh` into
`scripts/factory/wakeup.sh` so the per-tick dispatcher call no longer forces the model to
emit a `Workflow({scriptPath:'scripts/factory/dispatcher.js'},...)` tool call — the call form
that broke against the local `qwythos-9b-v2` model's non-standard XML tool-call syntax
(`Unexpected token '{'. import call expects one or two arguments.`, observed live
2026-07-15 ~02:06 CEST, T001845). Build order: **Task 1 (wakeup.sh wiring + testability env
var) → Task 2 (retrofit the now-inaccurate pre-existing FA-SF-41 assertions) → Task 3
(verify)**. Task 1 must land first since Task 2's edits only make sense once the new
behavior exists to assert against.

## File Structure

Modified files:
- `scripts/factory/wakeup.sh` — Ist 218 · unbaselined · `.sh` limit 500 → **Budget ~282**
  (comfortable; net change is roughly -15 lines: remove ~26-line refusal-retry block, add
  ~11-line bridge-invocation block).
- `tests/spec/software-factory.bats` — Ist 3487 · unbaselined · `.bats` has no extension
  entry in `docs/code-quality/gates.yaml` `s1.limits` (verified: `jq -r '.s1.limits' docs/code-quality/gates.yaml` has no `.bats` key) → no S1 budget applies to this file.

## Task 1 — Wire dispatcher-bridge.sh into wakeup.sh, add FACTORY_DISPATCHER_BRIDGE override

**Files:** `scripts/factory/wakeup.sh`

**Failing test (already written and confirmed red on 2026-07-15):**
`tests/spec/software-factory.bats` — new test `"T001845: wakeup.sh dispatches the tick via
dispatcher-bridge.sh instead of forcing the model to call Workflow(dispatcher.js)"` (inserted
after the existing `"FA-SF-41: wakeup.sh names dispatcher.js as the nested Workflow script"`
test). Run to confirm red **before** starting this task:
```bash
bats -f "T001845" tests/spec/software-factory.bats
```
expected: FAIL — `[ -f "${bridgefile}" ]' failed` (bridge-stub never invoked; wakeup.sh
still forces the claude-stub with a `Workflow` prompt instead).

**Implementation:**

1. Add a new env knob next to the existing `CLAUDE_BIN`/`LOCKFILE` overrides (around line
   41-44), following the exact same `FACTORY_*` override pattern already used for
   `FACTORY_CLAUDE_BIN` (this is what makes the new test's `FACTORY_DISPATCHER_BRIDGE`
   stub-injection work — without it the script always resolves the real repo path and the
   isolated tmp-repo test can never point it at a stub):
   ```bash
   DISPATCHER_BRIDGE="${FACTORY_DISPATCHER_BRIDGE:-${REPO}/scripts/factory/dispatcher-bridge.sh}"
   ```
   Also add a line to the header env-knobs comment block (lines 18-26) documenting
   `FACTORY_DISPATCHER_BRIDGE` alongside the other knobs.

2. Delete the now-redundant `DISPATCHER_BRIDGE="${REPO}/scripts/factory/dispatcher-bridge.sh"`
   assignment currently at line 109 (superseded by step 1's env-overridable version, moved up
   near the other overrides).

3. Replace the `PROMPT="Run the Software Factory dispatcher now. Call the Workflow tool
   exactly like this ..."` construction (lines 111-122) and the entire `claude -p`
   refusal-retry loop (lines 172-197: `CLAUDE_OUT`, `REFUSAL_RETRIED`, `RUN_PROMPT`, the
   `while true` loop invoking `"${CLAUDE_BIN}" -p "${RUN_PROMPT}" --allowedTools
   "Workflow,..."`, and the refusal-detection `grep -qiE`) with a direct bridge invocation:
   ```bash
   echo "wakeup.sh: dispatching tick #${TICK} via dispatcher-bridge.sh" >&2
   set +e
   bash "${DISPATCHER_BRIDGE}" "${PREP_FILE}" $([[ "${DRY_RUN}" == "true" ]] && echo --dry-run) \
     | sed "s/^/[dispatcher-bridge] /" >&2
   TICK_EXIT=${PIPESTATUS[0]}
   set -e
   rm -f "${PREP_FILE}"
   ```
   Keep the existing `if [[ ${TICK_EXIT} -ne 0 ]]; then ... exit ${TICK_EXIT}; fi` block
   (line 194-197) unchanged — it already consumes `TICK_EXIT` generically and needs no edit.

4. `dispatcher-bridge.sh` already reads `$1` as the prep-file path and a trailing `--dry-run`
   flag (see its own `for arg; do case "$arg" in --dry-run) DRY_RUN=true;; esac; done`), so no
   changes to `dispatcher-bridge.sh` itself are needed for this task.

**Verify:**
```bash
bats -f "T001845" tests/spec/software-factory.bats
```
expected: PASS.

## Task 2 — Retrofit pre-existing FA-SF-41 assertions that encoded the old forced-Workflow behavior

**Files:** `tests/spec/software-factory.bats`

The following pre-existing tests assert the *old* behavior (wakeup.sh always calls
`claude -p` with `Workflow` in the prompt for the tick itself) and will regress to failing
once Task 1 lands, because the tick path no longer touches `claude`/`Workflow` at all for an
empty queue:

- `"FA-SF-41: wakeup.sh calls headless claude with the Workflow tool allowlisted"` (grep-based,
  asserts `wakeup.sh` source contains `Workflow` — this one still passes structurally IF
  `dispatcher-bridge.sh`'s own per-ticket `Workflow(pipeline.js)` string literal is still
  reachable via the `DISPATCHER_BRIDGE` variable name in `wakeup.sh` — it is NOT, since that
  string now lives only in `dispatcher-bridge.sh`. Update this test to grep
  `dispatcher-bridge.sh` instead of `wakeup.sh` for the `Workflow` + `--allowedTools`
  assertions, and split the `"${CLAUDE_BIN}" -p` assertion out since `wakeup.sh` no longer
  contains that literal directly — assert `DISPATCHER_BRIDGE` invocation there instead.
- `"FA-SF-41: wakeup.sh actually forwards -p + --allowedTools + --permission-mode to the
  exec'd claude (not dropped by a gamed comment)"` — this test's premise (wakeup.sh directly
  invokes the claude-stub for the tick) no longer holds. Replace its assertions with the new
  T001845 test's shape (bridge-stub invoked, claude-stub NOT invoked) — this test becomes
  redundant with the new T001845 test; delete it rather than duplicate, per repo convention of
  not keeping tests that assert dead behavior.
- `"FA-SF-41: wakeup.sh threads the dry_run policy into the dispatcher prompt"` (grep `dry_run`
  in `wakeup.sh`) — still true post-fix (Task 1 step 3 references `DRY_RUN` in the bridge
  invocation), no change needed. Verify with `grep -F 'dry_run' scripts/factory/wakeup.sh`
  before assuming — if the exact token `dry_run` (lowercase-with-underscore, not `DRY_RUN`) no
  longer appears verbatim, update the grep pattern to `DRY_RUN` to match the actual variable
  name used post-fix.
- `"FA-SF-41: wakeup.sh names dispatcher.js as the nested Workflow script"` (grep
  `scripts/factory/dispatcher.js` in `wakeup.sh`) — this string moves to
  `dispatcher-bridge.sh`'s own per-ticket pipeline references and to nothing dispatcher.js
  specifically anymore in `wakeup.sh` (dispatcher.js is now invoked transitively via
  `dispatcher-bridge.sh`'s bash logic, not named as a literal in `wakeup.sh`). Update this
  test to grep for `dispatcher-bridge.sh` in `wakeup.sh` instead (asserting wakeup.sh still
  references the bridge script, which is the current indirection point), OR delete it if
  redundant with `"FA-SF-41: wakeup.sh actually forwards ..."` — confirm no duplicate
  coverage before deleting either.

**Verify:**
```bash
bats tests/spec/software-factory.bats
```
expected: FAIL initially (pre-existing tests red against Task-1-modified `wakeup.sh`) before
this task's edits, PASS after.

Run `task test:inventory` after these test edits and commit the regenerated
`website/src/data/test-inventory.json` alongside, per the repo's CI test-inventory gate.

## Task 3 — Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
