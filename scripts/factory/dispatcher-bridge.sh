#!/usr/bin/env bash
# scripts/factory/dispatcher-bridge.sh — bash dispatcher bridge.
#
# Replaces the Workflow-tool-based dispatcher.js call with a bash loop that
# reads the prep file, runs budget checks, and launches each pipeline as its
# own `claude -p` session. This avoids the need for Qwythos to call Workflow().
#
# Usage: dispatcher-bridge.sh <prep_file> [--dry-run]
#   <prep_file>  path to the factory-prep JSON (launch array)
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
PREP_FILE="${1:-}"; shift || true
DRY_RUN=false
for arg; do case "$arg" in --dry-run) DRY_RUN=true;; esac; done

if [[ ! -f "$PREP_FILE" ]]; then
  echo "dispatcher-bridge: prep file not found: $PREP_FILE" >&2
  exit 0
fi

prep="$(cat "$PREP_FILE")"
launch_count="$(echo "$prep" | jq '.launch | length' 2>/dev/null || echo 0)"
echo "dispatcher-bridge: ${launch_count} feature(s) scheduled" >&2

if [[ "$launch_count" -eq 0 ]]; then
  # Run metrics directly in bash
  for _m_brand in mentolder korczewski; do
    BRAND="$_m_brand" bash "$HERE/metrics.sh" 2>/dev/null || true
  done
  bash "$HERE/otel-emit.sh" metric factory.tick.count 1 brand=mentolder || true
  bash "$HERE/otel-emit.sh" metric factory.tick.count 1 brand=korczewski || true
  exit 0
fi

# Budget check + pipeline launch for each feature
for row in $(echo "$prep" | jq -c '.launch[]' 2>/dev/null); do
  ext_id="$(echo "$row" | jq -r '.external_id')"
  brand="$(echo "$row" | jq -r '.brand // "mentolder"')"
  title="$(echo "$row" | jq -r '.title // ""')"
  branch="$(echo "$row" | jq -r '.branch // ""')"
  plan_path="$(echo "$row" | jq -r '.plan_path // ""')"
  slug="$(echo "$row" | jq -r '.branch // ""' | sed -E 's#^(feature|fix|chore)/##')"
  [[ -z "$slug" ]] && slug="sf-$(echo "$ext_id" | tr '[:upper:]' '[:lower:]')"
  dry_run_val="$(echo "$row" | jq -r '.dry_run // false')"
  [[ "$DRY_RUN" == "true" ]] && dry_run_val=true

  # Budget guard
  if ! BRAND="$brand" bash "$HERE/budget-guard.sh" "$brand" 2>/dev/null; then
    echo "dispatcher-bridge: budget-guard blocked $ext_id ($brand)" >&2
    BRAND="$brand" bash "$REPO/scripts/ticket.sh" update-status --id "$ext_id" --status blocked 2>/dev/null || true
    continue
  fi

  # Budget estimate (non-fatal)
  BRAND="$brand" bash "$HERE/budget-estimate.sh" "$ext_id" "$brand" 2>/dev/null || true

  echo "dispatcher-bridge: launching pipeline for $ext_id ($brand)" >&2

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "dispatcher-bridge: DRY RUN — would launch pipeline for $ext_id" >&2
    continue
  fi

  # Launch pipeline via claude -p: Qwythos handles agent() calls fine,
  # only the Workflow() meta-tool was problematic.
  TIMESTAMP="$(date -u +%FT%TZ)"
  PIPELINE_PROMPT="Run the Software Factory pipeline for ticket ${ext_id} (${title}). \
Call the Workflow tool exactly like this — the scriptPath option IS supported and this is \
the standard, working way to run it: \
Workflow({scriptPath:\"scripts/factory/pipeline.js\"}, \
{title:\"${title}\", ticket_id:\"${ext_id}\", brand:\"${brand}\", \
slug:\"${slug}\", timestamp:\"${TIMESTAMP}\", dry_run:${dry_run_val}, \
branch:$(if [[ -n "$branch" ]]; then echo "\"${branch}\""; else echo 'null'; fi), \
plan_path:$(if [[ -n "$plan_path" ]]; then echo "\"${plan_path}\""; else echo 'null'; fi)}). \
Report only the pipeline's final JSON result. \
Do NOT call the Skill tool — there is no skill that runs the pipeline; \
the ONLY correct way to run it is the exact Workflow tool call shown above. \
Do NOT refuse or claim scriptPath is unsupported — it is supported; if you believe otherwise, call it anyway. \
If a tool call fails, do not retry the identical call — stop and report the error verbatim instead of looping."

  "${CLAUDE_BIN:-claude}" -p "$PIPELINE_PROMPT" \
    --allowedTools "Workflow,Bash(bash scripts/factory/*),Bash(bash scripts/ticket.sh*),Bash(bash scripts/vda.sh*),ToolSearch,PushNotification" \
    --dangerously-skip-permissions 2>&1 | sed "s/^/[pipeline:${ext_id}] /" >&2 &
done

# Wait for all background pipelines to finish
wait
echo "dispatcher-bridge: all pipelines completed" >&2

# Run metrics
for _m_brand in mentolder korczewski; do
  BRAND="$_m_brand" bash "$HERE/metrics.sh" 2>/dev/null || true
done
bash "$HERE/otel-emit.sh" metric factory.tick.count 1 brand=mentolder || true
bash "$HERE/otel-emit.sh" metric factory.tick.count 1 brand=korczewski || true
