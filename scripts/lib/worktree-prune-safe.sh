#!/usr/bin/env bash
# scripts/lib/worktree-prune-safe.sh — T900046
#
# Cross-platform safe wrapper around `git worktree prune`.
# Prevents WSL Git from deleting Windows-hosted worktrees (and vice versa)
# when gitdir contains paths from the other OS.

worktree_prune_safe() {
  local in_wsl=false
  local in_windows=false

  # 1) Platform detection
  if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ]; then
    in_wsl=true
  elif [ -r /proc/sys/kernel/osrelease ] && grep -qE 'Microsoft|WSL' /proc/sys/kernel/osrelease 2>/dev/null; then
    in_wsl=true
  elif [[ "$(git --exec-path 2>/dev/null || true)" =~ /wsl([./]|$) ]]; then
    in_wsl=true
  elif [[ "${OSTYPE:-}" == "msys" || "${OSTYPE:-}" == "cygwin" || -n "${WINDIR:-}" ]]; then
    in_windows=true
  fi

  # 2) Protect cross-platform worktrees before prune
  local git_common_dir
  git_common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  if [ -n "$git_common_dir" ] && [ -d "$git_common_dir/worktrees" ]; then
    for wt_dir in "$git_common_dir/worktrees"/*; do
      [ -d "$wt_dir" ] || continue
      # If already locked, git worktree prune will unconditionally skip it
      [ -f "$wt_dir/locked" ] && continue

      local gitdir_file="$wt_dir/gitdir"
      [ -f "$gitdir_file" ] || continue
      local target_path
      target_path="$(cat "$gitdir_file" 2>/dev/null || true)"
      [ -n "$target_path" ] || continue

      # Case A: Running in WSL, target is a Windows path (e.g. C:/Users/... or C:\Users\...)
      if $in_wsl && [[ "$target_path" =~ ^[A-Za-z]:[/\\] ]]; then
        local drive="${target_path:0:1}"
        drive="$(echo "$drive" | tr '[:upper:]' '[:lower:]')"
        local rest="${target_path:2}"
        rest="${rest//\\//}"
        local wsl_candidate="/mnt/$drive$rest"
        if [ -e "$wsl_candidate" ] || [ -d "$wsl_candidate" ]; then
          echo "cross-platform worktree (Windows) protected from WSL prune" > "$wt_dir/locked"
        fi
      # Case B: Running on Windows, target is a WSL path (e.g. /mnt/c/... or /home/...)
      elif $in_windows && [[ "$target_path" =~ ^/mnt/([a-z])/(.*) ]]; then
        local drive="${BASH_REMATCH[1]}"
        drive="$(echo "$drive" | tr '[:lower:]' '[:upper:]')"
        local rest="${BASH_REMATCH[2]}"
        local win_candidate="$drive:/$rest"
        if [ -e "$win_candidate" ] || [ -d "$win_candidate" ]; then
          echo "cross-platform worktree (WSL) protected from Windows prune" > "$wt_dir/locked"
        fi
      fi
    done
  fi

  # 3) Execute git worktree prune safely
  git worktree prune "$@" 2>/dev/null || true
  return 0
}