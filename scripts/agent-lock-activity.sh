#!/usr/bin/env bash
# scripts/agent-lock-activity.sh — activity-report fragment for agent-lock.sh [T003098]
#
# Sources: sourced at the end of agent-lock.sh via the same loader loop as
# agent-lock-guards.sh / agent-lock-merged.sh / agent-lock-identity.sh.
# Provides: cmd_activity

cmd_activity() {
  # Part 1: the claims list (same format as cmd_list, for compatibility)
  cmd_list

  # Part 2: running processes whose cwd falls inside the repo worktree set.
  # This closes the visibility gap: a session is invisible to `agent-lock.sh list`
  # until its first commit (the pre-commit hook writes the main-checkout lock) —
  # but its process already occupies a worktree. [T003098]
  echo ""
  echo "--- running processes in worktree paths ---"

  local toplevel common worktrees_root
  toplevel="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "(kein Git-Repo erkannt)"; return 0; }
  common="$(cd "$toplevel" && git rev-parse --git-common-dir 2>/dev/null)" || common="$toplevel/.git"
  # Resolve git-common-dir which may be absolute or relative
  case "$common" in /*) worktrees_root="$(dirname "$common")" ;; *) worktrees_root="$(cd "$toplevel/$common" 2>/dev/null && pwd)" || worktrees_root="$toplevel"; worktrees_root="$(dirname "$worktrees_root")" ;; esac

  # Collect worktree roots: main checkout + all git-worktree worktrees
  local -A _wt_roots
  _wt_roots["$toplevel"]=1
  while IFS= read -r wt_line; do
    [[ "$wt_line" =~ ^worktree\ (.*) ]] || continue
    _wt_roots["${BASH_REMATCH[1]}"]=1
  done < <(git worktree list --porcelain 2>/dev/null)

  # Build our ancestor PID set (self + parent chain) so we don't report ourselves
  local -A _my_pids
  local _p="$$"
  while [[ -n "$_p" && "$_p" -gt 1 ]]; do
    _my_pids[$_p]=1
    _p=$(ps -o ppid= -p "$_p" 2>/dev/null | tr -d '[:space:]')
    [[ -z "$_p" ]] && break
  done

  local pid cwd pname found=0
  for pid in $(ls /proc 2>/dev/null | grep -E '^[0-9]+$'); do
    [[ -n "${_my_pids[$pid]:-}" ]] && continue
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null)" || continue
    local _matched=""
    for wt in "${!_wt_roots[@]}"; do
      if [[ "$cwd" = "$wt" || "$cwd" = "$wt"/* ]]; then
        _matched="$wt"
        break
      fi
    done
    [[ -z "$_matched" ]] && continue
    pname="$(ps -o comm= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
    printf '  pid=%-8s cwd=%s name=%s\n' "$pid" "$cwd" "${pname:-?}"
    found=1
  done

  if [[ "$found" -eq 0 ]]; then
    echo "  (keine Prozesse in Worktree-Pfaden gefunden)"
  fi

  return 0
}

# 0 = true, 1 = false. Checks if any active process holds a cwd inside the worktree
_worktree_has_active_process() {
  local wt="$1" _pid _cwd
  local -A _my_pids
  local _p="$$"
  while [[ -n "$_p" && "$_p" -gt 1 ]]; do
    _my_pids[$_p]=1
    _p=$(ps -o ppid= -p "$_p" 2>/dev/null | tr -d '[:space:]')
    [[ -z "$_p" ]] && break
  done
  for _pid in $(ls /proc 2>/dev/null | grep -E '^[0-9]+$'); do
    [[ -n "${_my_pids[$_pid]:-}" ]] && continue
    _cwd="$(readlink "/proc/$_pid/cwd" 2>/dev/null)" || continue
    if [[ "$_cwd" = "$wt" || "$_cwd" = "$wt"/* ]]; then
      return 0
    fi
  done
  return 1
}

# T014468: Query if ANY active lock holds the exact worktree path
_worktree_is_live_claimed() {
  local target_wt="$1" f wt
  for f in "$AGENT_LOCK_DIR"/branch__*.json "$AGENT_LOCK_DIR"/ticket__*.json; do
    [ -f "$f" ] || continue
    wt="$(_lock_field "$f" worktree)"
    if [ "$wt" = "$target_wt" ]; then
      if ! _reapable "$f"; then
        return 0
      fi
    fi
  done
  return 1
}

cmd_check_worktree_live() {
  if [ -z "${1:-}" ]; then echo "Missing worktree path" >&2; return 1; fi
  if _worktree_is_live_claimed "$(cd "$1" 2>/dev/null && pwd || echo "$1")"; then
    echo "live"
    return 0
  else
    echo "free"
    return 1
  fi
}

# Check if a git branch has a live (non-reapable) agent-lock claim. [T001448 M3]
_branch_is_live_claimed() {
  local br="$1" d f
  d="$(_lock_dir)"
  [ -d "$d" ] || return 1
  for f in "$d"/*.json; do
    [ -e "$f" ] || continue
    [ "$(_lock_field "$f" branch)" = "$br" ] || continue
    _reapable "$f" && continue
    return 0
  done
  return 1
}

# T001448 M3: Guard commands for external callers. Allows scripts like
# worktree-create.sh und cleanup.sh, einen live Agent-Claim zu respektieren,
# ohne die interne Logik von _branch_is_live_claimed zu duplizieren.
cmd_check_branch_live() {
  local br="$1"
  if _branch_is_live_claimed "$br"; then
    echo "live"
    return 0
  else
    echo "free"
    return 1
  fi
}
