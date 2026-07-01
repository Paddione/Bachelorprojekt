#!/usr/bin/env bash
# scripts/agent-lock.sh — cross-tool session-coordination lock registry. [T000510]
#
# Why: several agent sessions (Claude + Gemini, sometimes two Claude windows)
# share one checkout / one .git. This advisory file-lock registry lets each
# session claim a ticket / branch / the-main-checkout / a-registry-file, so the
# others see "who is doing what" and refuse to duplicate work or stomp the
# shared index.
#
# Identity: the Unix SESSION ID (ps -o sess=) is shared by every subprocess of
# one agent CLI but differs between Claude/Gemini/two windows.
#
# Storage: one JSON file per claim under $AGENT_LOCK_DIR (default the shared
# gitdir's agent-locks/, so all worktrees share it). Never committed.
#
# Test overrides: AGENT_LOCK_DIR, AGENT_LOCK_SID, AGENT_LOCK_FAKE_ALIVE.
set -uo pipefail

AGENT_LOCK_TTL="${AGENT_LOCK_TTL:-1800}"
AGENT_LOCK_GRACE="${AGENT_LOCK_GRACE:-120}"

_now() { date +%s; }

_my_sid() {
  # Harness-stable env wins (Claude Code / opencode expose a session id for
  # telemetry that survives across bash tool calls). The test override
  # AGENT_LOCK_SID stays as a second layer (CI / unit tests). Only fall back
  # to the per-call Unix SID when neither harness env nor test override is
  # set — that path is the source of the cross-call drift bug. [T001268]
  if [ -n "${CLAUDE_SESSION_ID:-}" ]; then printf '%s\n' "$CLAUDE_SESSION_ID"; return; fi
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local s; s="$(ps -o sess= -p "$$" 2>/dev/null | tr -d ' ')"
  if [ -n "$s" ]; then printf '%s\n' "$s"; return; fi
  # fallback: 4th field after the ')' in /proc/self/stat is the session id
  local stat rest; stat="$(cat /proc/self/stat 2>/dev/null)"; rest="${stat##*) }"
  # shellcheck disable=SC2086
  set -- $rest; printf '%s\n' "${4:-0}"
}

_sid_alive() {
  [ -n "${1:-}" ] || return 1
  if [ -n "${AGENT_LOCK_FAKE_ALIVE+x}" ]; then
    case " $AGENT_LOCK_FAKE_ALIVE " in *" $1 "*) return 0;; *) return 1;; esac
  fi
  # Non-numeric sids are harness-provided session IDs (e.g. CLAUDE_SESSION_ID).
  # They cannot be verified via pgrep, so treat them as alive and rely on the
  # heartbeat TTL to reap them when their holder stops refreshing. [T001268]
  case "$1" in *[!0-9]*) return 0;; esac
  pgrep -s "$1" >/dev/null 2>&1
}

_detect_tool() {
  # CLAUDE_SESSION_ID is the harness-provided env from Claude Code / opencode;
  # we also accept the older CLAUDECODE/CLAUDE_CODE marker for back-compat.
  # CLAUDE_SESSION_ID alone is enough to identify the Claude harness. [T001268]
  if [ -n "${CLAUDE_SESSION_ID:-}${CLAUDECODE:-}${CLAUDE_CODE:-}" ]; then echo claude
  elif [ -n "${GEMINI_CLI:-}${GEMINI_SANDBOX:-}${GEMINI_API_KEY:-}" ]; then echo gemini
  else echo unknown; fi
}

_lock_dir() {
  if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return; fi
  local cd; cd="$(git rev-parse --git-common-dir 2>/dev/null)" || { printf '/tmp/agent-locks\n'; return; }
  case "$cd" in /*) : ;; *) cd="$(cd "$cd" && pwd)";; esac
  printf '%s/agent-locks\n' "$cd"
}

_sanitize() { printf '%s' "$1" | tr '/ ' '--'; }

_lock_file() { # <scope> [id]
  if [ "$1" = "main-checkout" ]; then printf '%s/main-checkout.json\n' "$(_lock_dir)";
  else printf '%s/%s__%s.json\n' "$(_lock_dir)" "$1" "$(_sanitize "${2:-}")"; fi
}

_lock_field() { sed -n "s/.*\"$2\": *\"\\([^\"]*\\)\".*/\\1/p" "$1" 2>/dev/null | head -1; }

# Append an append-only audit line whenever a claim is classified reapable.
# Fail-open: a write failure is ignored (consistent with the rest of the script).
# NOTE: .reap.log is not rotated here — small text lines; rotate in a follow-up if it grows.
_reap_log() {  # <lock-file> <reason>
  printf '%s %s/%s %s\n' "$(_now)" \
    "$(_lock_field "$1" scope)" "$(_lock_field "$1" id)" "$2" \
    >> "$(_lock_dir)/.reap.log" 2>/dev/null || true
}

# 0 = reapable (clearly dead). A confirmed-alive SID is NEVER reapable.
_reapable() {
  local f="$1" sid wt hb ct now age
  [ -f "$f" ] || return 0
  sid="$(_lock_field "$f" owner_sid)"; wt="$(_lock_field "$f" worktree)"
  hb="$(_lock_field "$f" heartbeat_at)"; ct="$(_lock_field "$f" created_at)"; now="$(_now)"
  if [ -n "$wt" ] && [ "$wt" != "-" ] && [ ! -d "$wt" ]; then _reap_log "$f" worktree-missing; return 0; fi
  if [ -n "$sid" ]; then
    if _sid_alive "$sid"; then return 1; fi
    # Dead numeric SID: a young claim (< AGENT_LOCK_GRACE) is protected from a
    # reap on the SID check alone — a transient session-id mismatch between tool
    # calls must not drop a fresh claim. Fall through to the heartbeat-TTL check.
    age=$(( now - ${ct:-0} ))
    if [ -z "$ct" ] || [ "$age" -ge "$AGENT_LOCK_GRACE" ]; then
      _reap_log "$f" sid-dead; return 0
    fi
  fi
  if [ -n "$hb" ] && [ "$(( now - hb ))" -gt "$AGENT_LOCK_TTL" ]; then _reap_log "$f" heartbeat-ttl; return 0; fi
  return 1
}

_with_lock() {
  local d lf; d="$(_lock_dir)"; mkdir -p "$d" 2>/dev/null || true
  lf="$d/.registry.lock"
  # Ensure the flock anchor exists & is writable BEFORE exec — a failed
  # redirection on the `exec` special builtin would exit the shell. Never put a
  # persistent `2>` on this exec: with no command, exec applies it to the whole
  # shell and would silence all later stderr. Fail-open if the dir is unwritable.
  touch "$lf" 2>/dev/null || return 0
  exec 9>"$lf" || return 0
  flock 9 2>/dev/null || true
}

_write_lock() { # <file>  (reads SCOPE/ID/LABEL/WT/BRANCH/TICKET/CREATED)
  local f="$1" tmp="$1.tmp.$$"
  {
    printf '{\n'
    printf '  "scope": "%s",\n' "$SCOPE"
    printf '  "id": "%s",\n' "$ID"
    printf '  "owner_sid": "%s",\n' "$(_my_sid)"
    printf '  "owner_pid": "%s",\n' "$$"
    printf '  "tool": "%s",\n' "$(_detect_tool)"
    printf '  "label": "%s",\n' "${LABEL:-}"
    printf '  "worktree": "%s",\n' "${WT:-}"
    printf '  "branch": "%s",\n' "${BRANCH:-}"
    printf '  "ticket": "%s",\n' "${TICKET:-}"
    printf '  "host": "%s",\n' "$(hostname 2>/dev/null || echo unknown)"
    printf '  "created_at": "%s",\n' "${CREATED:-$(_now)}"
    printf '  "heartbeat_at": "%s"\n' "$(_now)"
    printf '}\n'
  } > "$tmp" && mv -f "$tmp" "$f"
}

_holder_msg() {
  printf 'gehalten von %s (sid %s, label %s, worktree %s, seit %s)' \
    "$(_lock_field "$1" tool)" "$(_lock_field "$1" owner_sid)" \
    "$(_lock_field "$1" label)" "$(_lock_field "$1" worktree)" "$(_lock_field "$1" created_at)"
}

# 0 = a rebase/merge/cherry-pick is mid-flight. git fires post-checkout during the
# internal ref moves of `git pull --rebase origin main`; reverting then would corrupt
# another session's legitimate operation. This exemption is the key safety fix. [T001383]
_git_op_in_progress() {
  local name p
  for name in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD; do
    p="$(git rev-parse --git-path "$name" 2>/dev/null)" || continue
    [ -e "$p" ] && return 0
  done
  return 1
}

# Label used to mark a main-checkout lock as auto-claimed bookkeeping (populating `branch`
# for guard-postcheckout) rather than a deliberate exclusive claim (e.g. dev-flow-chore's
# documented `claim main-checkout`). guard-precommit must NEVER hard-block another session's
# ordinary commit just because it self-claimed a moment earlier — only a deliberately-labelled
# claim retains the pre-existing hard-block semantics. [T001383]
_SELF_CLAIM_LABEL="auto: pre-commit self-claim"

# Best-effort claim/refresh of the main-checkout lock for THIS session, recording the
# current branch so guard-postcheckout has a reliable revert target. Never blocks. [T001383]
_self_claim_main_checkout() {
  local br; br="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  [ -n "$br" ] && [ "$br" != "HEAD" ] || return 0
  cmd_claim main-checkout "" --branch "$br" --label "$_SELF_CLAIM_LABEL" >/dev/null 2>&1
}

cmd_claim() {
  SCOPE="$1"; ID="${2:-}"; shift 2 2>/dev/null || shift $#
  LABEL=""; WT=""; BRANCH=""; TICKET=""
  while [ $# -gt 0 ]; do case "$1" in
    --label) LABEL="$2"; shift 2;; --worktree) WT="$2"; shift 2;;
    --branch) BRANCH="$2"; shift 2;; --ticket) TICKET="$2"; shift 2;;
    *) shift;; esac; done
  local f; f="$(_lock_file "$SCOPE" "$ID")"
  _with_lock
  [ -f "$f" ] && _reapable "$f" && rm -f "$f"
  if [ -f "$f" ]; then
    if [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ]; then
      CREATED="$(_lock_field "$f" created_at)"; _write_lock "$f"; return 0
    fi
    echo "AGENT-LOCK: $SCOPE/$ID bereits $(_holder_msg "$f")" >&2
    return 1
  fi
  CREATED="$(_now)"; _write_lock "$f"; return 0
}

cmd_refresh() {
  SCOPE="$1"; ID="${2:-}"; local f; f="$(_lock_file "$SCOPE" "$ID")"
  [ -f "$f" ] || return 1
  [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ] || return 1
  LABEL="$(_lock_field "$f" label)"; WT="$(_lock_field "$f" worktree)"
  BRANCH="$(_lock_field "$f" branch)"; TICKET="$(_lock_field "$f" ticket)"
  CREATED="$(_lock_field "$f" created_at)"; _write_lock "$f"; return 0
}

cmd_release() {
  local scope="$1" id="${2:-}" force=""; [ "${3:-}" = "--force" ] && force=1
  local f; f="$(_lock_file "$scope" "$id")"
  [ -f "$f" ] || return 0
  if [ -n "$force" ] || [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ]; then rm -f "$f"; return 0; fi
  return 1
}

cmd_check() {
  local f; f="$(_lock_file "$1" "${2:-}")"
  if [ ! -f "$f" ] || _reapable "$f"; then echo "free"; return 0; fi
  if [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ]; then echo "mine"; cat "$f"; return 0; fi
  echo "held"; cat "$f"; return 3
}

cmd_list() {
  local d; d="$(_lock_dir)"; [ -d "$d" ] || { echo "(keine aktiven Claims)"; return 0; }
  printf '%-14s %-24s %-8s %-10s %-6s %s\n' SCOPE ID TOOL SID STATE LABEL
  local f state
  for f in "$d"/*.json; do
    [ -e "$f" ] || continue
    state=live; _reapable "$f" && state=stale
    printf '%-14s %-24s %-8s %-10s %-6s %s\n' \
      "$(_lock_field "$f" scope)" "$(_lock_field "$f" id)" "$(_lock_field "$f" tool)" \
      "$(_lock_field "$f" owner_sid)" "$state" "$(_lock_field "$f" label)"
  done
}

cmd_reap() {
  local d; d="$(_lock_dir)"
  # 1) kill orphan processes whose cwd is a DELETED worktree (matches /wt-…(deleted));
  #    cwd-based — never self-matches (our own cwd exists).
  local pid cwd
  for pid in $(ls /proc 2>/dev/null | grep -E '^[0-9]+$'); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null)" || continue
    case "$cwd" in *wt-*"(deleted)") kill -9 "$pid" 2>/dev/null || true;; esac
  done
  # 2) prune git worktree admin entries for gone directories
  git worktree prune 2>/dev/null || true
  # 2b) prune stale remote-tracking refs (branches deleted on GitHub after merge)
  git fetch --prune origin 2>/dev/null || true
  # 2c) delete local branches that were squash-merged into main (upstream gone)
  for br in $(git branch --merged main 2>/dev/null | sed 's/^[* ]*//' | grep -v '^main$'); do
    # only delete if the upstream tracking branch is gone
    upstream="$(git rev-parse --abbrev-ref "$br@{upstream}" 2>/dev/null)" || true
    if [ -z "$upstream" ] || ! git show-ref --verify --quiet "refs/remotes/$upstream" 2>/dev/null; then
      git branch -d "$br" 2>/dev/null || true
    fi
  done
  # 3) drop reapable (clearly dead) locks
  if [ -d "$d" ]; then
    local f
    for f in "$d"/*.json; do [ -e "$f" ] || continue; _reapable "$f" && rm -f "$f"; done
  fi
  return 0
}

cmd_guard_precommit() {
  [ -n "${AGENT_LOCK_FORCE:-}" ] && return 0
  local f; f="$(_lock_file main-checkout)"
  _with_lock
  # Only a DELIBERATE foreign claim (any label other than the auto self-claim one) still
  # hard-blocks — an auto-claimed lock is bookkeeping, not a real exclusive hold, so it must
  # never block a different session's ordinary commit. [T001383]
  if [ -f "$f" ] && ! _reapable "$f" \
     && [ "$(_lock_field "$f" owner_sid)" != "$(_my_sid)" ] \
     && [ "$(_lock_field "$f" label)" != "$_SELF_CLAIM_LABEL" ]; then
    echo "AGENT-LOCK: main-Checkout $(_holder_msg "$f")" >&2
    echo "  Eine andere Session arbeitet im main-Checkout. Nutze einen Worktree" >&2
    echo "  (scripts/worktree-create.sh) oder erzwinge: AGENT_LOCK_FORCE=1 git commit ..." >&2
    return 1
  fi
  # No live foreign deliberate lock blocks the commit → self-claim so the `branch` field
  # stays populated for guard-postcheckout. Best-effort; must never block the commit. [T001383]
  _self_claim_main_checkout || true
  return 0
}

cmd_guard_postcheckout() {
  local f; f="$(_lock_file main-checkout)"
  [ -f "$f" ] || return 0
  _reapable "$f" && return 0
  [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ] && return 0
  # Exemption first: never warn or revert mid rebase/merge/cherry-pick.
  _git_op_in_progress && return 0
  echo "AGENT-LOCK (Warnung): main-Checkout $(_holder_msg "$f") — paralleler Branch-Switch riskant." >&2
  # Opt-out escape hatch.
  [ "${AGENT_LOCK_POSTCHECKOUT_REVERT:-1}" = "0" ] && return 0
  # Best-effort revert onto the lock's recorded branch — never a raw SHA.
  local br; br="$(_lock_field "$f" branch)"
  [ -n "$br" ] || return 0
  git show-ref --verify --quiet "refs/heads/$br" || return 0
  [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "$br" ] && return 0
  if git checkout "$br" >/dev/null 2>&1; then
    echo "AGENT-LOCK: main-Checkout auf '$br' zurückgesetzt (Lock-Halter aktiv)." >&2
  else
    echo "AGENT-LOCK: Revert auf '$br' fehlgeschlagen — bitte manuell prüfen." >&2
  fi
  return 0
}

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    claim)   cmd_claim "$@";;
    refresh) cmd_refresh "$@";;
    release) cmd_release "$@";;
    check)   cmd_check "$@";;
    list)    cmd_list "$@";;
    reap)    cmd_reap "$@";;
    mine)    _my_sid;;
    guard-precommit)    cmd_guard_precommit "$@";;
    guard-postcheckout) cmd_guard_postcheckout "$@";;
    *) echo "Usage: agent-lock.sh {claim|refresh|release|check|list|reap|mine|guard-precommit|guard-postcheckout}" >&2; return 2;;
  esac
}
main "$@"
