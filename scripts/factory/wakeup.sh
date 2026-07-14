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
#     FACTORY_TICK_LOCK             single-flight lock   (default: /tmp/factory-tick.lock)
#     FACTORY_ENV_FILE              prod config to source(default: ~/.config/factory/autopilot.env)
#     FACTORY_IDLE_RETICK_ENABLED   true|false  immediately re-tick if queue non-empty after tick (default: true)
#     FACTORY_IDLE_RETICK_DELAY     seconds to wait between reticks (default: 5)
set -euo pipefail

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
CLAUDE_BIN="${FACTORY_CLAUDE_BIN:-claude}"
LOCKFILE="${FACTORY_TICK_LOCK:-/tmp/factory-tick.lock}"
IDLE_RETICK="${FACTORY_IDLE_RETICK_ENABLED:-true}"
RETICK_DELAY="${FACTORY_IDLE_RETICK_DELAY:-5}"

cd "${REPO}"

# ── single-flight: acquire the tick lock non-blocking; bail if a tick is live ──
exec 9>"${LOCKFILE}"
if ! flock -n 9; then
  echo "wakeup.sh: a factory tick is already running (flock ${LOCKFILE} held) — skipping" >&2
  exit 0
fi

bash "${REPO}/scripts/agent-msg.sh" read --unread 2>/dev/null || true
AGENT_MSG_LABEL=factory bash "${REPO}/scripts/agent-msg.sh" post "factory-tick: starting (dry_run=${DRY_RUN})" 2>/dev/null || true

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
  # T001808: PREP deterministisch vorberechnen und als args.prep durchreichen.
  # Kleine lokale Modelle scheitern am StructuredOutput-Kontrakt des PREP-Subagenten;
  # factory-prep ist reines Bash — der LLM-Schritt ist hier unnötig. Bei leerem/
  # ungültigem JSON fällt dispatcher.js auf den PREP-Agenten zurück.
  PREP_JSON="$(FACTORY_DAILY_DEPLOY_CAP="${FACTORY_DAILY_DEPLOY_CAP:-5}" FACTORY_GLOBAL_CAP="${FACTORY_GLOBAL_CAP:-3}" \
    bash "${REPO}/scripts/vda.sh" factory-prep 2>/dev/null | jq -c . 2>/dev/null || true)"
  PREP_ARG=""
  if [[ -n "${PREP_JSON}" ]]; then
    # T001809: Budget-Guard + Blocked-Cleanup + Sentinel ebenfalls deterministisch —
    # reine Bash-Orchestrierung; die LLM-Agent-Schritte in dispatcher.js scheitern mit
    # kleinen lokalen Modellen am StructuredOutput-Kontrakt und hinterlassen den
    # PREP-Claim als Zombie (in_progress ohne Pipeline).
    _ok_ids='[]'
    while IFS=$'\t' read -r _ext _brand; do
      [[ -z "${_ext}" ]] && continue
      if BRAND="${_brand}" bash "${REPO}/scripts/factory/budget-guard.sh" "${_brand}" >/dev/null 2>&1; then
        BRAND="${_brand}" bash "${REPO}/scripts/factory/budget-estimate.sh" "${_ext}" "${_brand}" >/dev/null 2>&1 || true
        _ok_ids="$(jq -c --arg e "${_ext}" '. + [$e]' <<<"${_ok_ids}")"
      else
        echo "wakeup.sh: budget-guard blocked ${_ext} (${_brand})" >&2
        BRAND="${_brand}" bash "${REPO}/scripts/ticket.sh" update-status --id "${_ext}" --status blocked >/dev/null 2>&1 || true
        BRAND="${_brand}" bash "${REPO}/scripts/ticket.sh" phase "${_ext}" scout blocked --detail 'daily budget exceeded' >/dev/null 2>&1 || true
        BRAND="${_brand}" bash "${REPO}/scripts/ticket.sh" release-slot --id "${_ext}" >/dev/null 2>&1 || true
      fi
    done < <(jq -r '.launch[]? | [.external_id, .brand] | @tsv' <<<"${PREP_JSON}" 2>/dev/null)
    PREP_JSON="$(jq -c --argjson ok "${_ok_ids}" \
      '.launch = [.launch[]? | select(.external_id as $e | $ok | index($e) != null)]' <<<"${PREP_JSON}")"
    _iw=false
    bash "${REPO}/scripts/agent-lock.sh" list 2>/dev/null | grep -q interactive-worker && _iw=true
    PREP_ARG=", prep: ${PREP_JSON}, interactive_worker: ${_iw}"
  fi
  PROMPT="Run the Software Factory dispatcher now. Invoke the Workflow tool with \
scriptPath 'scripts/factory/dispatcher.js' and args { timestamp: '${TIMESTAMP}', dry_run: ${DRY_RUN}${PREP_ARG} }. \
Pass the prep value through verbatim — do not alter, re-run, or improvise it. \
The dispatcher reads all guards (kill-switch, daily-cap, dry-run-first) fresh per brand inside its PREP step. \
Report only the dispatcher's final JSON result. Do not improvise scheduling."

  echo "wakeup.sh: starting tick #${TICK} at ${TIMESTAMP}" >&2
  bash "${REPO}/scripts/factory/otel-emit.sh" metric factory.tick.count 1 brand="${BRAND:-mentolder}" || true
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
  "${CLAUDE_BIN}" -p "${PROMPT}" \
    --allowedTools "Workflow,Bash(bash scripts/factory/*),Bash(bash scripts/ticket.sh*),Bash(bash scripts/vda.sh*),ToolSearch,PushNotification" \
    --permission-mode acceptEdits
  TICK_EXIT=$?

  if [[ ${TICK_EXIT} -ne 0 ]]; then
    echo "wakeup.sh: tick #${TICK} exited with code ${TICK_EXIT} — stopping loop" >&2
    exit ${TICK_EXIT}
  fi

  if [[ "${IDLE_RETICK}" != "true" ]]; then
    break
  fi

  # Check both brand backlogs; retick if either has pending work.
  BL_M=$(BRAND=mentolder bash "${REPO}/scripts/factory/queue.sh" 2>/dev/null | jq 'length' 2>/dev/null || echo 0)
  BL_K=$(BRAND=korczewski bash "${REPO}/scripts/factory/queue.sh" 2>/dev/null | jq 'length' 2>/dev/null || echo 0)
  TOTAL=$(( BL_M + BL_K ))
  bash "${REPO}/scripts/factory/otel-emit.sh" metric factory.tick.queue_depth "${TOTAL}" || true

  if [[ "${TOTAL}" -gt 0 ]]; then
    echo "wakeup.sh: idle-retick — ${TOTAL} item(s) in queue (mentolder=${BL_M}, korczewski=${BL_K}), re-arming in ${RETICK_DELAY}s" >&2
    sleep "${RETICK_DELAY}"
    continue
  fi

  echo "wakeup.sh: idle-retick — queue empty after tick #${TICK}, exiting (timer handles future work)" >&2
  break
done
AGENT_MSG_LABEL=factory bash "${REPO}/scripts/agent-msg.sh" post "factory-tick: done" 2>/dev/null || true
