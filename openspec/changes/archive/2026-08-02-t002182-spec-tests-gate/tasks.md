---
title: "t002182-spec-tests-gate — Implementation Plan"
ticket_id: T002182
domains: [test, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002182-spec-tests-gate — Implementation Plan

_Ticket: T002182_

## Context (verified during planning)

- `tests/spec/` has **132** `.bats` files (`find tests/spec -name '*.bats' | wc -l`).
- `.github/workflows/ci.yml` job `test-factory` (status check name
  **„Factory + OpenSpec + Guards"**) currently runs only 4 of them explicitly:
  `software-factory.bats` (L177), `agent-library.bats` (L183),
  `mcp-tooling.bats` (L186), `ci-cd.bats` (L200).
- `"Factory + OpenSpec + Guards"` **is already** a required status check on
  `main` (verified via `gh api repos/Paddione/Bachelorprojekt/branches/main/protection
  --jq '.required_status_checks.contexts'`) — no branch-protection change
  needed, only the job content changes.
- `Taskfile.yml` already has `test:spec` (L712–716): runs
  `tests/spec/*.bats` fully, parallelized, with a best-effort
  `test:spec:build-mcp-runner` pre-step for the Go-built `mcp-task-runner`
  binary.
- Local full-suite run (`./tests/unit/lib/bats-core/bin/bats -j$(nproc)
  --no-parallelize-within-files tests/spec/*.bats`) → 1708 assertions,
  **2 failing**:
  - `image-drift.bats` / `G-IMG02: keine curlimages/curl Drift-Tags …` — a
    real, currently-undetected regression (file not in any required check
    today). Needs its own bug ticket before/at gate cutover.
  - `software-factory.bats` / `FA-SF-72 … eval.mjs --replay --dry-run` — failed
    only because this worktree's local `main` was behind `origin/main`
    (`worktree-create.sh` auto-sync aborted). Re-verify against a clean
    checkout before treating as a real regression; this file already runs in
    the required job today, so if it were a real regression it should already
    be red on `main`.
- `test-factory` job installs Node + task, but **no Go** — `mcp-task-runner.bats`
  has no skip-guard for a missing `/usr/local/bin/mcp-task-runner` binary, so
  a fresh runner would hard-fail those cases without a Go toolchain to build it.

## File Structure

```
.github/workflows/ci.yml                    # test-factory job: replace the 4 enumerated
                                             # bats invocations with the full tests/spec/*.bats
                                             # glob (via `task test:spec` or equivalent);
                                             # add actions/setup-go; review timeout-minutes
tests/spec/ci-cd.bats                       # new guard assertion: ci.yml invokes the full
                                             # tests/spec/*.bats glob, not an enumerated list
openspec/specs/ci-cd.md                     # merge the ADDED requirement from this change's
                                             # delta spec on archive
website/src/data/test-inventory.json        # regenerate if `task test:inventory` output changes
docs/generated/**                           # regenerate via `task freshness:regenerate` if
                                             # CI-graph/inventory artifacts drift
```

## Tasks

- [ ] **T1 — Baseline & bug ticket for the pre-existing image-drift regression.**
      Re-run the full `tests/spec/*.bats` suite against a clean `origin/main`
      checkout (not this worktree) to confirm `image-drift.bats` /
      `G-IMG02: curlimages/curl` is a genuine regression and not worktree
      noise. File a `type=bug` ticket for it (`bash scripts/ticket.sh create
      --type bug --title "..."`) per the Bug-Triage-Konvention (CFR-Gate
      G-DORA03). Fix it or explicitly quarantine the single assertion with a
      documented `skip` referencing the bug ticket — the gate must not open
      red on day one.

- [ ] **T2 — RED: guard assertion in `tests/spec/ci-cd.bats`.** Add a BATS
      test asserting `.github/workflows/ci.yml`'s `test-factory` job invokes
      the full `tests/spec/*.bats` glob (e.g. grep for `test:spec` task
      invocation or the literal glob, and assert it does NOT instead list a
      fixed set of `.bats` filenames). Must FAIL on the current branch
      (current job still lists 4 explicit files).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
# expected: FAIL (red — full-glob invocation not wired up yet)
```

- [ ] **T3 — GREEN: wire the full glob into `test-factory`.** Replace the
      four enumerated `Factory BATS` / `Agent library guardrail` / `MCP
      tooling guardrail` / `CI/CD pipeline guardrail` steps with a single
      step running `task test:spec` (or the equivalent
      `tests/spec/*.bats` glob invocation), keeping `tests/local/FA-AR-*.bats`
      alongside it as today. Re-run T2's guard test — must now PASS.

- [ ] **T4 — Go toolchain for `mcp-task-runner`.** Add an `actions/setup-go`
      step to `test-factory` (pinned version, matching `mcp-task-runner/go.mod`)
      before the spec suite step, so `task test:spec:build-mcp-runner` builds
      the binary fresh instead of silently no-op'ing on a runner with no
      pre-installed binary.

- [ ] **T5 — Timeout headroom.** Measure the full-suite wall-clock time on a
      representative run (CI runners are typically 2 vCPU; this environment's
      local run may be faster). Raise `test-factory`'s `timeout-minutes`
      (currently 10) if the measured time plus normal variance risks
      exceeding it.

- [ ] **T6 — Regenerate derived artifacts.** Run `task test:inventory` and
      `task freshness:regenerate` / `task freshness:check`; commit any diffs
      in `website/src/data/test-inventory.json` or `docs/generated/**`
      alongside the workflow change.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** T2 above.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** T3–T4 above. The BATS test from T2 must now pass,
      and a full local `tests/spec/*.bats` run must be clean (module the
      quarantined/fixed T1 case).

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
