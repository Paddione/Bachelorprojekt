#!/usr/bin/env bash
# scripts/agent-lock.sh — cross-tool session-coordination lock registry. [T000510]
# One JSON file per claim under $AGENT_LOCK_DIR (shared gitdir's agent-locks/).
# Test overrides: AGENT_LOCK_DIR, AGENT_LOCK_SID, AGENT_LOCK_FAKE_ALIVE, AGENT_LOCK_TOOL,
# AGENT_LOCK_FETCH_TTL.
set -uo pipefail

# [T002571] Der Heartbeat-Vergleich unten ist `-ge`, nicht `-gt`: die Zeitbasis ist
# sekundengenau, also hiesse `-gt 0` faktisch "TTL 1s" statt "keine Toleranz".
# Genau daran war T002448-M8 zu ~50% flaky — fielen claim und reap in dieselbe
# Sekunde, ueberlebte der Lock. Bei Default 1800 ist der Unterschied wirkungslos.
AGENT_LOCK_TTL="${AGENT_LOCK_TTL:-1800}"
AGENT_LOCK_GRACE="${AGENT_LOCK_GRACE:-120}"
# [T002502] cmd_reap-Fetch (pre-claim reap bei JEDEM claim) max 1x pro TTL-Fenster:
# ohne Guard kostete claim-persist.bats Test 4 ~92s lokal / ~310s auf CI-Shard 4.
AGENT_LOCK_FETCH_TTL="${AGENT_LOCK_FETCH_TTL:-300}"

# [T003102] SCOPE-SEMANTIK — was ein Claim schuetzt und wen er AUSSPERRT.
#
#   ticket-scoped  (claim ticket <id>):
#     * Signal: "an Ticket <id> wird gearbeitet". Dispatch-Gates
#       (scripts/vda/factory-prep.sh, scripts/factory/watchdog.sh) fragen
#       `check ticket <id>` vor dem Dispatch ab und ueberspringen gehaltene
#       Tickets.
#     * ERZWUNGEN im Status-Schreibpfad: scripts/vda/ticket/_ticket-core.sh
#       `_ticket_lock_guard` blockt update-status/update-fields bei einem
#       fremden ticket-Claim (T002282). Das ist der einzige erzwungene Scope.
#     * FALLE (T003102): der Halter blockt damit den ABSCHLUSS seiner eigenen
#       Arbeit. Subagent (andere SID), ticket-mcp (eigener Prozess) und der
#       post-merge-Poller (scripts/factory/auto-close-merged.sh via
#       github-poller systemd-Timer) schreiben alle im selben Vorgang, keiner
#       haelt die SID des Claimers — "eine Session = eine SID" haelt nicht.
#       Seit T003102 blockt `_ticket_lock_guard` den Abschluss
#       (update-status → done/archived) nicht mehr (closure-Modus), nur noch
#       nicht-terminale Uebergaenge sind geschuetzt.
#     * Empfehlung: NUR claimen, wenn DIESE Session den Abschluss selbst
#       ausfuehrt; nach getaner Arbeit `release ticket <id>`.
#
#   branch-scoped  (claim branch <branch>):
#     * Signal: "im Worktree/Branch <branch> wird gearbeitet" — der
#       Kollisionsschutz fuer die Dateiarbeit. Respektiert von
#       worktree-create.sh, babysit-prs.sh (check-branch-live) und dem
#       worktree-write-guard.
#     * BLOCKT den Status-Schreibpfad NICHT (`_ticket_lock_guard` prueft nur
#       den ticket-Scope) — Subagent und post-merge koennen trotzdem
#       abschliessen. Das Dispatch-Gate in factory-prep.sh sieht einen
#       branch-Lock ueber die Ticket-ID im Branch-Namen (*-<ext-id>).
#     * Empfehlung: Standard-Scope fuer Dispatch und Implementierung
#       (ticket-ops Step 3.6, dev-flow-execute/opencode-flow-execute).
#
#   Komponenten, die den ticket-scoped Lock pruefen (T003102-Analyse):
#     - scripts/vda/ticket/_ticket-core.sh:_ticket_lock_guard — Schreibpfad
#       (update-status.sh, update-fields.sh), blockt bei fremder SID; seit
#       T003102 mit closure-Ausnahme fuer done/archived.
#     - scripts/vda/factory-prep.sh — Dispatch-Gate, ueberspringt gehaltene
#       Tickets (advisory, gibt Slot frei).
#     - scripts/factory/watchdog.sh — Orphan-Sweep, haelt in_progress-Tickets
#       mit Lock als "nicht verwaist".

# Harness-Session-Variablen in Prüfreihenfolge: CLAUDE_CODE_SESSION_ID zuerst. [T002375-p1]
# [T002671] OPENCODE_SESSION_ID ergaenzt; Sync mit agent-lock-identity.sh halten
# (diese Kopf-Definition dient als Diagnose-Quelle fuer die Warnmeldung, die
# agent-lock-identity.sh-Ueberschreibung laeuft erst beim source in Zeile ~559).
_AGENT_LOCK_SID_ENVS="CLAUDE_CODE_SESSION_ID CLAUDE_SESSION_ID OPENCODE_SESSION_ID"
# Harness-Marker ohne Session-ID, fuer _detect_tool als benannte Liste. [T002451]
_AGENT_LOCK_TOOL_MARKER_ENVS="CLAUDECODE CLAUDE_CODE"

_now() { date +%s; }

_my_sid() {
  # Harness-stable env wins (Claude Code / opencode expose a session id surviving
  # bash tool calls); AGENT_LOCK_SID override stays as second layer (CI/unit tests);
  # per-call Unix-SID is the fallback and the source of the drift bug. [T001268]
  # [T002375-p1] Harness exportiert CLAUDE_CODE_SESSION_ID, nicht CLAUDE_SESSION_ID.
  if [ -n "${AGENT_LOCK_SID:-}" ]; then printf '%s\n' "$AGENT_LOCK_SID"; return; fi
  local _v
  for _v in $_AGENT_LOCK_SID_ENVS; do
    if [ -n "${!_v:-}" ]; then printf '%s\n' "${!_v}"; return; fi
  done
  # [T002381-M1] Weder Harness-Env noch AGENT_LOCK_SID gesetzt — der Unix-SID-Fallback
  # driftet pro Bash-Call. Warnung ausgeben, damit der Operator die Ursache erkennt
  # und AGENT_LOCK_SID setzen oder die Harness-Variable bereitstellen kann.
  echo "WARNUNG: _my_sid — weder CLAUDE_CODE_SESSION_ID/CLAUDE_SESSION_ID noch AGENT_LOCK_SID gesetzt. SID driftet pro Bash-Call (siehe T001268/T002381)." >&2
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
  # Uses same env list as _my_sid so both agree on harness detection. [T001268][T002375-p1]
  local _v _sid_env="" _is_claude=0
  for _v in $_AGENT_LOCK_SID_ENVS; do [ -n "${!_v:-}" ] && _sid_env="1" && break; done
  for _v in $_AGENT_LOCK_TOOL_MARKER_ENVS; do [ -n "${!_v:-}" ] && _sid_env="1" && _is_claude=1 && break; done
  if [ -n "${_sid_env}" ]; then
    [ "$_is_claude" -eq 1 ] && echo claude || echo opencode
  elif [ -n "${GEMINI_CLI:-}${GEMINI_SANDBOX:-}${GEMINI_API_KEY:-}" ]; then echo gemini
  else echo unknown; fi
}

_lock_dir() {
  if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return; fi
  # Anchor on git toplevel, not caller cwd (worktrees have .git as file). [T001384]
  local toplevel common
  toplevel="$(git rev-parse --show-toplevel 2>/dev/null)" || { printf '/tmp/agent-locks\n'; echo "AGENT-LOCK: Fallback auf /tmp/agent-locks (kein Git-Repo erkennbar)" >&2; return; }
  common="$(cd "$toplevel" && git rev-parse --git-common-dir 2>/dev/null)" || { printf '/tmp/agent-locks\n'; echo "AGENT-LOCK: Fallback auf /tmp/agent-locks (git-common-dir nicht lesbar)" >&2; return; }
  case "$common" in /*) : ;; *) common="$(cd "$toplevel/$common" && pwd)";; esac
  printf '%s/agent-locks\n' "$common"
}

_sanitize() { printf '%s' "$1" | tr '/ ' '--'; }

_lock_file() { # <scope> [id]
  if [ "$1" = "main-checkout" ]; then printf '%s/main-checkout.json\n' "$(_lock_dir)";
  else printf '%s/%s__%s.json\n' "$(_lock_dir)" "$1" "$(_sanitize "${2:-}")"; fi
}

_lock_field() { sed -n "s/.*\"$2\": *\"\\([^\"]*\\)\".*/\\1/p" "$1" 2>/dev/null | head -1; }

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
  if [ -n "$hb" ] && [ "$(( now - hb ))" -ge "$AGENT_LOCK_TTL" ]; then _reap_log "$f" heartbeat-ttl; return 0; fi
  return 1
}

# 0 = this lock belongs to the caller — either by matching owner_sid, or by
# matching the caller's worktree (cwd). The cwd-independent path is critical
# because agent-lock is called from subdirectories within a worktree, where the
# string-equality check on $PWD against the stored worktree path fails as soon
# as the cwd is e.g. the scripts/ subdirectory instead of the worktree root.
# [T003110]
_lock_is_mine() {  # <lock-file>
  local f="$1" sid wt
  sid="$(_lock_field "$f" owner_sid)"
  # Fast path: exact SID match
  [ "$sid" = "$(_my_sid)" ] && return 0
  # Slow path: worktree containment — the cwd (or its git toplevel) falls
  # within the stored worktree path. Handles subdirectory cd within a worktree.
  wt="$(_lock_field "$f" worktree)"
  if [ -n "$wt" ] && [ "$wt" != "-" ]; then
    local my_toplevel
    my_toplevel="$(git rev-parse --show-toplevel 2>/dev/null)" || my_toplevel="$PWD"
    # Exact match or prefix match (path containment)
    if [ "$my_toplevel" = "$wt" ] || [[ "$my_toplevel" = "$wt"/* ]] \
       || [ "$PWD" = "$wt" ] || [[ "$PWD" = "$wt"/* ]]; then
      return 0
    fi
  fi
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
  # [T002692] Die Zeile nannte zuvor nur die Flags. Wer auf einen abgelehnten
  # Aufruf hin '--ticket <id>' voranstellte, erzeugte damit einen Lock mit
  # scope='--ticket' — die Meldung riet also zur kaputten Form. Scope und id
  # gehoeren zuerst und positional.
  echo "  Scope und id stehen zuerst und positional: $1 <scope> <id> [flags]" >&2
  echo "  Erwartete Flags: --label <l> --worktree <p> --branch <b> --ticket <id>" >&2
  echo "  Dabei ist --ticket die Ticket-REFERENZ, nicht der Scope." >&2
  [ "$1" = "check-and-claim" ] && echo "  sowie --status-check <pfad>" >&2
  return 0
}

cmd_claim() {
  # [T003107] --help was previously read as a scope name and produced --help__.json
  if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat <<'HELP'
Usage: agent-lock.sh claim <scope> <id> [flags]

Flags:
  --label <l>      Set label
  --worktree <p>   Set worktree path
  --branch <b>     Set branch name
  --ticket <id>    Set ticket reference
  --force         Force claim
HELP
    exit 0
  fi

  cmd_reap 2>/dev/null || true  # [T002341-M3] pre-claim reap: orphaned locks don't block new claim, best-effort
  SCOPE="${1:-}"; ID="${2:-}"; shift 2 2>/dev/null || shift $#
  if [ -z "$SCOPE" ] || [[ "$SCOPE" == -* ]]; then
    _reject_arg claim "$SCOPE"
    return 2
  fi
  LABEL=""; WT=""; BRANCH=""; TICKET=""; FORCE=""
  while [ $# -gt 0 ]; do case "$1" in
    --label) LABEL="$2"; shift 2;; --worktree) WT="$2"; shift 2;;
    --branch) BRANCH="$2"; shift 2;; --ticket) TICKET="$2"; shift 2;;
    --force|-F) FORCE=1; shift;;
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
    ".") WT="$PWD" ;;
    *) WT="$PWD/${WT#./}" ;;
  esac
  WT="${WT%/}"
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
      CREATED="$(_lock_field "$f" created_at)"; _write_lock "$f"
      # [T002826] Verify persistence after write — silent claim failures were
      # reported as success and left the caller unprotected.
      if [ -f "$f" ] && [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ]; then
        return 0
      fi
      echo "AGENT-LOCK: fatal — claim refresh wrote $f but verification failed" >&2
      return 4
    fi
    if [ -n "$FORCE" ]; then
      local _pid; _pid="$(_lock_field "$f" owner_pid)"
      if [ -z "$_pid" ] || ! _pid_alive "$_pid"; then
        _reap_log "$f" claim-force; rm -f "$f"
      else
        echo "AGENT-LOCK: claim --force abgelehnt: owner_pid $_pid lebt noch" >&2
        return 1
      fi
    else
      echo "AGENT-LOCK: $SCOPE/$ID bereits $(_holder_msg "$f")" >&2
      return 1
    fi
  fi
  CREATED="$(_now)"; _write_lock "$f"
  # [T002826] Verify persistence after write.
  if [ -f "$f" ] && [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ]; then
    return 0
  fi
  echo "AGENT-LOCK: fatal — claim wrote $f but verification failed" >&2
  return 4
}

cmd_refresh() {
  SCOPE="$1"; ID="${2:-}"; local f; f="$(_lock_file "$SCOPE" "$ID")"
  [ -f "$f" ] || return 1
  _lock_is_mine "$f" || return 1
  LABEL="$(_lock_field "$f" label)"; WT="$(_lock_field "$f" worktree)"
  BRANCH="$(_lock_field "$f" branch)"; TICKET="$(_lock_field "$f" ticket)"
  CREATED="$(_lock_field "$f" created_at)"; _write_lock "$f"; return 0
}

# NOTE: cmd_release compares SID with _my_sid. When claim happened in a subshell
# the SID may differ — see T001268.
cmd_release() {
  local scope="$1" id="${2:-}" force=""; [ "${3:-}" = "--force" ] && force=1
  local f; f="$(_lock_file "$scope" "$id")"
  [ -f "$f" ] || return 0
  local owner_sid; owner_sid="$(_lock_field "$f" owner_sid)"
  # [T002373-M2] Auto-release nur bei eigenem Lock oder totem Owner. Gleiche Tool-Klasse
  # berechtigt NICHT: im Betrieb melden alle beteiligten Sessions dieselbe Klasse, der
  # Ownership-Check waere damit wirkungslos. Der Fallback aus T002374 war ein Workaround
  # gegen SID-Drift pro Bash-Call — diese Ursache ist seit T002375-p1 behoben. [T002447]
  if [ -n "$force" ] || _lock_is_mine "$f" \
     || { [ -n "$owner_sid" ] && ! _sid_alive "$owner_sid"; }; then
    rm -f "$f"; return 0
  fi
  echo "release: lock owned by SID $owner_sid, current SID $(_my_sid) — use --force" >&2
  return 1
}

cmd_check() {
  local f; f="$(_lock_file "$1" "${2:-}")"
  if [ ! -f "$f" ] || _reapable "$f"; then echo "free"; return 0; fi
  # [T003110] cwd-independent ownership: _lock_is_mine matches by owner_sid OR
  # worktree path containment, so a lock recognised from a subdirectory (e.g.
  # scripts/ within the worktree) still reports "mine".
  if _lock_is_mine "$f"; then echo "mine"; cat "$f"; return 0; fi
  # [T005560] Toter Halter = kein Schutz gegen Doppelarbeit: advisory rc=4,
  # Lock bleibt bestehen (Reap-Entscheidung bleibt bei _reapable).
  local _hp; _hp="$(_lock_field "$f" owner_pid)"
  if [ -n "$_hp" ] && ! _pid_alive "$_hp"; then echo "held-stale"; cat "$f"; return 4; fi
  echo "held"; cat "$f"; return 3
}

# Atomic check-and-claim for ticket scope. Avoids the TOCTOU window between
# cmd_check (advisory) and cmd_claim (lock). Returns same exit codes as claim
# (0=ok, 1=held by other) but never writes a lock if the ticket-status DB check
# signals the ticket is already done/merged. [T002038]
cmd_check_and_claim() {
  # [T002692/T002693] Scope und id sind POSITIONAL. Ohne diese Pruefung las
  # `local scope="$1"` ein vorangestelltes Flag als Scope-Namen: aus
  # `check-and-claim --ticket T002657` wurde ein Lock mit scope='--ticket',
  # gemeldet mit Exit 0. So ein Lock wird von scope-basierten Abfragen und vom
  # Reap nicht als ticket-Lock erkannt — er sperrt faktisch nichts und bleibt
  # liegen. `--ticket` ist weiterhin gueltig, aber als Ticket-REFERENZ an einem
  # Branch-Lock (`check-and-claim branch feature/x --ticket T123`).
  #
  # Ohne Argumente schlug zuvor `set -u` mit '$1: unbound variable' zu — eine
  # Zeilennummer statt der erwarteten Form.
  # Guard: tests/spec/software-factory/agent-lock-scope-argument.bats
  if [ $# -lt 2 ] || [ "${1#-}" != "$1" ]; then
    echo "AGENT-LOCK: check-and-claim erwartet <scope> <id> als Positionsargumente." >&2
    echo "  Beispiel: agent-lock.sh check-and-claim ticket T002657 --label dev-flow-execute" >&2
    echo "  Optionale Flags: --label <l> --worktree <p> --branch <b> --ticket <id> --status-check <pfad>" >&2
    echo "  Hinweis: --ticket ist die Ticket-REFERENZ (z.B. an einem branch-Lock), kein Scope." >&2
    return 2
  fi
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
    if ! _lock_is_mine "$f"; then
      echo "AGENT-LOCK: $scope/$id bereits $(_holder_msg "$f")" >&2
      return 1
    fi
    # Our own lock — refresh via cmd_claim (which re-reads existing fields).
  fi

  # 3) Atomic claim under flock. Only cmd_claim acquires the registry lock, so
  #    two concurrent check-and-claim calls serialize here.
  cmd_claim "$scope" "$id" --label "$LABEL" --worktree "$WT" --branch "$BRANCH" --ticket "$TICKET"
}

# [T002896] Oeffentlicher Wrapper um _branch_is_live_claimed — erlaubt
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

cmd_list() {
  local d; d="$(_lock_dir)"; [ -d "$d" ] || { echo "(keine aktiven Claims)"; return 0; }
  printf '%-14s %-24s %-8s %-10s %-6s %-20s %s\n' SCOPE ID TOOL SID STATE LABEL FILE
  local f state
  for f in "$d"/*.json; do
    [ -e "$f" ] || continue
    state=live; _reapable "$f" && state=stale
    printf '%-14s %-24s %-8s %-10s %-6s %-20s %s\n' \
      "$(_lock_field "$f" scope)" "$(_lock_field "$f" id)" "$(_lock_field "$f" tool)" \
      "$(_lock_field "$f" owner_sid)" "$state" "$(_lock_field "$f" label)" "$(basename "$f" .json)"
  done
}

# [T002809] Deliberater Takeover des main-Checkout-Locks, wenn er nur als auto-claimed
# Bookkeeping (Label _SELF_CLAIM_LABEL) einer ANDEREN Session gefuehrt wird. cmd_claim
# ueberschreibt einen fremden Lock nie und cmd_guard_postcheckout revertiert nur bei
# SID-Match — eine spaetere Session mit anderer SID konnte den Lock daher nie fuer ihren
# Branch-Wechsel uebernehmen und der Wechsel wurde still revertiert.
cmd_reclaim_main_checkout() {
  local f; f="$(_lock_file main-checkout)"
  [ -f "$f" ] || return 0
  _with_lock
  local owner_sid label
  owner_sid="$(_lock_field "$f" owner_sid)"
  label="$(_lock_field "$f" label)"
  [ "$owner_sid" = "$(_my_sid)" ] && return 0
  if [ "$label" != "$_SELF_CLAIM_LABEL" ]; then
    echo "AGENT-LOCK: reclaim-main-checkout abgelehnt — main-Checkout $(_holder_msg "$f")" >&2
    echo "  Das ist ein deliberater Claim, keine Bookkeeping-Eintragung. Koordiniere mit" >&2
    echo "  der haltenden Session oder nutze einen Worktree." >&2
    return 1
  fi
  local br; br="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  [ "$br" = "HEAD" ] && br=""
  SCOPE=main-checkout; ID=""; LABEL="$_SELF_CLAIM_LABEL"; WT=""; BRANCH="$br"; TICKET=""
  CREATED="$(_now)"; _write_lock "$f"
  echo "AGENT-LOCK: main-checkout reclaimed (vorher $owner_sid, jetzt $(_my_sid))." >&2
  return 0
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


_AGENT_LOCK_DIR_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Git-Hook-Guards in eigener Datei [T002375-p1] unter S1-Limit. Fail-loud: stumm = schlimmer.
# Beide Fragmente sind ausgelagert, damit diese Datei unter dem S1-Limit von
# 500 Zeilen bleibt (guards: T002214, merged/check-merged: T002279).
# shellcheck source=scripts/agent-lock-guards.sh
# shellcheck source=scripts/agent-lock-merged.sh
# shellcheck source=scripts/agent-lock-identity.sh
for _agent_lock_frag in agent-lock-identity.sh agent-lock-guards.sh agent-lock-merged.sh agent-lock-activity.sh; do
  [ -f "$_AGENT_LOCK_DIR_SELF/$_agent_lock_frag" ] || {
    echo "AGENT-LOCK: FATAL — scripts/$_agent_lock_frag fehlt neben $0" >&2; exit 1; }
  . "$_AGENT_LOCK_DIR_SELF/$_agent_lock_frag"
done
unset _agent_lock_frag

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    claim)   cmd_claim "$@";;
    refresh) cmd_refresh "$@";;
    release) cmd_release "$@";;
    check)   cmd_check "$@";;
    check-and-claim) cmd_check_and_claim "$@";;
    check-branch-live) cmd_check_branch_live "$@";;
    check-merged)    cmd_check_merged "$@";;
    list)    cmd_list "$@";;
    reap)    cmd_reap "$@";;
    mine)    _my_sid;;
    activity) cmd_activity "$@";;
    guard-precommit)    cmd_guard_precommit "$@";;
    guard-postcheckout) cmd_guard_postcheckout "$@";;
    reclaim-main-checkout) cmd_reclaim_main_checkout "$@";;
    *) echo "Usage: agent-lock.sh {claim|refresh|release|check|check-and-claim|check-branch-live|check-merged|list|reap|mine|guard-precommit|guard-postcheckout|reclaim-main-checkout}" >&2; return 2;;
  esac
}
main "$@"
