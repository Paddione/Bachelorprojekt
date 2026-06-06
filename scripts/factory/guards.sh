#!/usr/bin/env bash
# scripts/factory/guards.sh — Software Factory Phase-3 HARD GUARDS.
#
# Four guard predicates (exit 0 = guard "tripped"/satisfied as documented per fn).
# All readers are FAIL-CLOSED: any read error → treat as tripped (the dispatcher
# PREP gate must not launch when state is unknown).
#
# SOURCE for factory_psql, then call the guards from .sh; the dispatcher reads the
# kill-switch / daily-cap fresh per tick via ticket.sh (cross-brand, kubectl-exec-psql).
#
#   guard_killswitch_on <brand>        exit 0 if the global OR per-brand kill-switch is ON
#   guard_daily_cap_reached <brand>    exit 0 if today's deploy count >= FACTORY_DAILY_DEPLOY_CAP
#   guard_dryrun_ok <ext_id>           exit 0 if the ticket carries the dry-run-first marker
#   guard_check_diff_size <max>        exit 1 if (insertions+deletions) of origin/main...HEAD > max
#
# Offline lint:   bash -n scripts/factory/guards.sh
# Contract tests: ./tests/runner.sh local FA-SF-36
set -uo pipefail

GUARDS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARDS_REPO="${GUARDS_REPO:-/home/patrick/Bachelorprojekt}"
# shellcheck source=scripts/factory/lib.sh
source "${GUARDS_DIR}/lib.sh"

# guard_killswitch_on <brand> — exit 0 (ON) when the global (brand NULL) OR the
# per-brand kill-switch value is "on"/"true"/"1". Fail-closed: any read error → ON.
guard_killswitch_on() {
  local brand="${1:?brand required}" g b
  g=$(bash "${GUARDS_REPO}/scripts/ticket.sh" factory-control get --key killswitch 2>/dev/null) \
    || { echo "guard_killswitch_on: global read FAILED → fail-closed ON" >&2; return 0; }
  b=$(bash "${GUARDS_REPO}/scripts/ticket.sh" factory-control get --key killswitch --brand "$brand" 2>/dev/null) \
    || { echo "guard_killswitch_on: brand read FAILED → fail-closed ON" >&2; return 0; }
  case "${g,,}" in on|true|1) return 0 ;; esac
  case "${b,,}" in on|true|1) return 0 ;; esac
  return 1
}

# guard_daily_cap_reached <brand> — exit 0 when today's deploy count >= cap.
# Reads the per-brand counter key "daily_deploy_count"; missing/empty = 0.
# Fail-closed: cap unset OR read error → reached (return 0).
guard_daily_cap_reached() {
  local brand="${1:?brand required}" cap count
  cap="${FACTORY_DAILY_DEPLOY_CAP:-}"
  [[ -z "$cap" ]] && { echo "guard_daily_cap_reached: FACTORY_DAILY_DEPLOY_CAP unset → fail-closed REACHED" >&2; return 0; }
  count=$(bash "${GUARDS_REPO}/scripts/ticket.sh" factory-control get --key daily_deploy_count --brand "$brand" 2>/dev/null) \
    || { echo "guard_daily_cap_reached: read FAILED → fail-closed REACHED" >&2; return 0; }
  [[ "$count" =~ ^[0-9]+$ ]] || count=0
  (( count >= cap ))
}

# guard_dryrun_ok <ext_id> — exit 0 when the ticket carries the dry-run-first marker.
# Delegates to ticket.sh dryrun-check (exit 0 iff marked). Fail-closed: read error → NOT ok (1).
guard_dryrun_ok() {
  local ext_id="${1:?external id required}"
  if bash "${GUARDS_REPO}/scripts/ticket.sh" dryrun-check --id "$ext_id" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

# guard_check_diff_size <max> — HARD diff-size cap for the Deploy phase.
# Reads `git diff --shortstat origin/main...HEAD`, sums insertions+deletions.
# exit 0 if within budget; exit 1 if over (caller HARD-blocks). Read error → over (1).
guard_check_diff_size() {
  local max="${1:?max required}" line ins del total
  line=$(git diff --shortstat origin/main...HEAD 2>/dev/null) \
    || { echo "guard_check_diff_size: git diff FAILED → fail-closed OVER" >&2; return 1; }
  ins=$(sed -nE 's/.*[, ]([0-9]+) insertion.*/\1/p' <<<"$line"); ins="${ins:-0}"
  del=$(sed -nE 's/.*[, ]([0-9]+) deletion.*/\1/p'  <<<"$line"); del="${del:-0}"
  total=$(( ins + del ))
  if (( total > max )); then
    echo "guard_check_diff_size: diff ${total} > ${max} (insertions=${ins} deletions=${del}) → BLOCK" >&2
    return 1
  fi
  echo "guard_check_diff_size: diff ${total} <= ${max} OK" >&2
  return 0
}
