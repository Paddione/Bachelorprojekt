#!/usr/bin/env bash
# brain-ingest-coverage.sh — Fail-closed coverage gate for the Brain Wiki ingest
#
# Measures how much of the attempted source material actually reached the wiki
# and aborts below a threshold. Lives in its own script rather than inside
# scripts/brain-ingest.sh because that file's S1 line budget is the tight one
# in this change (T002679).
#
# Usage:
#   brain-ingest-coverage.sh --worklist <tsv> --delivered <tsv> [--root <dir>] [--min-pct <n>]
#
# Inputs:
#   --worklist   ingest worklist TSV: <src_path>\t<slug>\t<group>
#   --delivered  per-chunk result TSV: <src_path>\t<chars>\t<rc>
#                rc 0 = transformed, rc 2 = unchanged (already in the wiki),
#                anything else = failed.
#   --root       repo root the src_path column resolves against (default: the
#                directory above this script)
#   --min-pct    coverage threshold in percent (default: $BRAIN_MIN_COVERAGE_PCT, else 95)
#
# Denominator: total bytes of every ATTEMPTED source — the same delimitation the
# failure threshold in brain-ingest.sh uses. A source that was skipped wholesale
# appears in neither numerator nor denominator, so idempotent re-runs do not
# inflate the number.
# Numerator: bytes of every chunk with rc 0 or 2. rc 2 counts because that chunk
# is already sitting in the wiki — what is measured is the coverage of the WIKI,
# not the data volume of this particular run.
#
# Env:
#   BRAIN_MIN_COVERAGE_PCT — default threshold (95)
#
# Exit: 0 when coverage >= threshold (or nothing was attempted), 1 below it.
# Ticket: T002679 (REQ-k4-07)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
WORKLIST=""
DELIVERED=""
MIN_PCT="${BRAIN_MIN_COVERAGE_PCT:-95}"

usage() {
  cat >&2 <<'EOF'
Usage: brain-ingest-coverage.sh --worklist <tsv> --delivered <tsv> [--root <dir>] [--min-pct <n>]

  --worklist   ingest worklist TSV (<src_path>\t<slug>\t<group>)          (required)
  --delivered  per-chunk result TSV (<src_path>\t<chars>\t<rc>)           (required)
  --root       repo root the src_path column resolves against
  --min-pct    coverage threshold in percent (default: BRAIN_MIN_COVERAGE_PCT or 95)
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --worklist)  WORKLIST="${2:?--worklist requires a value}"; shift 2 ;;
    --delivered) DELIVERED="${2:?--delivered requires a value}"; shift 2 ;;
    --root)      ROOT="${2:?--root requires a value}"; shift 2 ;;
    --min-pct)   MIN_PCT="${2:?--min-pct requires a value}"; shift 2 ;;
    -h|--help)   usage; exit 0 ;;
    *) echo "brain-ingest-coverage.sh: unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

[ -n "$WORKLIST" ]  || { echo "brain-ingest-coverage.sh: --worklist is required" >&2; usage; exit 1; }
[ -n "$DELIVERED" ] || { echo "brain-ingest-coverage.sh: --delivered is required" >&2; usage; exit 1; }
[ -f "$WORKLIST" ]  || { echo "brain-ingest-coverage.sh: worklist not found: $WORKLIST" >&2; exit 1; }
[ -f "$DELIVERED" ] || { echo "brain-ingest-coverage.sh: delivered file not found: $DELIVERED" >&2; exit 1; }
[ -d "$ROOT" ]      || { echo "brain-ingest-coverage.sh: root directory not found: $ROOT" >&2; exit 1; }

case "$MIN_PCT" in
  ''|*[!0-9]*) echo "brain-ingest-coverage.sh: --min-pct must be an integer, got: $MIN_PCT" >&2; exit 1 ;;
esac

# ── Attempted sources, numerator, denominator ─────────────────────────────
DELIVERED_CHARS=0
ATTEMPTED_SOURCES=""
while IFS=$'\t' read -r src_path chars rc; do
  [ -n "${src_path:-}" ] || continue
  case "${rc:-}" in ''|*[!0-9]*) continue ;; esac
  # rc 2 alone means "nothing was attempted for this source" — a source that
  # only ever produced rc 2 stays out of the measurement entirely.
  if [ "$rc" -ne 2 ]; then
    case "$ATTEMPTED_SOURCES" in
      *"$(printf '\n')$src_path$(printf '\n')"*) : ;;
      *) ATTEMPTED_SOURCES="${ATTEMPTED_SOURCES}"$'\n'"$src_path"$'\n' ;;
    esac
  fi
done < "$DELIVERED"

if [ -z "$ATTEMPTED_SOURCES" ]; then
  echo "Coverage: keine versuchte Quelle — Gate übersprungen"
  exit 0
fi

SOURCE_COUNT=0
TOTAL_CHARS=0
while IFS= read -r src_path; do
  [ -n "$src_path" ] || continue
  SOURCE_COUNT=$((SOURCE_COUNT + 1))
  if [ -f "$ROOT/$src_path" ]; then
    TOTAL_CHARS=$((TOTAL_CHARS + $(wc -c < "$ROOT/$src_path")))
  else
    echo "brain-ingest-coverage.sh: source not found under root, counted as 0: $src_path" >&2
  fi
done <<< "$(printf '%s\n' "$ATTEMPTED_SOURCES" | grep -v '^$' | sort -u)"

while IFS=$'\t' read -r src_path chars rc; do
  [ -n "${src_path:-}" ] || continue
  case "${rc:-}" in ''|*[!0-9]*) continue ;; esac
  case "${chars:-}" in ''|*[!0-9]*) continue ;; esac
  case "$ATTEMPTED_SOURCES" in
    *"$(printf '\n')$src_path$(printf '\n')"*) : ;;
    *) continue ;;
  esac
  if [ "$rc" -eq 0 ] || [ "$rc" -eq 2 ]; then
    DELIVERED_CHARS=$((DELIVERED_CHARS + chars))
  fi
done < "$DELIVERED"

if [ "$TOTAL_CHARS" -le 0 ]; then
  echo "Coverage: keine versuchte Quelle — Gate übersprungen"
  exit 0
fi

PCT=$((DELIVERED_CHARS * 100 / TOTAL_CHARS))
SUMMARY="Coverage: ${PCT}% (Schwelle ${MIN_PCT}%, ${DELIVERED_CHARS} von ${TOTAL_CHARS} Zeichen, ${SOURCE_COUNT} versuchte Quellen)"

if [ "$PCT" -lt "$MIN_PCT" ]; then
  echo "$SUMMARY" >&2
  echo "brain-ingest-coverage.sh: Abdeckung unter der Schwelle — Lauf abgebrochen." >&2
  echo "  Schwelle über BRAIN_MIN_COVERAGE_PCT oder --min-pct einstellbar." >&2
  echo "  Zu große Quellen gehören vorher durch scripts/brain-chunk.sh." >&2
  exit 1
fi

echo "$SUMMARY"
