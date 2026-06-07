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
#   4. exec's a headless `claude -p` run that nests dispatcher.js via the Workflow tool
#
# The Cron-poll IS the trigger: dispatcher.js → schedule.sh polls the backlog.
# RuntimeMaxSec (hung-run kill) is handled by systemd, not here.
#
#   Env knobs (all optional, sane defaults):
#     FACTORY_REPO            repo root            (default: /home/patrick/Bachelorprojekt)
#     FACTORY_DRY_RUN         true|false           (default: true — fail-safe: never auto-merge unless opted in)
#     FACTORY_GITCRYPT_KEY    path to bp-secrets.key for `task secrets:unlock`
#     FACTORY_CLAUDE_BIN      claude binary        (default: claude on PATH)
set -euo pipefail

if [[ -f "${HOME}/.config/factory/autopilot.env" ]]; then
  set -a
  source "${HOME}/.config/factory/autopilot.env"
  set +a
fi

REPO="${FACTORY_REPO:-/home/patrick/Bachelorprojekt}"
DRY_RUN="${FACTORY_DRY_RUN:-true}"
CLAUDE_BIN="${FACTORY_CLAUDE_BIN:-claude}"
LOCKFILE="/tmp/factory-tick.lock"

cd "${REPO}"

# ── single-flight: acquire the tick lock non-blocking; bail if a tick is live ──
exec 9>"${LOCKFILE}"
if ! flock -n 9; then
  echo "wakeup.sh: a factory tick is already running (flock /tmp/factory-tick.lock held) — skipping" >&2
  exit 0
fi

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

# ── ensure Extended Thinking is OFF so Workflow harness can spawn subagents ───
# [1m] suffix or CLAUDE_CODE_EFFORT_LEVEL=max activates reasoning_effort; the
# harness then sets thinking.type:disabled for agent() spawns → 400 API error.
CLAUDE_CODE_EFFORT_LEVEL=low
# Strip [1m] from model env vars if present (belt-and-suspenders).
# Use :- default to avoid nounset errors in CI where autopilot.env is absent.
ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-}"; ANTHROPIC_MODEL="${ANTHROPIC_MODEL/\[1m\]/}"
ANTHROPIC_DEFAULT_OPUS_MODEL="${ANTHROPIC_DEFAULT_OPUS_MODEL:-}"; ANTHROPIC_DEFAULT_OPUS_MODEL="${ANTHROPIC_DEFAULT_OPUS_MODEL/\[1m\]/}"
ANTHROPIC_DEFAULT_SONNET_MODEL="${ANTHROPIC_DEFAULT_SONNET_MODEL:-}"; ANTHROPIC_DEFAULT_SONNET_MODEL="${ANTHROPIC_DEFAULT_SONNET_MODEL/\[1m\]/}"

# ── headless dispatcher tick: nest dispatcher.js via the Workflow tool ────────
# The permission allowlist is tight: only the Workflow tool + the deterministic
# factory primitives the dispatcher shells out to. dry_run is the ONLY policy.
PROMPT="Run the Software Factory dispatcher now. Invoke the Workflow tool with \
scriptPath 'scripts/factory/dispatcher.js' and args { timestamp: '$(date -u +%FT%TZ)', dry_run: ${DRY_RUN} }. \
The dispatcher reads all guards (kill-switch, daily-cap, dry-run-first) fresh per brand inside its PREP step. \
Report only the dispatcher's final JSON result. Do not improvise scheduling."

exec "${CLAUDE_BIN:-claude}" -p "${PROMPT}" \
  --effort low \
  --allowedTools "Workflow,Bash(bash scripts/factory/*),Bash(bash scripts/ticket.sh*),ToolSearch,PushNotification" \
  --permission-mode acceptEdits
