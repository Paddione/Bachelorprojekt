#!/usr/bin/env bash
# main-checkout-foreign-guard.sh — shared detection for T003078 / T003097
#
# Detects whether a foreign agent process (claude or opencode) is actively working
# in the given Git checkout directory. Used by dev-flow-chore step 0 and
# scripts/worktree-create.sh to decide whether it's safe to `git stash` the
# main checkout — if a foreign agent has uncommitted changes there, we skip the
# stash and proceed with the worktree from origin/main instead.
#
# Three alternative approaches were evaluated and rejected:
#   1. agent-lock.sh list — sessions are invisible until their first commit (T003098)
#   2. File mtimes — unreliable and global, can't distinguish own from foreign
#   3. fuser/lsof — not guaranteed available, proc-based check is more portable
#
# Ticket references: T003078, T003097

mc_foreign_activity_detected() {
  local checkout_path="${1:-$(pwd)}"

  # Step 1: Is the checkout even dirty? If not, there's nothing to protect.
  if git -C "$checkout_path" status --porcelain 2>/dev/null | grep -q .; then
    : # dirty — continue
  else
    return 1  # clean — no foreign danger
  fi

  # Step 2: Build the set of our own ancestor PIDs so we don't flag ourselves.
  local -A _own_pids
  local _pid="$$"
  while [[ -n "$_pid" && "$_pid" -gt 1 ]]; do
    _own_pids[$_pid]=1
    _pid=$(ps -o ppid= -p "$_pid" 2>/dev/null | tr -d '[:space:]')
    [[ -z "$_pid" ]] && break
  done

  # Step 3: Scan all running processes — if any claude/opencode process has its
  # cwd inside the checkout path (and is not our own ancestor), signal foreign.
  local _cwd _cmdline
  while IFS= read -r _pid; do
    [[ -z "$_pid" ]] && continue
    [[ -n "${_own_pids[$_pid]:-}" ]] && continue

    _cwd=$(readlink "/proc/$_pid/cwd" 2>/dev/null) || continue
    # Exact path match OR prefix match (e.g. subdirectory of the checkout)
    if [[ "$_cwd" = "$checkout_path" || "$_cwd" = "$checkout_path"/* ]]; then
      _cmdline=$(ps -o args= -p "$_pid" 2>/dev/null) || continue
      # Word-boundary match: "claude" or "claude ..." or "opencode" or "opencode ..."
      case "$_cmdline" in
        claude|"claude "*|opencode|"opencode "*)
          return 0  # foreign activity detected
          ;;
      esac
    fi
  done < <(ps -eo pid= 2>/dev/null)

  return 1  # no foreign activity
}
