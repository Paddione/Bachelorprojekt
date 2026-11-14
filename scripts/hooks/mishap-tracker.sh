#!/usr/bin/env bash
# scripts/hooks/mishap-tracker.sh
# Record a process friction encountered during a dev-flow run.
#   mishap-tracker.sh --friction "<text>" [--severity minor|major|critical] [--class <klasse>] [--area <bereich>]
# Thin wrapper on the shared writer ~/scripts/mishap-log.py (dotfiles): one dated,
# classified line in <git-common-dir>/.mishaps.log plus stderr. Classes come from
# ~/mishaps.yaml; without --class the entry is logged as `other` with a warning.
# Fallback (writer missing, e.g. CI, or not inside a Git repo): the legacy line
# "<ISO> [<severity>] <friction>" in ./.mishaps.log.
# --ticket is accepted as a legacy no-op (Ticket-Backend retiriert 2026-10-14).
# Never hard-fails a caller's flow [T014104].
set -euo pipefail

TICKET_ID=""
FRICTION=""
SEVERITY="minor"
CLASS=""
AREA="bachelorprojekt"
WRITER="${MISHAP_LOG_WRITER:-$HOME/scripts/mishap-log.py}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ticket)   TICKET_ID="$2"; shift 2 ;;
    --friction) FRICTION="$2";  shift 2 ;;
    --severity) SEVERITY="$2";  shift 2 ;;
    --class)    CLASS="$2";     shift 2 ;;
    --area)     AREA="$2";      shift 2 ;;
    *)          echo "mishap-tracker: unknown option: $1" >&2; shift ;;
  esac
done

if [[ -z "$FRICTION" ]]; then
  echo "ERROR: --friction is required." >&2
  exit 2
fi

case "$SEVERITY" in
  minor|major|critical) : ;;
  *) echo "WARNING: unknown severity '$SEVERITY' — defaulting to minor." >&2; SEVERITY="minor" ;;
esac

if [[ -n "$TICKET_ID" ]]; then
  echo "WARNING: --ticket is a legacy no-op (no ticket backend since 2026-10-14) — logging locally" >&2
fi

if [[ -z "$CLASS" ]]; then
  echo "WARNING: --class fehlt — Eintrag wird als 'other' geloggt (Klassen: ~/mishaps.yaml)." >&2
  CLASS="other"
fi

case "$SEVERITY" in
  minor)    MAPPED="drift" ;;
  major)    MAPPED="degraded" ;;
  critical) MAPPED="security" ;;
esac

if [[ -f "$WRITER" ]] && git rev-parse --git-common-dir >/dev/null 2>&1; then
  # Eine Zeile, keine Trenner im Titel: der Schreiber weist sonst ab.
  TITLE="$(printf '%s' "$FRICTION" | tr '\n\r' '  ' | sed 's/ :: / : /g')"
  AREA_ONE="$(printf '%s' "$AREA" | tr -s '[:space:]' '-')"
  if python3 "$WRITER" --class "$CLASS" --severity "$MAPPED" --area "$AREA_ONE" --title "$TITLE" --repo .; then
    echo "mishap appended to $(git rev-parse --path-format=absolute --git-common-dir)/.mishaps.log [${CLASS}]"
    exit 0
  fi
  echo "WARNING: mishap-log.py lehnte den Eintrag ab — Altformat in ./.mishaps.log" >&2
fi

# Protokollieren und verwerfen. Exit 0 — ein Mishap darf den Lauf des
# Aufrufers nicht scheitern lassen [T014104].
printf '[mishap] recorded locally [%s]: %s\n' "$SEVERITY" "$FRICTION" >&2
printf '%s [%s] %s\n' "$(date -Iseconds)" "$SEVERITY" "$FRICTION" >> .mishaps.log
echo "mishap appended to .mishaps.log [${SEVERITY}]"
exit 0
