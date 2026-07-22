#!/usr/bin/env bats
# FA-SF-44: follow-ups to the first real autopilot build (T000473):
#   - Verify/Deploy must diff the WORKTREE, not ${REPO} (whose HEAD is main → empty diff
#     → false "no code" review blockers).
#   - guard_check_diff_size must diff the feature branch ref, not bare HEAD.
#   - factory.service RuntimeMaxSec must allow a real build (old 900s SIGTERM-killed it).
#   - T000474: the kill-switch must be FAIL-CLOSED on duplicate factory_control rows,
#     and `factory-control set` must not create NULL-brand duplicates.

@test "FA-SF-44: Verify panel diffs the worktree, not bare HEAD in REPO" {
  run grep -Eq 'git -C \$\{WORK_WT\} diff origin/main\.\.\.HEAD' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
  # the old empty-diff form must be gone
  run grep -Eq 'git diff origin/main\.\.\.HEAD in \$\{REPO\}' scripts/factory/pipeline.js
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
