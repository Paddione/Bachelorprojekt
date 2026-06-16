#!/usr/bin/env bash
# scripts/agent-msg.sh — lightweight inter-agent message channel (hcom-style). [T000882]
#
# Append-only JSONL shared across all worktrees of one repo, under the git-common-
# dir (never committed — lives inside .git/). Per-SID read cursor. Peer discovery
# is delegated to agent-lock.sh (no separate presence system).
#
# Overrides: AGENT_MSG_DIR (storage), AGENT_LOCK_SID (identity), AGENT_MSG_LABEL.
set -uo pipefail

_my_sid() {
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local s; s="$(ps -o sess= -p "$$" 2>/dev/null | tr -d ' ')"
  if [ -n "$s" ]; then printf '%s\n' "$s"; return; fi
  local stat rest; stat="$(cat /proc/self/stat 2>/dev/null)"; rest="${stat##*) }"
  # shellcheck disable=SC2086
  set -- $rest; printf '%s\n' "${4:-0}"
}

_detect_tool() {
  if [ -n "${CLAUDECODE:-}${CLAUDE_CODE:-}" ]; then echo claude
  elif [ -n "${GEMINI_CLI:-}${GEMINI_SANDBOX:-}${GEMINI_API_KEY:-}" ]; then echo gemini
  else echo unknown; fi
}

_msg_dir() {
  if [ -n "${AGENT_MSG_DIR:-}" ]; then printf '%s\n' "$AGENT_MSG_DIR"; return; fi
  local cd; cd="$(git rev-parse --git-common-dir 2>/dev/null)" || { printf '/tmp/agent-msgs\n'; return; }
  case "$cd" in /*) : ;; *) cd="$(cd "$cd" && pwd)";; esac
  printf '%s/agent-msgs\n' "$cd"
}

_log()    { printf '%s/log.jsonl\n' "$(_msg_dir)"; }
_cursor() { printf '%s/cursor-%s\n' "$(_msg_dir)" "$1"; }

_json_esc() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g'
}

cmd_post() {
  local text="" to=""
  while [ $# -gt 0 ]; do case "$1" in
    --to) to="$2"; shift 2;; *) [ -z "$text" ] && text="$1"; shift;;
  esac; done
  local bytes; bytes="$(printf '%s' "$text" | wc -c | tr -d ' ')"
  if [ "$bytes" -gt 4096 ]; then
    text="$(printf '%s' "$text" | head -c 4096)"
    echo "agent-msg: text truncated to 4096 bytes" >&2
  fi
  local d; d="$(_msg_dir)"; mkdir -p "$d" 2>/dev/null || return 0
  local line
  line="$(printf '{"ts":"%s","from_sid":"%s","from_tool":"%s","from_label":"%s","to":"%s","text":"%s"}' \
    "$(date +%s)" "$(_my_sid)" "$(_detect_tool)" "${AGENT_MSG_LABEL:-}" "$to" "$(_json_esc "$text")")"
  local lf="$d/.log.lock"; touch "$lf" 2>/dev/null || true
  exec 9>"$lf" || true; flock 9 2>/dev/null || true
  printf '%s\n' "$line" >> "$(_log)"
}

cmd_read() {
  local unread=0 mine=0 since="" me; me="$(_my_sid)"
  while [ $# -gt 0 ]; do case "$1" in
    --unread) unread=1;; --mine) mine=1;; --since) since="$2"; shift;; *) ;;
  esac; shift; done
  local log; log="$(_log)"; [ -f "$log" ] || return 0

  local slice
  if [ "$unread" -eq 1 ]; then
    local cur; cur="$(cat "$(_cursor "$me")" 2>/dev/null || echo 0)"
    local total; total="$(wc -l < "$log" | tr -d ' ')"
    slice="$(tail -n +"$((cur + 1))" "$log")"
    printf '%s\n' "$total" > "$(_cursor "$me")"
  else
    slice="$(cat "$log")"
  fi
  [ -n "$slice" ] || return 0

  printf '%s\n' "$slice" | while IFS= read -r ln; do
    [ -n "$ln" ] || continue
    if [ -n "$since" ]; then
      printf '%s' "$ln" | jq -e --argjson s "$since" 'select((.ts|tonumber) >= $s)' >/dev/null 2>&1 || continue
    fi
    if [ "$mine" -eq 1 ]; then
      printf '%s' "$ln" | jq -e --arg me "$me" --arg lbl "${AGENT_MSG_LABEL:-}" \
        'select(.to=="" or .to==$me or (($lbl|length)>0 and .to==$lbl))' >/dev/null 2>&1 || continue
    fi
    printf '%s\n' "$ln"
  done
}

cmd_tail() {
  local n=10
  while [ $# -gt 0 ]; do case "$1" in -n) n="$2"; shift 2;; *) shift;; esac; done
  local log; log="$(_log)"; [ -f "$log" ] || return 0
  tail -n "$n" "$log" | while IFS= read -r ln; do
    [ -n "$ln" ] || continue
    printf '%s' "$ln" | jq -r '"[\(.ts)] \(.from_tool)/\(.from_label) → \(if .to=="" then "all" else .to end): \(.text)"' 2>/dev/null \
      || printf '%s\n' "$ln"
  done
}

cmd_peers() { bash "$(dirname "$0")/agent-lock.sh" list; }

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    post)  cmd_post "$@";;
    read)  cmd_read "$@";;
    tail)  cmd_tail "$@";;
    peers) cmd_peers "$@";;
    *) echo "Usage: agent-msg.sh {post <text> [--to <sid|label>] | read [--unread] [--mine] [--since <epoch>] | tail [-n N] | peers}" >&2; return 2;;
  esac
}
main "$@"
