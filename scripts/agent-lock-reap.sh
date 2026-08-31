#!/usr/bin/env bash
# Reap helpers split from agent-lock.sh to keep the dispatcher within its S1 budget.

_reap_log() {  # <lock-file> <reason>
  local _sc _id _what
  _sc="$(_lock_field "$1" scope)"; _id="$(_lock_field "$1" id)"
  # [T002702] Fallback auf den Basename, wenn WEDER scope NOCH id gesetzt sind.
  if [ -z "$_sc" ] && [ -z "$_id" ]; then
    _what="$(basename "$1" .json)"
  else
    _what="$_sc/$_id"
  fi
  printf '%s %s %s\n' "$(_now)" "$_what" "$2" >> "$(_lock_dir)/.reap.log" 2>/dev/null || true
}

# Identitätsfelder: trägt ein Lock keines davon, benennt er keinen Halter.
_AGENT_LOCK_IDENTITY_FIELDS="owner_sid owner_pid worktree branch created_at heartbeat_at"

# 0 = die Datei trägt keinen auswertbaren Inhalt (leer / kein gültiges JSON /
# gültiges JSON ohne jedes Identitätsfeld).
_unparsable_lock() {  # <lock-file>
  local f="$1" _fld
  [ -s "$f" ] || return 0                      # Groesse 0 — der gemeldete Fall, kostenlos geprueft
  for _fld in $_AGENT_LOCK_IDENTITY_FIELDS; do
    [ -n "$(_lock_field "$f" "$_fld")" ] && return 1
  done
  return 0
}

# 0 = reapable (clearly dead). Confirmed-alive SID/live-PID/worktree-match NEVER reapable.
_reapable() {
  local f="$1" sid wt hb ct now age pid br
  [ -f "$f" ] || return 0
  # [T002702] Unparsbar => tot, OHNE Grace-Periode.
  if _unparsable_lock "$f"; then _reap_log "$f" unparsable; return 0; fi
  sid="$(_lock_field "$f" owner_sid)"; wt="$(_lock_field "$f" worktree)"
  hb="$(_lock_field "$f" heartbeat_at)"; ct="$(_lock_field "$f" created_at)"; now="$(_now)"
  br="$(_lock_field "$f" branch)"
  # Age base for grace checks: heartbeat first (last confirmed-live refresh),
  # created_at fallback for pre-heartbeat claim files. [T001582-M1]
  local age_base="${hb:-${ct:-0}}"
  # 0a) [T002785-7] Fast-Signal fuer tote Branch-Locks: der Worktree-Pfad ist
  #     nachweislich weg UND owner_pid ist tot UND der Claim ist aelter als die
  #     Grace-Frist. Die SID-Alive-Kurzschlusspruefung unten schuetzt sonst JEDEN
  #     Claim mit non-numeric Harness-SID (die gelten per Konvention immer als
  #     lebendig, siehe _sid_alive), sodass die schnellen Signale pid-dead und
  #     worktree-missing bei scope=branch strukturell nie greifen und der Lock
  #     erst nach der heartbeat-TTL (~35 min) geerntet wird (T002785 Befund 7).
  #     Eine Session, deren Arbeitsbaum nachweislich fehlt UND deren Prozess tot
  #     ist, arbeitet dort nicht mehr — lebendige SID hin oder her.
  #     T001384-D1 bleibt erhalten: ein junger Claim (< AGENT_LOCK_GRACE) wird
  #     von der Grace-Frist geschuetzt, ein lebender Prozess faellt nie hierher.
  pid="$(_lock_field "$f" owner_pid)"
  if [ -n "$wt" ] && [ "$wt" != "-" ] && [ ! -d "$wt" ] && [ -n "$pid" ] && ! _pid_alive "$pid"; then
    age=$(( now - age_base ))
    if [ -z "$ct" ] || [ "$age" -ge "$AGENT_LOCK_GRACE" ]; then
      _reap_log "$f" worktree-missing; return 0
    fi
  fi
  # 0) A CONFIRMED-ALIVE SID ALWAYS WINS — even if the worktree path is stale
  #    or missing, a live session owns the claim. [T001384]
  if [ -n "$sid" ] && _sid_alive "$sid"; then
    # [T002392-M3] Heartbeat-TTL-Check auch bei lebendiger SID: non-numeric UUIDs
    # gelten immer als "alive" — ein alter Heartbeat zeigt aber einen toten Halter.
    if [ -n "$hb" ] && [ "$(( now - hb ))" -ge "$AGENT_LOCK_TTL" ]; then
      # T014468: Wenn im Worktree noch ein Prozess läuft (z. B. ein langer Testlauf),
      # lebt die Session nachweislich — die TTL darf den Lock dann nicht abräumen.
      if [ -n "$wt" ] && [ "$wt" != "-" ] && [ -d "$wt" ]; then
        if _worktree_has_active_process "$wt"; then
          return 1
        fi
      fi
      _reap_log "$f" heartbeat-ttl; return 0
    fi
    return 1
  fi
  # 0b) Worktree+branch match beats a dead/mismatched SID: a session RESUME
  #     starts a new process with a different SID (and possibly PID), which
  #     would otherwise fall through to the pid-dead/sid-dead reap paths below.
  #     Verify liveness via the filesystem/git state instead. [T002204]
  #     [T002513] But only while the heartbeat is fresh: a resume renews it
  #     (re-claim/refresh), a dead holder never does — T002448-M8 established
  #     the heartbeat as the only reliable liveness signal. An expired heartbeat
  #     makes the lock reapable despite the worktree match.
  if [ -n "$wt" ] && [ "$wt" != "-" ] && [ -d "$wt" ] && [ -n "$br" ]; then
    local wt_branch
    wt_branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null)"
    if [ -n "$wt_branch" ] && [ "$wt_branch" = "$br" ]; then
      if [ -n "$hb" ] && [ "$(( now - hb ))" -ge "$AGENT_LOCK_TTL" ]; then
        if _worktree_has_active_process "$wt"; then
          return 1
        fi
        _reap_log "$f" heartbeat-ttl; return 0
      fi
      # T002849: a crashed holder leaves a matching worktree+branch but a dead
      # owner_pid. _pid_alive alone cannot distinguish crash from resume —
      # owner_pid belongs to the OLD process in both cases. AGENT_LOCK_GRACE is
      # the differentiating signal: a resume renews heartbeat_at within the
      # grace window, a dead holder never does. Block 0a (lines above) uses the
      # same pid+grace pattern for the no-worktree path.
      if [ -n "$pid" ] && ! _pid_alive "$pid"; then
        age=$(( now - age_base ))
        if [ -z "$ct" ] || [ "$age" -ge "$AGENT_LOCK_GRACE" ]; then
          # [T015822] Vor dem Reap-Entscheid die Worktree-Aktivität fragen —
          # ein lebender Prozess im Worktree widerlegt das Dead-Signal.
          if _holder_active_in_worktree "$f"; then return 1; fi
          _reap_log "$f" pid-dead; return 0
        fi
      fi
      return 1
    fi
  fi
  # 0c) LIVE owner_pid always wins (pgrep -s misses Claude Code session id). [T002267]
  pid="$(_lock_field "$f" owner_pid)"
  if [ -n "$pid" ] && _pid_alive "$pid"; then return 1; fi
  # 1) Dead PID + past grace → reap with reason "pid-dead" (auditable cause). [T001415]
  #    Bewusst OHNE Worktree-Probe [T015822]: dieser Pfad trifft Locks ohne
  #    Branch-Match (u.a. auf den Main-Checkout) — dort würde jede fremde
  #    Session den Lock unsterblich machen (T002267-A1-Gegenprobe,
  #    factory-reclaim-lock-respect.bats „bleibt reapable").
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
    # Bewusst OHNE Worktree-Probe [T015822] — siehe pid-dead-Kommentar oben
    # (T002267-A1-Gegenprobe: kein Branch-Match, keine Probe).
    age=$(( now - age_base ))
    if [ -z "$ct" ] || [ "$age" -ge "$AGENT_LOCK_GRACE" ]; then
      _reap_log "$f" sid-dead; return 0
    fi
  fi
  if [ -n "$hb" ] && [ "$(( now - hb ))" -ge "$AGENT_LOCK_TTL" ]; then _reap_log "$f" heartbeat-ttl; return 0; fi
  return 1
}

# [T015822] 0 = der Halter arbeitet nachweislich noch: ein fremder, lebender

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
  #     [T002502] TTL-Guard: fetch max 1x pro AGENT_LOCK_FETCH_TTL (Marker im
  #     Lock-Dir, isoliert je AGENT_LOCK_DIR; TTL=0 erzwingt, fehlender Marker
  #     = faellig).
  local _fetch_marker _fetch_age
  _fetch_marker="$(_lock_dir)/.last-fetch"
  _fetch_age=0
  if [ -f "$_fetch_marker" ]; then
    _fetch_age=$(( $(date +%s) - $(stat -c %Y "$_fetch_marker" 2>/dev/null || echo 0) ))
  fi
  if [ "${AGENT_LOCK_FETCH_TTL:-300}" -eq 0 ] || [ ! -f "$_fetch_marker" ] || [ "$_fetch_age" -ge "${AGENT_LOCK_FETCH_TTL:-300}" ]; then
    # [T004013] Der Marker-Zyklus bleibt unveraendert (die T002502-Guard-Tests
    # pruefen genau ihn), aber der eigentliche Netz-Fetch entfaellt im CI-Runner:
    # dort laeuft ein ephemerer shallow Checkout ohne lokale Feature-Branches —
    # Schritt 2c hat dort nichts zu tun. Der Fetch dort kostete 70-90s pro Lauf
    # (cold refs, ~5000 Remote-Refs) und schlug am 13.08. mit 405s pathologisch
    # auf Shard 1 der Factory-Suite durch (T002374-M2 in ci-cd.bats).
    touch "$_fetch_marker" 2>/dev/null || true
    if [ "${GITHUB_ACTIONS:-}" = "true" ] || [ "${CI:-}" = "true" ]; then
      :
    elif command -v timeout >/dev/null 2>&1; then
      timeout "${AGENT_LOCK_FETCH_TIMEOUT:-60}" git fetch --prune origin 2>/dev/null || true
    else
      git fetch --prune origin 2>/dev/null || true
    fi
  fi
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
  # Advisory half-archive check (non-fatal): surfaces uncommitted half-archived
  # OpenSpec slugs that the committed-tree check in task:openspec cannot see. [T002824]
  local _haguard _hasc
  _haguard="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/openspec-half-archive-check.sh"
  if [ -x "$_haguard" ] && ! bash "$_haguard"; then
    _hasc=$?
    echo "AGENT-LOCK: half-archived OpenSpec slug(s) detected (see above)." >&2
  fi
  return 0
}
