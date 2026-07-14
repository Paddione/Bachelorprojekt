#!/usr/bin/env bash
# scripts/factory/scout-drift.sh — post-merge drift ratchet orchestrator.
#
# Compares the scout's predicted touched_files (P) against actual changed files
# from git diff --name-only (A), computes a Jaccard drift score, persists it,
# and warns on high drift. Strictly fail-soft: any error -> warning + exit 0.
#
# Usage:
#   bash scripts/factory/scout-drift.sh \
#     --ticket T000XXX --base <sha> --head <sha> --repo /path/to/repo
set -uo pipefail

TICKET=""; BASE=""; HEAD=""; REPO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ticket) TICKET="${2:-}"; shift 2 ;;
    --base)   BASE="${2:-}";   shift 2 ;;
    --head)   HEAD="${2:-}";   shift 2 ;;
    --repo)   REPO="${2:-}";   shift 2 ;;
    *)        shift ;;
  esac
done

warn() { echo "scout-drift: $1" >&2; }

if [[ -z "$TICKET" ]]; then warn "missing --ticket"; exit 0; fi
if [[ -z "$BASE" ]]; then warn "missing --base"; exit 0; fi
if [[ -z "$HEAD" ]]; then warn "missing --head"; exit 0; fi
REPO="${REPO:-$(pwd)}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TICKET_SH="$HERE/../ticket.sh"
DRIFT_CJS="$HERE/scout-drift.cjs"

if [[ ! -x "$TICKET_SH" ]]; then warn "ticket.sh not executable"; exit 0; fi
if [[ ! -f "$DRIFT_CJS" ]]; then warn "scout-drift.cjs not found"; exit 0; fi

# ── P: predicted files from the ticket's touched_files ───────────────────────
ticket_json="$(bash "$TICKET_SH" get --id "$TICKET" 2>/dev/null)" || {
  warn "ticket.sh get failed for $TICKET"; exit 0
}

P_raw="$(printf '%s' "$ticket_json" | jq -r '.touched_files // [] | .[]?' 2>/dev/null)" || P_raw=""
P_rel=()
while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  if [[ "$p" == "$REPO/"* ]]; then
    P_rel+=("${p#"$REPO/"}")
  else
    P_rel+=("$p")
  fi
done <<< "$P_raw"

# ── A: actual changed files from git diff ────────────────────────────────────
if ! git -C "$REPO" rev-parse --verify "$BASE" >/dev/null 2>&1; then
  warn "base commit $BASE not reachable"; exit 0
fi
if ! git -C "$REPO" rev-parse --verify "$HEAD" >/dev/null 2>&1; then
  warn "head commit $HEAD not reachable"; exit 0
fi

A_raw="$(git -C "$REPO" diff --name-only "$BASE" "$HEAD" 2>/dev/null)" || A_raw=""

A_clean="$(printf '%s\n' "${A_raw}" | node -e "
  const {filterNoise} = require('$DRIFT_CJS');
  const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
  process.stdout.write(JSON.stringify(filterNoise(lines)));
" 2>/dev/null)" || A_clean="[]"

# ── Compute drift ────────────────────────────────────────────────────────────
P_json="$(printf '%s\n' "${P_rel[@]:-}" | jq -R . | jq -s . 2>/dev/null)" || P_json="[]"
drift="$(node -e "
  const {jaccardDistance} = require('$DRIFT_CJS');
  const P = JSON.parse(process.argv[1]);
  const A = JSON.parse(process.argv[2]);
  process.stdout.write(String(jaccardDistance(P, A)));
" "$P_json" "$A_clean" 2>/dev/null)" || {
  warn "drift computation failed"; exit 0
}

if [[ -z "$drift" ]]; then warn "drift score empty"; exit 0; fi

# ── Persist ──────────────────────────────────────────────────────────────────
bash "$TICKET_SH" set-scout-drift --id "$TICKET" --drift "$drift" 2>/dev/null || {
  warn "set-scout-drift failed (non-fatal)"; exit 0
}

# ── Threshold warning ───────────────────────────────────────────────────────
THRESHOLD="${SCOUT_DRIFT_THRESHOLD:-0.9}"
if awk "BEGIN {exit !($drift > $THRESHOLD)}" 2>/dev/null; then
  bash "$TICKET_SH" add-comment \
    --id "$TICKET" \
    --author "factory" \
    --visibility "internal" \
    --body "scout_drift=${drift} (threshold=${THRESHOLD})\nPredicted=${#P_rel[@]} files, actual=$(printf '%s\n' "$A_clean" | jq 'length') files — scout may need improvement." \
    2>/dev/null || warn "drift warning comment failed (non-fatal)"
fi

A_joined="$(printf '%s\n' "$A_clean" | jq -r 'join(" ")' 2>/dev/null || echo '(empty)')"
echo "scout-drift: drift=$drift persisted for $TICKET"
echo "scout-drift: P=${P_rel[*]:-(empty)}"
echo "scout-drift: A=$A_joined"
