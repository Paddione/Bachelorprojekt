---
title: "half-archive-check-edge-case — Implementation Plan"
ticket_id: T002824
domains: [test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# half-archive-check-edge-case — Implementation Plan

_Ticket: T002824_

## File Structure

```
tests/spec/openspec-workflow/half-archive-uncommitted.bats   (new)
.githooks/pre-commit                                          (changed, 215 -> ~226 lines, not baselined, .sh-adjacent shell budget 800 -> plenty of headroom)
scripts/agent-lock.sh                                          (changed, 667 -> ~680 lines, not baselined, .sh limit 800 -> budget ~133 before change, ~120 after)
openspec/specs/openspec-workflow.md                             (merged delta, no code budget)
```

## Root cause (verified, not assumed)

`scripts/openspec-half-archive-check.sh` (T002428) is a pure filesystem check
(`find` against `openspec/changes/` and `openspec/changes/archive/`) — it has no
git-tree dependency and was reproduced (manually, against a scratch `OPENSPEC_ROOT`
with an uncommitted duplicate slug and no git history at all) to correctly detect
an entirely uncommitted half-archive state and exit 1. The ticket's own hypothesis
("prueft den COMMITTETEN Baum") is therefore not the root cause — do not "fix" the
detection logic, it already works.

The actual gap: the check is invoked from exactly one place in the whole repo —
`Taskfile.yml` task `test:openspec` (consumed by `task test:all` and
`.github/workflows/ci.yml`). No pre-commit hook, no session-hygiene step, and no
part of `scripts/openspec.sh archive` itself calls it. A half state that nobody
happens to run `task test:openspec` against — e.g. because the session that created
it died mid-run and no commit was ever attempted — is invisible until someone
notices by chance (`git status`), exactly as happened on 2026-08-09.

## Tasks

- [ ] **1. Failing test (RED).** Add
      `tests/spec/openspec-workflow/half-archive-uncommitted.bats` — output/exit-code
      verification against the real hook script and the real `agent-lock.sh reap`
      subcommand, run in a sandboxed `OPENSPEC_ROOT`/git repo (no dependency on the
      real `openspec/changes/` tree). Structure: positive anchor first (clean tree
      passes), then the negative case (half-archived tree fails/warns).

  ```bash
  #!/usr/bin/env bats
  # tests/spec/openspec-workflow/half-archive-uncommitted.bats
  # T002824 — the half-archive check must run against a live (uncommitted)
  # working tree at commit-time and during session hygiene, not only in
  # task:openspec/CI. Output-verification: real hook / real reap subcommand,
  # sandboxed git repo + OPENSPEC_ROOT, no source grep.

  setup() {
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
    HOOK="${REPO_ROOT}/.githooks/pre-commit"
    AGENT_LOCK="${REPO_ROOT}/scripts/agent-lock.sh"
    sandbox="${BATS_TEST_TMPDIR}/sandbox"
    mkdir -p "$sandbox"
    cd "$sandbox"
    git init -q
    git config user.email "t@example.com"
    git config user.name "T"
    mkdir -p openspec/changes openspec/specs
    git add -A && git commit -qm init
  }

  _make_half_archive() {
    mkdir -p openspec/changes/dup openspec/changes/archive/2026-01-01-dup
    echo x > openspec/changes/dup/proposal.md
  }

  @test "T002824: pre-commit refuses a commit that leaves a half-archived slug (positive anchor: clean tree passes first)" {
    # Positive anchor — a normal, unrelated staged change must still commit fine.
    echo hello > README.md
    git add README.md
    run env OPENSPEC_ROOT="$sandbox/openspec" bash "$HOOK"
    [ "$status" -eq 0 ]
    git commit -qm "clean commit"

    # Negative case — introduce the half-archive state and try to commit it.
    _make_half_archive
    git add -A
    run env OPENSPEC_ROOT="$sandbox/openspec" bash "$HOOK"
    [ "$status" -ne 0 ]
    printf '%s\n' "$output" | grep -qF "dup"
  }

  @test "T002824: agent-lock.sh reap warns (not fails) on a half-archived slug" {
    _make_half_archive
    run env AGENT_LOCK_DIR="$sandbox/.locks" OPENSPEC_ROOT="$sandbox/openspec" \
      bash "$AGENT_LOCK" reap
    [ "$status" -eq 0 ]
    printf '%s\n' "$output" | grep -qF "dup"
  }
  ```

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/half-archive-uncommitted.bats
  # expected: FAIL (red — neither the pre-commit hook nor `agent-lock.sh reap`
  # invoke scripts/openspec-half-archive-check.sh yet)
  ```

- [ ] **2. Fix-step (GREEN) — pre-commit hook.** In `.githooks/pre-commit`, add an
      unconditional, fail-closed call to `scripts/openspec-half-archive-check.sh`
      before the commit is allowed to proceed. Reuse the script unmodified — pass
      `OPENSPEC_ROOT` through if the caller set it (needed for the sandboxed test
      above; falls back to the script's own `$REPO/openspec` default otherwise).
      Place it near the other fail-closed guards (git-crypt-guard, gitleaks), with a
      short comment referencing T002824 and T002428. On non-zero exit, print the
      script's own diagnostic (already descriptive) and `exit 1`.

- [ ] **3. Fix-step (GREEN) — session hygiene reap.** In `scripts/agent-lock.sh`
      `cmd_reap`, add an advisory (non-fatal) call to
      `scripts/openspec-half-archive-check.sh` after the existing cleanup steps.
      On non-zero exit, print the script's diagnostic to stderr prefixed with
      `AGENT-LOCK:` (matching the existing warning style in `cmd_reap`) but do
      **not** change `cmd_reap`'s own return value — `reap` stays a best-effort
      cleanup command, not a gate.

- [ ] **4. Re-run the failing test — must now pass (GREEN).**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/half-archive-uncommitted.bats
  ```

- [ ] **5. Regression check — existing half-archive-guard tests still pass.**

  ```bash
  tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow
  ```

- [ ] **6. Final Verification.**

  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

## Angrenzend (nicht Teil dieses Plans)

T002813 covers a related but distinct gap on the same archive path: a merged PR
where the declared deliverable never actually landed on `origin/main` (the M10
manual-closure check in CLAUDE.md only covers manual ticket closures, not
auto-merge). The `reap`-based advisory pattern introduced here — running a
structural check proactively during session hygiene rather than waiting for an
explicit CI/task invocation — could structurally extend to a post-merge
deliverable-presence check (e.g. verifying declared `touched_files`/plan deliverables
exist on `origin/main` after a ticket transitions to `done`). Not implemented here;
left for the T002813 plan to evaluate.
