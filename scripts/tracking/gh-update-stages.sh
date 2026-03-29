#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# gh-update-stages.sh — Sync pipeline stages from tracking.db → GitHub Issues
# ═══════════════════════════════════════════════════════════════════
# Updates GitHub Issue labels to reflect the current pipeline stage
# in tracking.db. Finds the most advanced "done" stage per requirement
# and sets the corresponding stage: label.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
DB="${PROJECT_DIR}/tracking.db"

if [[ ! -f "$DB" ]]; then
  echo "Error: tracking.db not found" >&2
  exit 1
fi

echo "Syncing pipeline stages to GitHub Issues..."

ALL_STAGE_LABELS="stage:idea,stage:implementation,stage:testing,stage:documentation,stage:archive"

# For each requirement, find its most advanced done stage
sqlite3 -separator $'\t' "$DB" "
  SELECT r.id,
    CASE
      WHEN p5.status = 'done' THEN 'stage:archive'
      WHEN p4.status = 'done' THEN 'stage:documentation'
      WHEN p3.status = 'done' THEN 'stage:testing'
      WHEN p2.status = 'done' THEN 'stage:implementation'
      ELSE 'stage:idea'
    END AS current_stage,
    CASE
      WHEN p3.status = 'fail' THEN 'status:fail'
      WHEN p2.status = 'in_progress' THEN 'status:pending'
      ELSE ''
    END AS status_label
  FROM requirements r
  LEFT JOIN pipeline p2 ON p2.req_id = r.id AND p2.stage = 'implementation'
  LEFT JOIN pipeline p3 ON p3.req_id = r.id AND p3.stage = 'testing'
  LEFT JOIN pipeline p4 ON p4.req_id = r.id AND p4.stage = 'documentation'
  LEFT JOIN pipeline p5 ON p5.req_id = r.id AND p5.stage = 'archive'
  ORDER BY r.id;
" | while IFS=$'\t' read -r req_id current_stage status_label; do
  # Find the issue number
  issue_number=$(gh issue list --search "\"[${req_id}]\" in:title" --json number --jq '.[0].number' 2>/dev/null || echo "")
  if [[ -z "$issue_number" ]]; then
    echo "  ${req_id}: no issue found, skipping"
    continue
  fi

  # Remove all stage labels, then add the current one
  for label in stage:idea stage:implementation stage:testing stage:documentation stage:archive; do
    gh issue edit "$issue_number" --remove-label "$label" 2>/dev/null || true
  done
  gh issue edit "$issue_number" --add-label "$current_stage" 2>/dev/null || true

  # Add status label if applicable
  if [[ -n "$status_label" ]]; then
    gh issue edit "$issue_number" --remove-label "status:pass" --remove-label "status:fail" --remove-label "status:pending" 2>/dev/null || true
    gh issue edit "$issue_number" --add-label "$status_label" 2>/dev/null || true
  fi

  echo "  ${req_id} (#${issue_number}) → ${current_stage} ${status_label}"
done

echo ""
echo "Sync complete."
