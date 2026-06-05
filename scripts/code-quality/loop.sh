#!/usr/bin/env bash
# scripts/code-quality/loop.sh — idempotent top-up: enqueue ≤MAX_NEW new Factory
# tickets, one per (Gate × Subsystem) group with open baseline violations.
#
# Environment variables:
#   MAX_NEW=2            max new tickets to create per run (default 2)
#   DRY_RUN=1            print actions without executing (no psql, no ticket.sh)
#   BRAND=mentolder      ticket brand (default mentolder)
#   FACTORY_CTX=fleet    kubectl context for psql (default fleet, via lib.sh)
#   FACTORY_NS=workspace kubectl namespace (default workspace, via lib.sh)
#
# Seams for unit testing (override with env vars):
#   QUALITY_LOOP_GROUPS_CMD   command to emit the groups JSON (default: node ...)
#   QUALITY_LOOP_PSQL_CMD     command to query open tickets per group title prefix
#                             receives the LIKE pattern on stdin; empty output = no open ticket

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

MAX_NEW="${MAX_NEW:-2}"
BRAND="${BRAND:-mentolder}"
DRY_RUN="${DRY_RUN:-}"

# ── Resolve groups ────────────────────────────────────────────────────────────
GROUPS_CMD="${QUALITY_LOOP_GROUPS_CMD:-node ${SCRIPT_DIR}/group-violations.mjs}"

groups_json="$(eval "$GROUPS_CMD")"

if [[ "$groups_json" == "[]" || -z "$groups_json" ]]; then
  echo "quality:loop — baseline is empty, nothing to enqueue"
  exit 0
fi

group_count="$(echo "$groups_json" | jq 'length')"
echo "quality:loop — ${group_count} violation group(s) in baseline"

# ── Factory lib (psql access) ─────────────────────────────────────────────────
# Only sourced when not in DRY_RUN and no QUALITY_LOOP_PSQL_CMD override.
if [[ -z "$DRY_RUN" && -z "${QUALITY_LOOP_PSQL_CMD:-}" ]]; then
  # shellcheck source=scripts/factory/lib.sh
  source "${REPO_ROOT}/scripts/factory/lib.sh"
  factory_resolve
fi

# ── Per-group function ─────────────────────────────────────────────────────────
# Returns 0 if an open ticket already exists for this title prefix, 1 otherwise.
# The psql seam (QUALITY_LOOP_PSQL_CMD) receives the SQL on stdin — same contract
# as factory_psql — so test stubs can be real scripts that read stdin.
has_open_ticket() {
  local title_prefix="$1"
  # Safe: gate/subsystem contain only [A-Za-z0-9_-], no SQL injection risk;
  # the doubled-quote escape is kept for correctness nonetheless.
  local safe_prefix="${title_prefix//\'/\'\'}"
  local sql="SELECT title FROM tickets.tickets WHERE title LIKE '${safe_prefix}%' AND status NOT IN ('done','archived','wont-fix') LIMIT 1;"

  local result
  if [[ -n "${QUALITY_LOOP_PSQL_CMD:-}" ]]; then
    result="$(echo "$sql" | "${QUALITY_LOOP_PSQL_CMD}" 2>/dev/null || true)"
  else
    result="$(echo "$sql" | factory_psql 2>/dev/null || true)"
  fi
  [[ -n "$result" ]]
}

# ── Main loop ─────────────────────────────────────────────────────────────────
created=0

for i in $(seq 0 $((group_count - 1))); do
  if (( created >= MAX_NEW )); then
    echo "quality:loop — throttle reached (MAX_NEW=${MAX_NEW}), stopping"
    break
  fi

  group="$(echo "$groups_json" | jq -r ".[$i]")"
  gate="$(echo "$group" | jq -r '.gate')"
  subsystem="$(echo "$group" | jq -r '.subsystem')"
  title="$(echo "$group" | jq -r '.title')"
  violation_keys="$(echo "$group" | jq -r '.violation_keys[]')"

  # Truncate description to 2000 chars to stay within ticket.sh limits
  description="$(printf 'Open violations for %s:\n\n%s' "$title" "$violation_keys" | head -c 2000)"
  if [[ -z "$description" ]]; then
    echo "ERROR: empty description for group ${gate}:${subsystem} — aborting" >&2
    exit 1
  fi

  # Title prefix for dedup (matches exactly up to the count, which may change)
  title_prefix="CQ-GATE:${gate}:${subsystem}"

  if [[ -n "$DRY_RUN" ]]; then
    echo "[DRY_RUN] would create ticket: ${title}"
    echo "[DRY_RUN] would enqueue: ${title_prefix}"
    created=$(( created + 1 ))
    continue
  fi

  if has_open_ticket "$title_prefix"; then
    echo "  skip ${title_prefix} — open ticket already exists"
    continue
  fi

  echo "  creating: ${title}"
  ext_id="$(ticket.sh create \
    --type feature \
    --brand "$BRAND" \
    --title "$title" \
    --description "$description" \
    --priority mittel \
    | cut -d'|' -f1)"

  if [[ -z "$ext_id" ]]; then
    echo "ERROR: ticket.sh create returned empty ext_id for '${title}'" >&2
    exit 1
  fi

  echo "  enqueuing: ${ext_id}"
  ticket.sh enqueue --id "$ext_id"
  created=$(( created + 1 ))
done

echo "quality:loop — done. ${created} ticket(s) created this run."
