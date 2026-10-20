#!/usr/bin/env bash
# scripts/devflow-phase.sh — Phasen-Event in die lokale phase-events.log schreiben.
#
# Ersetzt `ticket.sh phase` (Ticket-System retiriert 2026-10-14). Leser:
# scripts/devflow_ci_watch.py (Gate: plan done, implement entered, verify done)
# und scripts/devflow-post-merge-finalize.sh (verify done).
#
# Aufruf:  devflow-phase.sh <phase> <state> [--detail <text>] [--slug <slug>]
#          devflow-phase.sh check [--slug <slug>]   # Gate lokal: Exit 0 vollstaendig, 6 sonst
# Zeile:   "<phase> <state> <UTC-ISO8601> <detail>"
# Ziel:    <repo-toplevel>/.agents/plans/<slug>/phase-events.log
#          Slug default = aktueller Branch ohne Praefix (feature/, fix/, chore/ …),
#          identisch zu devflow_ci_watch.slug_from_branch.
set -euo pipefail

usage() { echo "Usage: $0 <phase> <state> [--detail <text>] [--slug <slug>] | $0 check [--slug <slug>]" >&2; exit 2; }

[[ $# -ge 1 ]] || usage
if [[ "$1" == "check" ]]; then
  phase="check" state=""; shift
else
  [[ $# -ge 2 ]] || usage
  phase="$1" state="$2"; shift 2
  case "$phase" in plan|implement|verify|deploy) ;; *) echo "devflow-phase: unbekannte Phase '$phase'" >&2; exit 2 ;; esac
  case "$state" in entered|done|failed) ;; *) echo "devflow-phase: unbekannter State '$state'" >&2; exit 2 ;; esac
fi

detail="" slug=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --detail) [[ $# -ge 2 ]] || usage; detail="$2"; shift 2 ;;
    --slug)   [[ $# -ge 2 ]] || usage; slug="$2"; shift 2 ;;
    *) usage ;;
  esac
done

top="$(git rev-parse --show-toplevel)"
if [[ -z "$slug" ]]; then
  branch="$(git symbolic-ref --short -q HEAD)" || { echo "devflow-phase: detached HEAD — --slug angeben" >&2; exit 2; }
  slug="$(printf '%s' "$branch" | sed -E 's#^[A-Za-z]+/##')"
fi

log="$top/.agents/plans/$slug/phase-events.log"
if [[ "$phase" == "check" ]]; then
  # Gleiche Pflichtkette wie devflow_ci_watch.PHASE_REQUIRED.
  [[ -f "$log" ]] || { echo "❌ phase-events.log fehlt ($log)" >&2; exit 6; }
  missing=()
  for req in "plan done" "implement entered" "verify done"; do
    grep -q "^$req" "$log" || missing+=("$req")
  done
  [[ ${#missing[@]} -eq 0 ]] || { echo "❌ Phase-Chain nicht vollständig — fehlt: ${missing[*]}" >&2; exit 6; }
  echo "✅ Phase-Chain vollständig ($log)"
  exit 0
fi
mkdir -p "$(dirname "$log")"
# Detail einzeilig halten: der Gate prueft Zeilenanfaenge.
detail="$(printf '%s' "$detail" | tr '\n' ' ')"
printf '%s %s %s %s\n' "$phase" "$state" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$detail" >> "$log"
echo "$log"
