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
  # T001805: PR-CI-Babysitter — repo-weit, brand-agnostisch, best-effort.
  bash "${REPO}/scripts/factory/babysit-prs.sh" 2>&1 \
    | sed 's/^/[babysit] /' >&2 || true
  # T001845: dispatch the tick via dispatcher-bridge.sh instead of forcing the
  # model to emit a Workflow({scriptPath:'scripts/factory/dispatcher.js'},...)
  # tool call. Weak/local models (e.g. qwythos-9b-v2) emit tool calls in a
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
