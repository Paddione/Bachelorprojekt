#!/usr/bin/env bash
# scripts/factory/wakeup.sh — headless Software Factory dispatcher wrapper.
#
# Fired by the systemd USER timer (factory.timer → factory.service). It is
# DELIBERATELY DUMB ("Inversion of Intelligence", spec §4): it carries no
# scheduling judgement — every guard (kill-switch, daily-cap, dry-run-first) is
# read fresh inside dispatcher.js PREP from each brand DB. This wrapper only:
#   1. cd's to the repo (the single locus with checkout + git-crypt + kubeconfig)
#   2. single-flights via flock (belt-and-braces over OnUnitInactiveSec)
#   3. unlocks git-crypt if the working tree is locked
#   4. runs a headless `claude -p` dispatcher tick, then loops while the queue
#      has pending work (idle-retick) — the next tick starts immediately instead
#      of waiting for the timer's OnUnitInactiveSec delay.
#
# The Cron-poll IS the trigger: dispatcher.js → schedule.sh polls the backlog.
# RuntimeMaxSec (hung-run kill) is handled by systemd, not here.
#
#   Env knobs (all optional, sane defaults):
#     FACTORY_REPO                  repo root            (default: /home/patrick/Bachelorprojekt)
#     FACTORY_DRY_RUN               true|false           (default: true — fail-safe)
#     FACTORY_GITCRYPT_KEY          path to bp-secrets.key for `task secrets:unlock`
#     FACTORY_CLAUDE_BIN            claude binary        (default: claude on PATH)
#     FACTORY_DISPATCHER_BRIDGE     dispatcher-bridge.sh path (default: <repo>/scripts/factory/dispatcher-bridge.sh)
#     FACTORY_TICK_LOCK             single-flight lock   (default: /tmp/factory-tick.lock)
#     FACTORY_ENV_FILE              prod config to source(default: ~/.config/factory/autopilot.env)
#     FACTORY_IDLE_RETICK_ENABLED   true|false  immediately re-tick if queue non-empty after tick (default: true)
#     FACTORY_IDLE_RETICK_DELAY     seconds to wait between reticks (default: 5)
set -euo pipefail

# ── Argument handling [T002662] ─────────────────────────────────────────────
# wakeup.sh is fired by the systemd USER timer (factory.timer → factory.service)
# and takes NO arguments in its operational path. Before any side effect (env
# sourcing, flock, git pull, force-tick consumption, tick loop):
#   --help / -h  → print usage, exit 0
#   anything else → error on stderr, exit 2
# Pre-fix, a --help call was silently ignored and ran a real dry-run tick. [T002662]
_usage() {
  sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}
case "${1:-}" in
  '' ) : ;;
  --help|-h )
    _usage
    exit 0
    ;;
  * )
    echo "wakeup.sh: unknown argument '${1}' — this wrapper takes no arguments (see --help)" >&2
    exit 2
    ;;
esac

# Production config (real claude bin, DeepSeek creds, dry_run policy). Sourced
# with set -a so it exports everything — which means it CLOBBERS pre-set env.
# Tests point FACTORY_ENV_FILE at a non-existent path for full env isolation. [T000523]
FACTORY_ENV_FILE="${FACTORY_ENV_FILE:-${HOME}/.config/factory/autopilot.env}"
if [[ -f "${FACTORY_ENV_FILE}" ]]; then
  set -a
  source "${FACTORY_ENV_FILE}"
  set +a
fi

REPO="${FACTORY_REPO:-/home/patrick/Bachelorprojekt}"
DRY_RUN="${FACTORY_DRY_RUN:-true}"
export CLAUDE_BIN="${FACTORY_CLAUDE_BIN:-claude}"
DISPATCHER_BRIDGE="${FACTORY_DISPATCHER_BRIDGE:-${REPO}/scripts/factory/dispatcher-bridge.sh}"
LOCKFILE="${FACTORY_TICK_LOCK:-/tmp/factory-tick.lock}"
IDLE_RETICK="${FACTORY_IDLE_RETICK_ENABLED:-true}"
RETICK_DELAY="${FACTORY_IDLE_RETICK_DELAY:-5}"

cd "${REPO}"

# [T002381-M3] Vor jedem Tick den lokalen main-Ref aktualisieren, damit die
# Factory nicht mit stale Code tickt. Fail-open: bei Fehler (z.B. kein Netz)
# laeuft mit dem aktuellen Stand weiter — besser stale als ausgefallen.
git pull --ff-only origin main 2>/dev/null || true

# ── single-flight: acquire the tick lock non-blocking; bail if a tick is live ──
exec 9>"${LOCKFILE}"
if ! flock -n 9; then
  echo "wakeup.sh: a factory tick is already running (flock ${LOCKFILE} held) — skipping" >&2
  exit 0
fi

bash "${REPO}/scripts/agent-msg.sh" read --unread 2>/dev/null || true
AGENT_MSG_LABEL=factory bash "${REPO}/scripts/agent-msg.sh" post "factory-tick: starting (dry_run=${DRY_RUN})" 2>/dev/null || true

# [T002689] Nur Funktionsdefinitionen — lib.sh setzt weder Optionen noch
# Variablen im Top-Level. Gebraucht fuer factory_backlog_count (Idle-Retick).
# shellcheck source=scripts/factory/lib.sh
source "${REPO}/scripts/factory/lib.sh"

# ── factory_control helper (best-effort, per brand) ───────────────────────────
# Runs factory_psql for BRAND=$1 in a subshell so lib.sh's `set -euo pipefail`
# and factory_resolve's `exit 2` can never abort this tick. SQL on stdin, extra
# args forwarded (mirrors factory_psql). Stdout is the query result (may be empty).
_control_psql() {
  local brand="$1"; shift
  ( set +e; BRAND="$brand" source "${REPO}/scripts/factory/lib.sh"; factory_resolve; \
    factory_psql "$@" ) 2>/dev/null || true
}

# ── Force-Tick flag: read + clear (both brands) ───────────────────────────────
# The admin "Force next tick" button writes factory_control.force-tick-requested
# (brand IS NULL). We log if present and delete it so it is consumed exactly once.
for _ft_brand in mentolder korczewski; do
  _forced="$(printf '%s' \
    "SELECT value FROM tickets.factory_control WHERE key='force-tick-requested' AND brand IS NULL LIMIT 1;" \
    | _control_psql "$_ft_brand")"
  if [[ -n "${_forced}" ]]; then
    echo "wakeup.sh: forced tick requested (${_ft_brand} @ ${_forced}) — consuming flag" >&2
    printf '%s' \
      "DELETE FROM tickets.factory_control WHERE key='force-tick-requested' AND brand IS NULL;" \
      | _control_psql "$_ft_brand" >/dev/null
  fi
done

# ── git-crypt: a locked secrets file starts with the \0GITCRYPT\0 magic ───────
# We probe one known-encrypted file; if it is still ciphertext, unlock the tree.
CRYPT_PROBE="environments/.secrets/mentolder.yaml"
if [[ -f "${CRYPT_PROBE}" ]] && head -c 16 "${CRYPT_PROBE}" 2>/dev/null | grep -qa 'GITCRYPT'; then
  if [[ -n "${FACTORY_GITCRYPT_KEY:-}" ]]; then
    echo "wakeup.sh: working tree is git-crypt-locked — running task secrets:unlock" >&2
    task secrets:unlock KEY="${FACTORY_GITCRYPT_KEY}"
  else
    echo "wakeup.sh: tree locked but FACTORY_GITCRYPT_KEY unset — aborting tick (fail-closed)" >&2
    exit 1
  fi
fi

# ── Factory-API-Key in die Tick-Umgebung holen [T002359] ─────────────────────
# DEEPSEEK_API_KEY_PK ist der Factory-Key (Account pk-deepseek, getrennte Abrechnung
# vom Coaching-Key DEEPSEEK_API_KEY). WELCHE Variable ein Provider benutzt, steht in
# tickets.provider_config.api_key_env — hier wird nur dafuer gesorgt, dass sie in der
# Prozessumgebung ueberhaupt existiert, damit die Indirektion in auto-triage.sh und
# scout-llm-fallback.sh sie aufloesen kann.
#
# Bewusst in einer Subshell statt direktem `source`: env-resolve.sh exportiert das
# komplette Schema und wuerde die vom autopilot.env gesetzte Tick-Umgebung
# ueberschreiben. Muss NACH dem git-crypt-Unlock oben stehen — bei verschlossenem
# Baum liefert die Secrets-Datei Ciphertext.
if [[ -z "${DEEPSEEK_API_KEY_PK:-}" ]]; then
  _factory_dsk="$( ( source "${REPO}/scripts/env-resolve.sh" mentolder >/dev/null 2>&1 \
                     && printf '%s' "${DEEPSEEK_API_KEY_PK:-}" ) || true )"
  if [[ -n "${_factory_dsk}" ]]; then
    export DEEPSEEK_API_KEY_PK="${_factory_dsk}"
  else
    echo "wakeup.sh: DEEPSEEK_API_KEY_PK nicht aufloesbar — Cloud-Fallback laeuft ohne Key." >&2
  fi
  unset _factory_dsk
fi

# ── reasoning_effort MUST stay UNSET so the Workflow harness can spawn subagents ─
# The harness forces thinking.type=disabled for nested agent() spawns. If
# reasoning_effort is ALSO set (any level), the Anthropic-compatible endpoint
# (e.g. DeepSeek) rejects the request with:
#   400 thinking options type cannot be disabled when reasoning_effort is set
# → the dispatcher PREP step crashes. Setting it to "low" does NOT help — it must
# be UNSET entirely. autopilot.env may export it, so neutralize it here. [T000519]
unset CLAUDE_CODE_EFFORT_LEVEL
# Strip [1m] from model env vars if present (belt-and-suspenders).
# Use :- default to avoid nounset errors in CI where autopilot.env is absent.
ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-}"; ANTHROPIC_MODEL="${ANTHROPIC_MODEL/\[1m\]/}"
ANTHROPIC_DEFAULT_OPUS_MODEL="${ANTHROPIC_DEFAULT_OPUS_MODEL:-}"; ANTHROPIC_DEFAULT_OPUS_MODEL="${ANTHROPIC_DEFAULT_OPUS_MODEL/\[1m\]/}"
ANTHROPIC_DEFAULT_SONNET_MODEL="${ANTHROPIC_DEFAULT_SONNET_MODEL:-}"; ANTHROPIC_DEFAULT_SONNET_MODEL="${ANTHROPIC_DEFAULT_SONNET_MODEL/\[1m\]/}"

# ── idle-retick loop ──────────────────────────────────────────────────────────
# Runs one dispatcher tick, then checks both brand queues. If work remains and
# FACTORY_IDLE_RETICK_ENABLED=true, loops immediately (no 10-min timer wait).
# The flock is held for the entire loop, guaranteeing single-flight.
# systemd's RuntimeMaxSec is the hard ceiling for the total loop duration.
TICK=0
while true; do
  TICK=$(( TICK + 1 ))
  TIMESTAMP="$(date -u +%FT%TZ)"
  # T001812: factory-prep (watchdog sweep + schedule poll, up to 300s worst case)
  # runs here in plain bash again — synchronous, no LLM/Workflow overhead. T001810
  # moved it into dispatcher.js's Workflow call via child_process.execFileSync to
  # avoid small models dropping fields when relaying prep JSON through the prompt
  # (T001808/T001809 handoff), but that made the Workflow call itself slow enough
  # to flip into the harness's async "launched in background" mode — and a
  # one-shot `claude -p` session doesn't survive to receive that notification
  # (observed: orphaned Workflow runs, no transcript dir ever created, weak local
  # models retry + hallucinate an unrelated failure reason). Writing the result to
  # a file and passing only the path keeps BOTH properties: no lossy JSON-in-prompt
  # relay, and a fast/synchronous Workflow call (dispatcher.js just reads the file).
  PREP_FILE="/tmp/factory-prep-tick${TICK}-$$.json"
  FACTORY_DAILY_DEPLOY_CAP="${FACTORY_DAILY_DEPLOY_CAP:-5}" FACTORY_GLOBAL_CAP="${FACTORY_GLOBAL_CAP:-3}" \
    bash "${REPO}/scripts/vda.sh" factory-prep 2>/dev/null | jq -c . > "${PREP_FILE}" 2>/dev/null || echo 'null' > "${PREP_FILE}"

  echo "wakeup.sh: starting tick #${TICK} at ${TIMESTAMP}" >&2

  # Sandbox preflight: resolve the default backend once and record it for this tick.
  if [[ "${FACTORY_SANDBOX:-auto}" == "auto" ]]; then
    if docker info >/dev/null 2>&1; then
      export FACTORY_SANDBOX=docker
    elif kubectl --context "${FACTORY_SANDBOX_CTX:-k3d-mentolder-dev}" version >/dev/null 2>&1; then
      export FACTORY_SANDBOX=k8s
    else
      export FACTORY_SANDBOX=off
      echo "wakeup.sh: no sandbox backend available — Implement runs UNSANDBOXED" >&2
    fi
  fi
  bash "${REPO}/scripts/factory/otel-emit.sh" metric factory.sandbox.mode 1 "mode=${FACTORY_SANDBOX}" || true

  bash "${REPO}/scripts/factory/otel-emit.sh" metric factory.tick.count 1 brand="${BRAND:-mentolder}" || true
  # Verwaiste Provider-Slots freigeben, BEVOR der Tick Kandidaten claimt [T002359].
  # Bewusst hier statt in einem eigenen systemd-Timer: der Reaper soll nur laufen,
  # wenn die Factory laeuft — sonst koennte er Slots aktiver Requests abraeumen.
  # reap-provider-slots.sh hatte bis hierher ueberhaupt keinen Aufrufer: das Netz
  # unter dem Slot-Leak war geschrieben, aber nie aufgehaengt.
  bash "${REPO}/scripts/factory/reap-provider-slots.sh" 2>&1 \
    | sed 's/^/[reap-slots] /' >&2 || true
  # T001415: Auto-Close von Tickets deren PR bereits gemergt ist
  # (worktree-lifecycle, dev-flow-execute, tickets/status-lifecycle).
  for _acm_brand in mentolder korczewski; do
    BRAND="$_acm_brand" bash "${REPO}/scripts/factory/auto-close-merged.sh" 2>&1 \
      | sed "s/^/[auto-close-merged:${_acm_brand}] /" >&2 || true
  done
  # T001443: Status-Drift-Watchdog — awaiting_deploy+done_at, terminal-pr-unmerged, terminal-no-pr
  # Läuft nach auto-close-merged, weil es abgeschlossene Tickets bereinigt, die auto-close
  # nicht erwischt hat (z.B. awaiting_deploy obwohl done_at gesetzt). Best-effort.
  for _rc_brand in mentolder korczewski; do
    BRAND="$_rc_brand" bash "${REPO}/scripts/factory/reconcile-ticket-status.sh" 2>&1 \
      | sed "s/^/[reconcile-status:${_rc_brand}] /" >&2 || true
  done
  # Lücke 3.1: plan_staged → backlog auto-enqueue (vor Dispatcher-Tick, damit schedule.sh
  # die frisch-enqueueten Tickets in diesem Tick sieht). Best-effort: Fehler nicht fatal.
  for _ae_brand in mentolder korczewski; do
    BRAND="$_ae_brand" bash "${REPO}/scripts/factory/auto-enqueue.sh" 2>&1 \
      | sed "s/^/[auto-enqueue:${_ae_brand}] /" >&2 || true
  done
  # T000933: KI-Ticket-Auto-Triage — DeepSeek klassifiziert untriagierte Tickets
  # und schreibt Vorschläge nach grilling_meta.triage. Best-effort, nicht fatal.
  for _t_brand in mentolder korczewski; do
    BRAND="$_t_brand" bash "${REPO}/scripts/factory/auto-triage.sh" 2>&1 \
      | sed "s/^/[auto-triage:${_t_brand}] /" >&2 || true
  done
  # T002383: Periodischer Mishap-Buffer-Schnitt. Ersetzt den erzwungenen
  # Session-Ende-Flush im mishap-tracker-Skill, der Ein-Eintrag-Bundles erzeugte:
  # pro dev-flow-Zyklus mindestens ein Bundle-Ticket, das selbst wieder einen
  # Zyklus verbraucht — nicht konvergent. Der Schnitt hängt jetzt am Alter des
  # ältesten Eintrags (Default 7 Tage), nicht an einer Session-Grenze, und
  # bündelt daher unabhängig vom Durchsatz höchstens ein Ticket pro Woche.
  # Das Binary ist gitignored und liegt erst nach `task ticket-mcp:build` auf
  # dem PATH — fehlt es, wird der Schritt still übersprungen (best-effort).
  if command -v ticket-mcp-go >/dev/null 2>&1; then
    for _mf_brand in mentolder korczewski; do
      TICKET_MCP_REPO_ROOT="${REPO}" ticket-mcp-go --flush-stale-mishaps --brand "$_mf_brand" 2>&1 \
        | sed "s/^/[mishap-flush:${_mf_brand}] /" >&2 || true
    done
  fi
  # T002407: Mishap-Rollup-Treiber — generiert/staged Plan aus Container-Kommentaren.
  # Laeuft NACH dem Mishap-Flush (der frischt die Container-Kommentare) und VOR dem
  # auto-chore-plan (der andere Bundle-Tickets verarbeitet). Best-effort.
  for _mr_brand in mentolder korczewski; do
    BRAND="$_mr_brand" bash "${REPO}/scripts/factory/mishap-rollup.sh" 2>&1 \
      | sed "s/^/[mishap-rollup:${_mr_brand}] /" >&2 || true
  done
  # T002390: Mishap-Bundles (severity=minor) von triage nach plan_staged. Der
  # Schritt stand bis dahin nur als Prosa in mishap-tracker SKILL.md 3.5 und
  # wurde deshalb uebersprungen — 8 auto-planbare Bundles lagen in triage.
  # Laeuft VOR dem Dispatcher-Tick, damit schedule.sh sie im selben Tick sieht.
  # Best-effort: Fehler nicht fatal, das Gate lehnt major/critical ohnehin ab.
  for _acp_brand in mentolder korczewski; do
    BRAND="$_acp_brand" bash "${REPO}/scripts/factory/auto-chore-plan.sh" --all 2>&1 \
      | sed "s/^/[auto-chore-plan:${_acp_brand}] /" >&2 || true
  done
  # T001805: PR-CI-Babysitter — repo-weit, brand-agnostisch, best-effort.
  bash "${REPO}/scripts/factory/babysit-prs.sh" 2>&1 \
    | sed 's/^/[babysit] /' >&2 || true
  # T001845: dispatch the tick via dispatcher-bridge.sh instead of forcing the
  # model to emit a Workflow({scriptPath:'scripts/factory/dispatcher.js'},...)
  # tool call. Weak/local models (e.g. qwen3.6-14b-a3b-fablevibes) emit tool calls in a
  # non-standard XML form the harness's tool-call parser chokes on ("import
  # call expects one or two arguments"), causing that call to retry uselessly.
  # dispatcher-bridge.sh reads prep_file directly in bash — for an empty queue
  # it makes zero LLM/tool calls at all; for a non-empty queue it still launches
  # each ticket's pipeline via its own `claude -p` session internally.
  echo "wakeup.sh: dispatching tick #${TICK} via dispatcher-bridge.sh" >&2
  set +e
  bash "${DISPATCHER_BRIDGE}" "${PREP_FILE}" $([[ "${DRY_RUN}" == "true" ]] && echo --dry-run) \
    | sed "s/^/[dispatcher-bridge] /" >&2
  TICK_EXIT=${PIPESTATUS[0]}
  set -e
  rm -f "${PREP_FILE}"

  if [[ ${TICK_EXIT} -ne 0 ]]; then
    echo "wakeup.sh: tick #${TICK} exited with code ${TICK_EXIT} — stopping loop" >&2
    exit ${TICK_EXIT}
  fi

  if [[ "${IDLE_RETICK}" != "true" ]]; then
    break
  fi

  # Check both brand backlogs; retick if either has pending work.
  #
  # [T002689/D4] Fail-closed statt "0 Backlog". Hier stand
  #   BL_K=$(BRAND=korczewski bash .../queue.sh 2>/dev/null | jq 'length' 2>/dev/null || echo 0)
  # und das war doppelt defekt: queue.sh endet bei unerreichbarem Datenpfad
  # rc=2, `jq` bekommt LEEREN Input und liefert selbst rc=0 mit leerer Ausgabe —
  # der `|| echo 0`-Zweig feuerte also nicht einmal, die Variable blieb schlicht
  # LEER. Der Ausfall einer ganzen Brand las sich als "nichts zu tun". Genau
  # diese Klasse legte die korczewski-Brand am 2026-07-28 still lahm.
  # factory_backlog_count liefert entweder eine Zahl mit rc=0 oder rc!=0 OHNE
  # Zahl; der Ausfall wird unten sichtbar berichtet statt verrechnet.
  BACKLOG_FAILED=()
  BL_M="" BL_K=""
  BL_M=$(factory_backlog_count mentolder)  || { BL_M=0; BACKLOG_FAILED+=("mentolder"); }
  BL_K=$(factory_backlog_count korczewski) || { BL_K=0; BACKLOG_FAILED+=("korczewski"); }
  TOTAL=$(( BL_M + BL_K ))
  bash "${REPO}/scripts/factory/otel-emit.sh" metric factory.tick.queue_depth "${TOTAL}" || true

  if [[ ${#BACKLOG_FAILED[@]} -gt 0 ]]; then
    echo "wakeup.sh: WARN backlog count FAILED for: ${BACKLOG_FAILED[*]} — the SDLC data path is unreachable for those brands, their backlog is UNKNOWN (not empty). Check FACTORY_CTX/FACTORY_NS." >&2
  fi

  if [[ "${TOTAL}" -gt 0 ]]; then
    echo "wakeup.sh: idle-retick — ${TOTAL} item(s) in queue (mentolder=${BL_M}, korczewski=${BL_K}), re-arming in ${RETICK_DELAY}s" >&2
    sleep "${RETICK_DELAY}"
    continue
  fi

  if [[ ${#BACKLOG_FAILED[@]} -gt 0 ]]; then
    echo "wakeup.sh: idle-retick — exiting after tick #${TICK}, but the backlog of ${BACKLOG_FAILED[*]} could NOT be counted; 'queue empty' is NOT confirmed for those brands." >&2
    break
  fi

  echo "wakeup.sh: idle-retick — queue empty after tick #${TICK}, exiting (timer handles future work)" >&2
  break
done

# ── record last-tick-at (both brands, best-effort) ────────────────────────────
# parallel-status.ts derives nextTickAt = last-tick-at + FACTORY_TICK_INTERVAL_SEC.
# Written after the loop so it reflects the moment this wakeup finished its work.
_last_tick_at="$(date -u +%FT%TZ)"
for _lt_brand in mentolder korczewski; do
  printf '%s' \
    "INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
       VALUES ('last-tick-at', NULL, :'ts', 'wakeup.sh', now())
     ON CONFLICT (key, brand) DO UPDATE SET value = :'ts', set_by = 'wakeup.sh', updated_at = now();" \
    | _control_psql "$_lt_brand" -v ts="${_last_tick_at}" >/dev/null
done
AGENT_MSG_LABEL=factory bash "${REPO}/scripts/agent-msg.sh" post "factory-tick: done" 2>/dev/null || true
