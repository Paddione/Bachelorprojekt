#!/usr/bin/env bash
# scripts/agent-collision.sh — active live edit-collision warning. [T000882]
#
# Warns when the files you are about to commit are ALSO in-flight in another
# LIVE agent session's worktree. Pure local bash — no cluster, no DB → offline-
# and CI-safe. Complements scripts/factory/conflict-check.sh (DB-based, Factory
# scheduling) and agent-lock.sh (the passive mutex), without changing either.
#
# Discovery: reads agent-lock.sh's own claim store (the JSON files it writes),
# because `agent-lock.sh list` does not expose the worktree path and agent-lock.sh
# must stay unchanged. Honours the same overrides: AGENT_LOCK_DIR, AGENT_LOCK_SID,
# AGENT_LOCK_FAKE_ALIVE.
#
# Exit: 0 = no collision (or fail-open), 1 = collision(s) found.
set -uo pipefail

_my_sid() {
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local s; s="$(ps -o sess= -p "$$" 2>/dev/null | tr -d ' ')"
  if [ -n "$s" ]; then printf '%s\n' "$s"; return; fi
  local stat rest; stat="$(cat /proc/self/stat 2>/dev/null)"; rest="${stat##*) }"
  # shellcheck disable=SC2086
  set -- $rest; printf '%s\n' "${4:-0}"
}

_sid_alive() {
  [ -n "${1:-}" ] || return 1
  if [ -n "${AGENT_LOCK_FAKE_ALIVE+x}" ]; then
    case " $AGENT_LOCK_FAKE_ALIVE " in *" $1 "*) return 0;; *) return 1;; esac
  fi
  pgrep -s "$1" >/dev/null 2>&1
}

_lock_dir() {
  if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return; fi
  local cd; cd="$(git rev-parse --git-common-dir 2>/dev/null)" || { printf '/tmp/agent-locks\n'; return; }
  case "$cd" in /*) : ;; *) cd="$(cd "$cd" && pwd)";; esac
  printf '%s/agent-locks\n' "$cd"
}

_field() { sed -n "s/.*\"$2\": *\"\\([^\"]*\\)\".*/\\1/p" "$1" 2>/dev/null | head -1; }

cmd_check() {
  local mode=staged quiet=0
  while [ $# -gt 0 ]; do case "$1" in
    --staged) mode=staged;; --all) mode=all;; --quiet) quiet=1;; *) ;;
  esac; shift; done

  local own; own="$(git diff --cached --name-only 2>/dev/null)"
  if [ "$mode" = "all" ]; then
    own="$(printf '%s\n%s\n' "$own" "$(git diff --name-only HEAD 2>/dev/null)")"
  fi
  own="$(printf '%s\n' "$own" | sed '/^$/d' | sort -u)"
  [ -n "$own" ] || return 0

  local mysid d; mysid="$(_my_sid)"; d="$(_lock_dir)"
  [ -d "$d" ] || return 0

  local found=0 f sid wt peer file
  for f in "$d"/*.json; do
    [ -e "$f" ] || continue
    sid="$(_field "$f" owner_sid)"
    [ "$sid" = "$mysid" ] && continue
    _sid_alive "$sid" || continue
    wt="$(_field "$f" worktree)"
    [ -n "$wt" ] && [ "$wt" != "-" ] && [ -d "$wt" ] || continue
    git -C "$wt" rev-parse --git-dir >/dev/null 2>&1 || continue
    peer="$( { git -C "$wt" diff --name-only HEAD 2>/dev/null; \
               git -C "$wt" diff --cached --name-only 2>/dev/null; } | sed '/^$/d' | sort -u )"
    [ -n "$peer" ] || continue
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      if printf '%s\n' "$peer" | grep -qxF "$file"; then
        found=1
        if [ "$quiet" -eq 0 ]; then
          printf '⚠ COLLISION: %s — auch in-flight bei %s/%s (sid %s, worktree %s)\n' \
            "$file" "$(_field "$f" tool)" "$(_field "$f" label)" "$sid" "$wt" >&2
        fi
      fi
    done <<EOF
$own
EOF
  done
  [ "$found" -eq 0 ]
}

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    check) cmd_check "$@";;
    *) echo "Usage: agent-collision.sh check [--staged|--all] [--quiet]" >&2; return 2;;
  esac
}
main "$@"
