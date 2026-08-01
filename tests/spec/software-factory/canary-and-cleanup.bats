#!/usr/bin/env bats
# tests/spec/software-factory/canary-and-cleanup.bats
# SSOT: openspec/specs/software-factory.md
#
# [T002503] Aufgeteilt aus tests/spec/software-factory.bats. Jene Sammeldatei hielt
# 495 der ~2300 Spec-Tests in einer Datei und war mit --no-parallelize-within-files
# unteilbar: sie bildete mit 115s den Boden jedes CI-Shards, in dem sie lag.
#
# Der Split ist ein VERSCHIEBEN, kein Kopieren — die Quelldatei ist entfernt.
# T002427/T002421: eine frueher zurueckgelassene Kopie erzeugte doppelte Testnamen,
# ein gefilterter Lauf sah gruen aus, waehrend `task test:factory` ueber die
# veraltete Fassung rot lief.
#
# Gemeinsame Variablen, _skip_if_no_db und Setup/Teardown liegen in _sf_common.bash.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

# ── FA-SF-38-canary ─────────────────────────────────────────────#
# FA-SF-38 — Layer-4 canary/rollback contract (observe_prod in feature-promote.sh)
CANARY_SCRIPT="$BATS_TEST_DIRNAME/../../../scripts/feature-promote.sh"
PHASES_SCRIPT="$BATS_TEST_DIRNAME/../../../scripts/lib/promote-phases.sh"

@test "FA-SF-38: feature-promote.sh is syntactically valid bash" {
  run bash -n "$CANARY_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod() exists" {
  run grep -qE '^observe_prod\(\)' "$PHASES_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod targets the LIVE site, not dev" {
  run grep -E 'web\.\$\{?brand|web\.\$\{cluster|web\.mentolder\.de|web\.korczewski\.de' "$PHASES_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod captures pre-deploy revision before rollback" {
  run grep -qE 'rollout history|--to-revision' "$PHASES_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-38: observe_prod context comes from env-resolve, never dead prod_ctx" {
  run grep -qE 'env-resolve\.sh|ENV_CONTEXT' "$PHASES_SCRIPT"
  [ "$status" -eq 0 ]
}

# ── FA-SF-39-canary-wire ────────────────────────────────────────#
# FA-SF-39-canary-wire — Deploy-phase canary wiring in pipeline.js
PJS="$BATS_TEST_DIRNAME/../../../scripts/factory/pipeline.mjs"

@test "FA-SF-39-wire: pipeline.js lints clean" {
  run node --check "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: Deploy invokes observe_prod per brand" {
  # observe_prod lives in buildDeployPrompt (pipeline-partials.cjs) since T002074.
  run grep -qE 'observe_prod' "$PJS" "$PARTIALS_MOD"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: canary-red turns feature flag OFF via ticket.sh" {
  run grep -qE 'feature-flag set .*--enabled false' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: canary-red fires PushNotification" {
  run grep -qE 'canary|Canary' "$PJS"
  [ "$status" -eq 0 ]
  run grep -qE 'PushNotification' "$PJS"
  [ "$status" -eq 0 ]
}

@test "FA-SF-39-wire: both brands observed (mentolder + korczewski)" {
  run grep -qE 'mentolder' "$PJS"
  [ "$status" -eq 0 ]
  run grep -qE 'korczewski' "$PJS"
  [ "$status" -eq 0 ]
}

# ── FA-SF-40-provision ──────────────────────────────────────────#
# FA-SF-40: adaptive agent-provisioning (offline, pure function). Wraps the
# node:test suite and asserts the pure-module contract used by pipeline.js.

@test "FA-SF-40: provision.js exists and is syntactically valid ESM" {
  [ -f "$PROVISION_MOD" ]
  run node --check "$PROVISION_MOD"
  [ "$status" -eq 0 ]
}

@test "FA-SF-40: node --test provision suite passes" {
  run node --test "$PROVISION_SUITE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"fail 0"* ]]
}

@test "FA-SF-40: exports the three contract functions" {
  for fn in "export function chooseModel" "export function chooseEffort" "export function provision"; do
    run grep -Fq "$fn" "$PROVISION_MOD"; [ "$status" -eq 0 ]
  done
}

@test "FA-SF-40: review/security roles are pinned to opus (correctness-critical)" {
  run grep -Eq "ALWAYS_OPUS_ROLES.*=.*new Set" "$PROVISION_MOD"; [ "$status" -eq 0 ]
  run grep -q "'review'" "$PROVISION_MOD"; [ "$status" -eq 0 ]
  run grep -q "'security'" "$PROVISION_MOD"; [ "$status" -eq 0 ]
}

@test "FA-SF-40: context is compact-hint based (no raw-dump), GPU-gated similar-tickets" {
  run grep -q "buildContextHints" "$PROVISION_MOD"; [ "$status" -eq 0 ]
  run grep -q "gpuEmbeddings === true" "$PROVISION_MOD"; [ "$status" -eq 0 ]
  run grep -q "similar-tickets" "$PROVISION_MOD"; [ "$status" -eq 0 ]
}

# ── FA-SF-43-worktree-gitcrypt ──────────────────────────────────#
# FA-SF-43: the factory pipeline's Implement phase must create its worktree via the
# git-crypt-safe scripts/worktree-create.sh, NOT the harness `isolation: 'worktree'`
# option. The harness option runs a raw `git worktree add` whose checkout invokes the
# git-crypt smudge filter and fails fatally (the new per-worktree gitdir has no key) —
# T000473 / T000426. Verified live 2026-06-07: the first real autopilot run failed at
# exactly this step. These are structural guards (grep + node --check), in the spirit
# of FA-SF-20/31, because the Workflow script cannot be unit-executed offline.

@test "FA-SF-43: pipeline.js does NOT pass the harness isolation:'worktree' option (code, not comments)" {
  run bash -c "CODE_ONLY() { grep -v '^[[:space:]]*//' scripts/factory/pipeline.mjs | grep -v '^[[:space:]]*\*'; }; CODE_ONLY | grep -Eq \"isolation:[[:space:]]*'worktree'\""
  [ "$status" -ne 0 ]
}

@test "FA-SF-43: pipeline.js creates the worktree via scripts/worktree-create.sh" {
  run grep -Eq 'scripts/worktree-create\.sh[[:space:]]+\$\{WORK_BRANCH\}[[:space:]]+\$\{WORK_WT\}' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-43: pipeline.js fails loudly (returns blocked) when worktree setup fails" {
  run grep -Eq "reason: 'worktree-setup'" scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-43: spec/plan filenames are date-stamped by the agent, not from A.timestamp" {
  # the undefined- filename bug: A.timestamp is not reliably passed → must use date +%F
  run grep -Eq '\$\{A\.timestamp\}-\$\{slug\}' scripts/factory/pipeline.mjs
  [ "$status" -ne 0 ]
  run grep -Eq 'docs/superpowers/specs/\$\(date \+%F\)-\$\{slug\}-design\.md' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
  run grep -Eq 'openspec/changes/\$\{slug\}/tasks\.md' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-43: worktree-create.sh supports an existing branch (reuse/dev-flow path)" {
  run grep -q 'BRANCH_EXISTS' scripts/worktree-create.sh
  [ "$status" -eq 0 ]
  run bash -n scripts/worktree-create.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-43: pipeline.js still parses" {
  run node --check scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

# ── FA-SF-44-verify-diff-killswitch ─────────────────────────────#
# FA-SF-44: follow-ups to the first real autopilot build (T000473):
#   - Verify/Deploy must diff the WORKTREE, not ${REPO} (whose HEAD is main → empty diff
#     → false "no code" review blockers).
#   - guard_check_diff_size must diff the feature branch ref, not bare HEAD.
#   - factory.service RuntimeMaxSec must allow a real build (old 900s SIGTERM-killed it).
#   - T000474: the kill-switch must be FAIL-CLOSED on duplicate factory_control rows,
#     and `factory-control set` must not create NULL-brand duplicates.

@test "FA-SF-44: Verify panel diffs the worktree, not bare HEAD in REPO" {
  run grep -Eq 'git -C \$\{WORK_WT\} diff origin/main\.\.\.HEAD' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
  # the old empty-diff form must be gone
  run grep -Eq 'git diff origin/main\.\.\.HEAD in \$\{REPO\}' scripts/factory/pipeline.mjs
  [ "$status" -ne 0 ]
}

@test "FA-SF-44: diff-size guard is passed the feature branch ref" {
  # buildDeployPrompt (pipeline-partials.cjs) parameterises the guard: maxDiff + workBranch.
  run grep -Eq 'guard_check_diff_size \$\{c\.maxDiff \|\| .800.\} \$\{c\.workBranch\}' scripts/factory/pipeline-partials.cjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-44: guard_check_diff_size accepts a ref arg (defaults HEAD)" {
  run grep -Eq 'ref="\$\{2:-HEAD\}"' scripts/factory/guards.sh
  [ "$status" -eq 0 ]
  run grep -Eq 'origin/main\.\.\.\$\{ref\}' scripts/factory/guards.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-44: factory.service RuntimeMaxSec allows a real build (>=3600)" {
  run bash -c "v=\$(grep -oE 'RuntimeMaxSec=[0-9]+' scripts/factory/factory.service | cut -d= -f2); [ \"\${v:-0}\" -ge 3600 ]"
  [ "$status" -eq 0 ]
}

@test "FA-SF-44: factory-control set dedups via DELETE+INSERT (no ON CONFLICT)" {
  run grep -Eq 'DELETE FROM tickets\.factory_control WHERE key' scripts/ticket.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-44: guard_killswitch_on is FAIL-CLOSED on a duplicated off/on read (T000474)" {
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/scripts"
  cat > "$tmp/scripts/ticket.sh" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  *--brand*) printf '' ;;      # no per-brand row
  *)         printf 'off\non\n' ;;  # duplicated global rows: one off, one on
esac
STUB
  chmod +x "$tmp/scripts/ticket.sh"
  # subshell isolates guards.sh's `set -uo pipefail`; expect exit 0 = ON (paused)
  run bash -c "source scripts/factory/guards.sh; GUARDS_REPO='$tmp' guard_killswitch_on mentolder"
  rm -rf "$tmp"
  [ "$status" -eq 0 ]
}

@test "FA-SF-44: guard_killswitch_on returns NOT-paused when the only row is off" {
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/scripts"
  printf '#!/usr/bin/env bash\nprintf '"'"'off\\n'"'"'\n' > "$tmp/scripts/ticket.sh"
  chmod +x "$tmp/scripts/ticket.sh"
  run bash -c "source scripts/factory/guards.sh; GUARDS_REPO='$tmp' guard_killswitch_on mentolder"
  rm -rf "$tmp"
  [ "$status" -ne 0 ]
}

# ── FA-SF-46-cleanup ────────────────────────────────────────────#
# FA-SF-46: cleanup.sh removes factory branch + worktree after pipeline completion.
# All operations are best-effort (always exit 0). The script is idempotent — calling
# it with a non-existent branch/worktree is a clean no-op.

@test "FA-SF-46: cleanup.sh parses without syntax errors" {
  run bash -n scripts/factory/cleanup.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-46: cleanup.sh is executable" {
  [ -x scripts/factory/cleanup.sh ]
}

@test "FA-SF-46: cleanup.sh exits 0 with missing args (idempotent)" {
  run bash scripts/factory/cleanup.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-46: cleanup.sh exits 0 for non-existent branch" {
  run bash scripts/factory/cleanup.sh --branch "nonexistent-fa-sf-46-deadbeef"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "nothing to clean up" ]]
}

@test "FA-SF-46: cleanup.sh exits 0 for non-existent worktree" {
  run bash scripts/factory/cleanup.sh --worktree "/tmp/wt-nonexistent-fa-sf-46"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "nothing to clean up" ]]
}

@test "FA-SF-46: cleanup.sh removes a real branch + worktree" {
  # Create a disposable branch and worktree, then clean them up.
  git branch -D fa-sf-46-test-cleanup 2>/dev/null || true
  git branch fa-sf-46-test-cleanup
  git worktree add --no-checkout /tmp/wt-fa-sf-46-test fa-sf-46-test-cleanup 2>/dev/null || true

  run bash scripts/factory/cleanup.sh --branch "fa-sf-46-test-cleanup" --worktree "/tmp/wt-fa-sf-46-test"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "removed" ]]

  # Verify both are gone.
  run git show-ref --verify --quiet "refs/heads/fa-sf-46-test-cleanup" 2>/dev/null
  [ "$status" -ne 0 ]
  [ ! -d /tmp/wt-fa-sf-46-test ]
}

@test "FA-SF-46: cleanup.sh is idempotent (call twice in a row)" {
  # First call cleans up (nothing exists from previous test — already cleaned).
  run bash scripts/factory/cleanup.sh --branch "fa-sf-46-test-cleanup" --worktree "/tmp/wt-fa-sf-46-test"
  [ "$status" -eq 0 ]

  # Second call on already-cleaned targets is also a no-op.
  run bash scripts/factory/cleanup.sh --branch "fa-sf-46-test-cleanup" --worktree "/tmp/wt-fa-sf-46-test"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "nothing to clean up" ]]
}

@test "FA-SF-46: pipeline.js wraps main body in try/finally" {
  # finally block must contain the cleanup agent call.
  run grep -Eq '} finally \{' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-46: pipeline.js finally block calls cleanup.sh" {
  run grep -Eq 'scripts/factory/cleanup\.sh' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-46: pipeline.js cleanup is wrapped in try/catch (never masks real result)" {
  run grep -Eq 'catch[[:space:]]*\(_\)' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-46: pipeline.js cleanup passes both WORK_BRANCH and WORK_WT" {
  # The invocation is inside a JS template literal: --branch ${WORK_BRANCH} --worktree ${WORK_WT}
  run grep -Eq 'cleanup\.sh.*--branch.*WORK_BRANCH.*--worktree.*WORK_WT' scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}
