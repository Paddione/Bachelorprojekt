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

# Namen der harness-gesetzten Session-Variablen, in Prüfreihenfolge. [T002375-p1]
# EINE Liste für _my_sid UND _detect_tool: bis hierher prüften beide unabhängig
# voneinander `CLAUDE_SESSION_ID`, und genau so läuft eine solche Liste auseinander.
# CLAUDE_CODE_SESSION_ID zuerst, weil Claude Code sie real exportiert;
# CLAUDE_SESSION_ID bleibt gültig — opencode und agy können sie setzen, und die
# bestehenden Tests hängen daran.
_AGENT_LOCK_SID_ENVS="CLAUDE_CODE_SESSION_ID CLAUDE_SESSION_ID"

_now() { date +%s; }

_my_sid() {
  # Harness-stable env wins (Claude Code / opencode expose a session id for
  # telemetry that survives across bash tool calls). The test override
  # AGENT_LOCK_SID stays as a second layer (CI / unit tests). Only fall back
  # to the per-call Unix SID when neither harness env nor test override is
  # set — that path is the source of the cross-call drift bug. [T001268]
  # [T002375-p1] Die Harness exportiert CLAUDE_CODE_SESSION_ID, nicht CLAUDE_SESSION_ID.
  # Gemessen: `env | grep -c '^CLAUDE_SESSION_ID='` -> 0, `…CLAUDE_CODE_SESSION_ID=` -> 1.
  # Die alte Zeile las nur die zweite Variante, fiel also IMMER auf den Unix-Fallback
  # unten durch — und der ist pro Bash-Tool-Call verschieden. Folge: `release` hielt den
  # eigenen Lock für fremd und verlangte --force. Das ist keine Kosmetik: --force ist das
  # Instrument, mit dem man FREMDE lebende Locks abräumt; erzwingt der Normalfall es,
  # gewöhnt sich jeder Aufrufer daran und räumt irgendwann einen echten fremden ab.
  # AGENT_LOCK_SID ZUERST: es ist der ausdrueckliche Test-Override (siehe Dateikopf).
  # Stuende er hinter den Harness-Variablen, wuerde ambient exportiertes
  # CLAUDE_CODE_SESSION_ID ihn ueberstimmen — und jeder Test, der ihn setzt, briche in
  # einer Harness-Session. Ein Override, den ambient State ueberstimmen kann, ist keiner.
  # (Der Altcode hatte denselben Fehler mit CLAUDE_SESSION_ID davor; er biss nur nie,
  # weil diese Variable real nie gesetzt war.)
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local _v
  for _v in $_AGENT_LOCK_SID_ENVS; do
    if [ -n "${!_v:-}" ]; then printf '%s\n' "${!_v}"; return; fi
  done
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

_pid_alive() {  # <pid>
  [ -n "${1:-}" ] || return 1
  kill -0 "$1" 2>/dev/null
}

_detect_tool() {
  # CLAUDE_SESSION_ID is the harness-provided env from Claude Code / opencode;
  # we also accept the older CLAUDECODE/CLAUDE_CODE marker for back-compat.
  # CLAUDE_SESSION_ID alone is enough to identify the Claude harness. [T001268]
  # [T002375-p1] Dieselbe Namensliste wie _my_sid — sonst erkennt der eine die Harness
  # und der andere nicht.
  local _v _sid_env=""
  for _v in $_AGENT_LOCK_SID_ENVS; do [ -n "${!_v:-}" ] && _sid_env="1" && break; done
  if [ -n "${_sid_env}${CLAUDECODE:-}${CLAUDE_CODE:-}" ]; then echo claude
  elif [ -n "${GEMINI_CLI:-}${GEMINI_SANDBOX:-}${GEMINI_API_KEY:-}" ]; then echo gemini
  else echo unknown; fi
}

_lock_dir() {
  if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return; fi
  # Always anchor on the toplevel of the main checkout so the path is
  # independent of the caller's cwd (worktrees, subshell captures, etc.).
  # Falls back to /tmp/agent-locks only if `git rev-parse` itself fails —
  # never to a cwd-relative resolution, which can be silently wrong when
  # invoked from a worktree whose `.git` is a file, not a directory. [T001384]
  local toplevel common
  toplevel="$(git rev-parse --show-toplevel 2>/dev/null)" || { printf '/tmp/agent-locks\n'; return; }
  common="$(cd "$toplevel" && git rev-parse --git-common-dir 2>/dev/null)" || { printf '/tmp/agent-locks\n'; return; }
  case "$common" in /*) : ;; *) common="$(cd "$toplevel/$common" && pwd)";; esac
  printf '%s/agent-locks\n' "$common"
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
# Check if a git branch has a live (non-reapable) agent-lock claim. Used by
# cmd_reap step 2c to protect live-claimed branches from deletion. [T001448 M3]
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

_reap_log() {  # <lock-file> <reason>
  printf '%s %s/%s %s\n' "$(_now)" \
    "$(_lock_field "$1" scope)" "$(_lock_field "$1" id)" "$2" \
    >> "$(_lock_dir)/.reap.log" 2>/dev/null || true
}

# 0 = reapable (clearly dead). A confirmed-alive SID is NEVER reapable.
_reapable() {
  local f="$1" sid wt hb ct now age pid br
  [ -f "$f" ] || return 0
  sid="$(_lock_field "$f" owner_sid)"; wt="$(_lock_field "$f" worktree)"
  hb="$(_lock_field "$f" heartbeat_at)"; ct="$(_lock_field "$f" created_at)"; now="$(_now)"
  br="$(_lock_field "$f" branch)"
  # Age reference for the pid-dead/sid-dead grace checks below: prefer the
  # heartbeat (reflects the last confirmed-live refresh) and fall back to
  # created_at only for old claim files that predate the heartbeat_at field.
  # [T001582-M1] Using created_at alone wrongly reaped claims that were
  # refreshed recently but originally created long ago.
  local age_base="${hb:-${ct:-0}}"
  # 0) A CONFIRMED-ALIVE SID ALWAYS WINS — even if the worktree path is stale
  #    or missing, a live session owns the claim. Reapability only kicks in
  #    when the SID is dead (or, as a last resort, when no SID is recorded). [T001384]
  if [ -n "$sid" ] && _sid_alive "$sid"; then return 1; fi
  # 0b) Worktree+branch match beats a dead/mismatched SID: a session RESUME
  #     starts a new process with a different SID (and possibly a different
  #     PID), which would otherwise fall through to the pid-dead/sid-dead reap
  #     paths below and delete a claim that is still very much live — the
  #     worktree is sitting right there, checked out on the exact branch the
  #     claim recorded. Verify liveness via that filesystem/git state instead
  #     of trusting the volatile SID. [T002204]
  if [ -n "$wt" ] && [ "$wt" != "-" ] && [ -d "$wt" ] && [ -n "$br" ]; then
    local wt_branch
    wt_branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null)"
    [ -n "$wt_branch" ] && [ "$wt_branch" = "$br" ] && return 1
  fi
  # 0c) A LIVE owner_pid always wins. [T002267]
  #     _sid_alive resolves numeric sids via `pgrep -s`, which does NOT find the
  #     Claude Code session id even while the session is running — so the sid
  #     check in (0) reports "dead" for a perfectly live holder. Step (1) below
  #     only ever *reaps* on a dead pid; a live pid was never treated as proof of
  #     life, so such a claim fell through to the sid-dead path and `check`
  #     answered "free". The factory dispatcher then grabbed a ticket a human was
  #     holding (observed: T002255 — the T000510 guard in factory-prep-*.sh is
  #     correct, it was asking a lock that lied).
  pid="$(_lock_field "$f" owner_pid)"
  if [ -n "$pid" ] && _pid_alive "$pid"; then return 1; fi
  # 1) Dead PID + past grace → reap with reason "pid-dead" (auditable cause). [T001415]
  if [ -n "$pid" ]; then
    if ! _pid_alive "$pid"; then
      age=$(( now - age_base ))
      if [ -z "$ct" ] || [ "$age" -ge "$AGENT_LOCK_GRACE" ]; then
        _reap_log "$f" pid-dead; return 0
      fi
    fi
  fi
  if [ -n "$wt" ] && [ "$wt" != "-" ] && [ ! -d "$wt" ]; then _reap_log "$f" worktree-missing; return 0; fi
  if [ -n "$sid" ]; then
    # Dead numeric SID: a young claim (< AGENT_LOCK_GRACE) is protected from a
    # reap on the SID check alone — a transient session-id mismatch between tool
    # calls must not drop a fresh claim. Fall through to the heartbeat-TTL check.
    age=$(( now - age_base ))
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

# Reject an unrecognised argument instead of dropping it silently. The claim parsers
# used to end in `*) shift;;`, so `claim ticket T123 dev-flow-plan` (label passed
# positionally instead of via --label) returned 0 while writing a lock with empty
# `branch` and `label`. That lock then fails the dev-flow-plan pre-commit guard, which
# compares `.branch` against HEAD — and an empty `branch` also disables the
# worktree+branch liveness fallback in _reapable (see the [T002267] note below), so the
# lock goes stale earlier than the caller expects. Failing loudly is the only way the
# caller finds out. [T002363]
_reject_arg() {
  echo "AGENT-LOCK: $1: unbekanntes Argument '$2'" >&2
  echo "  Erwartet werden benannte Flags: --label <l> --worktree <p> --branch <b> --ticket <id>" >&2
  [ "$1" = "check-and-claim" ] && echo "  sowie --status-check <pfad>" >&2
  return 0
}

cmd_claim() {
  SCOPE="$1"; ID="${2:-}"; shift 2 2>/dev/null || shift $#
  LABEL=""; WT=""; BRANCH=""; TICKET=""
  while [ $# -gt 0 ]; do case "$1" in
    --label) LABEL="$2"; shift 2;; --worktree) WT="$2"; shift 2;;
    --branch) BRANCH="$2"; shift 2;; --ticket) TICKET="$2"; shift 2;;
    *) _reject_arg claim "$1"; return 2;; esac; done
  # For a branch-scoped claim the branch name IS the id; callers therefore never
  # pass --branch. Leaving `branch` empty disabled the worktree+branch liveness
  # fallback in _reapable (T002204), which requires a non-empty branch field — so
  # branch claims went stale as soon as the sid check failed, while the ticket
  # claim of the very same session stayed live. [T002267]
  [ "$SCOPE" = "branch" ] && [ -z "$BRANCH" ] && BRANCH="$ID"
  # `--worktree` absolut speichern: der Wert wurde bisher roh uebernommen, die
  # uebliche Aufrufform ist aber relativ (`--worktree .worktrees/<slug>`), und ein
  # relativer Pfad ist fuer jeden spaeteren Leser mehrdeutig — er gilt nur relativ
  # zum cwd des Claimers. Folgen im Detail im Kopf von
  # scripts/hooks/worktree-write-guard.sh; kurz: der Guard sperrt die Session aus
  # allem aus, und `_reapable` haelt lebende Locks fuer tot. Bezug ist `$PWD` (so ist
  # ein relativer Pfad definiert), nicht der Repo-Root — aus einem Worktree lieferte
  # `--show-toplevel` dessen Root statt des main-Checkouts. Kein `realpath`: der Pfad
  # muss zum Claim-Zeitpunkt nicht existieren.  [T002412]
  case "${WT:-}" in
    ""|"-"|/*) ;;
    *) WT="$PWD/${WT#./}" ;;
  esac
  # [T002375-p1] Für JEDEN anderen Scope aus dem HEAD füllen. Vorher blieb `branch`
  # bei einem ticket-scoped Claim leer — und der Pre-Commit-Guard aus dev-flow-plan
  # Schritt 5 vergleicht genau dieses Feld mit dem HEAD-Branch. Er schlug damit
  # zwangsläufig fehl, sobald man den Claim so absetzte, wie die Skill ihn
  # dokumentiert. Verschärfend: `claim` ist idempotent und überschreibt einen
  # bestehenden Lock nicht, ein einmal leer angelegter ließ sich also nicht durch
  # erneutes Claimen reparieren.
  #
  # Scheitert rev-parse (detached HEAD, kein Repo), bleibt das Feld leer und der Claim
  # läuft trotzdem durch: `branch` ist Diagnose-Information, keine Vorbedingung — ein
  # Claim darf hier nicht scheitern.
  if [ -z "$BRANCH" ]; then
    BRANCH="$(git -C "${WT:-$PWD}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    [ "$BRANCH" = "HEAD" ] && BRANCH=""
  fi
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

# NOTE: cmd_release compares owner_sid with _my_sid (derived from $$/PPID). When the claim
# was issued inside a subshell (e.g. `cd worktree && claim ...`), the SID may differ,
# causing a false mismatch. Consider using a stable session identifier from the environment
# (e.g. CLAUDE_SESSION_ID) for cross-subshell consistency.
cmd_release() {
  local scope="$1" id="${2:-}" force=""; [ "${3:-}" = "--force" ] && force=1
  local f; f="$(_lock_file "$scope" "$id")"
  [ -f "$f" ] || return 0
  local owner_sid
  owner_sid="$(_lock_field "$f" owner_sid)"
  # Auto-release if owner SID is dead (crashed session). SID-based check before
  # the identity comparison prevents --force-less release of a live foreign lock
  # whose SID happens to be unreachable by pgrep (non-numeric SIDs are always
  # considered alive by _sid_alive). [T002373-M2]
  if [ -n "$force" ] \
    || [ "$owner_sid" = "$(_my_sid)" ] \
    || { [ -n "$owner_sid" ] && ! _sid_alive "$owner_sid"; }; then
    rm -f "$f"; return 0
  fi
  echo "release: lock owned by SID $owner_sid, current SID $(_my_sid) — use --force" >&2
  return 1
}

cmd_check() {
  local f; f="$(_lock_file "$1" "${2:-}")"
  if [ ! -f "$f" ] || _reapable "$f"; then echo "free"; return 0; fi
  if [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ]; then echo "mine"; cat "$f"; return 0; fi
  echo "held"; cat "$f"; return 3
}

# Atomic check-and-claim for ticket scope. Avoids the TOCTOU window between
# cmd_check (advisory) and cmd_claim (lock). Returns same exit codes as claim
# (0=ok, 1=held by other) but never writes a lock if the ticket-status DB check
# signals the ticket is already done/merged. [T002038]
cmd_check_and_claim() {
  local scope="$1" id="${2:-}"; shift 2 2>/dev/null || shift $#
  # --status-check <path> is optional: point to a script that returns 0 iff the
  # ticket is still live (plan_staged) and not yet done/merged.
  local status_check_script="" LABEL="" WT="" BRANCH="" TICKET=""
  while [ $# -gt 0 ]; do case "$1" in
    --status-check) status_check_script="$2"; shift 2;;
    --label) LABEL="$2"; shift 2;; --worktree) WT="$2"; shift 2;;
    --branch) BRANCH="$2"; shift 2;; --ticket) TICKET="$2"; shift 2;;
    *) _reject_arg check-and-claim "$1"; return 2;; esac; done

  # 1) Optional external status-check (e.g. ticket.sh get --id + jq).
  #    If the ticket is already done/merged/archived, refuse the claim.
  if [ -n "$status_check_script" ]; then
    if ! bash "$status_check_script" "$id" 2>/dev/null; then
      echo "AGENT-LOCK: Ticket $id status check FAILED (done/merged?) — refusing claim." >&2
      return 2
    fi
  fi

  # 2) Check first (advisory, no lock) for early exit: if held by another
  #    session, don't bother writing.
  local f; f="$(_lock_file "$scope" "$id")"
  if [ -f "$f" ] && ! _reapable "$f"; then
    if [ "$(_lock_field "$f" owner_sid)" != "$(_my_sid)" ]; then
      echo "AGENT-LOCK: $scope/$id bereits $(_holder_msg "$f")" >&2
      return 1
    fi
    # Our own lock — refresh via cmd_claim (which re-reads existing fields).
  fi

  # 3) Atomic claim under flock. Only cmd_claim acquires the registry lock, so
  #    two concurrent check-and-claim calls serialize here.
  cmd_claim "$scope" "$id" --label "$LABEL" --worktree "$WT" --branch "$BRANCH" --ticket "$TICKET"
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

# NOTE: cmd_reap() does NOT delete worktree directories.
# It only (1) kills orphan processes with deleted cwd, (2) prunes git worktree
# admin metadata, (2c) deletes local branches already merged into main, and
# (3) drops dead lock files (.json). No existing worktree directory is removed.
# For zombie worktree cleanup, see scripts/factory/watchdog.sh (git-status-guarded
# force-remove). [T002242 M2-DOC]
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
    # skip branches that have a live agent-lock claim (e.g. dev-flow-plan in progress) [T001448 M3]
    if _branch_is_live_claimed "$br"; then
      echo "AGENT-LOCK: Skipping branch '$br' (live agent-lock claim)" >&2
      continue
    fi
    # only delete if the upstream tracking branch is gone
    upstream="$(git rev-parse --abbrev-ref "$br@{upstream}" 2>/dev/null)" || true
    if [ -z "$upstream" ] || ! git show-ref --verify --quiet "refs/remotes/$upstream" 2>/dev/null; then
      git branch -d "$br" 2>/dev/null || true
    fi
  done
  # 3) drop reapable (clearly dead) locks — hold the registry lock so this
  #    sweep is serialised against cmd_claim / cmd_refresh / cmd_release.
  #    Without the lock, a concurrent claim can write a fresh lock file
  #    and have it immediately deleted here. [T001384]
  _with_lock
  if [ -d "$d" ]; then
    local f
    for f in "$d"/*.json; do [ -e "$f" ] || continue; _reapable "$f" && rm -f "$f"; done
  fi
  return 0
}


# Die beiden Git-Hook-Guards liegen in einer eigenen Datei [T002375-p1] — diese hier
# stand bei 464 von 500 erlaubten Zeilen (S1, .sh) und hatte für den Change keinen Platz.
# Die Aufrufschnittstelle bleibt `agent-lock.sh guard-precommit|guard-postcheckout`,
# damit .githooks/pre-commit und .githooks/post-checkout unverändert bleiben können.
# Fail-loud: fehlt die Datei, sind die Guards stumm wirkungslos — und ein Guard, der
# schweigend nichts tut, ist schlimmer als gar keiner.
_AGENT_LOCK_DIR_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$_AGENT_LOCK_DIR_SELF/agent-lock-guards.sh" ]; then
  # shellcheck source=scripts/agent-lock-guards.sh
  . "$_AGENT_LOCK_DIR_SELF/agent-lock-guards.sh"
else
  echo "AGENT-LOCK: FATAL — scripts/agent-lock-guards.sh fehlt neben $0" >&2
  exit 1
fi

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    claim)   cmd_claim "$@";;
    refresh) cmd_refresh "$@";;
    release) cmd_release "$@";;
    check)   cmd_check "$@";;
    check-and-claim) cmd_check_and_claim "$@";;
    list)    cmd_list "$@";;
    reap)    cmd_reap "$@";;
    mine)    _my_sid;;
    guard-precommit)    cmd_guard_precommit "$@";;
    guard-postcheckout) cmd_guard_postcheckout "$@";;
    *) echo "Usage: agent-lock.sh {claim|refresh|release|check|check-and-claim|list|reap|mine|guard-precommit|guard-postcheckout}" >&2; return 2;;
  esac
}
main "$@"
