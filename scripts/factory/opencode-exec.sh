#!/usr/bin/env bash
# scripts/factory/opencode-exec.sh — opencode orchestrator executor (opt-in, T002128).
# Called by dispatcher-bridge.sh when FACTORY_EXECUTOR=opencode. Builds an orchestrator
# prompt (ticket, branch, worktree, plan, ## Partials manifest, trial guardrails), runs
# `opencode run --agent orchestrator --format json` in the launch worktree, and records
# `implement` phase-events (entered/done/blocked) with structured detail JSON. Exit != 0
# => a blocked event and NO fallback to claude -p (observability over convenience).
#
# Usage: opencode-exec.sh <ticket_ext_id> <launch_dir> <branch> <plan_path>
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

EXT_ID="${1:-}"; LAUNCH_DIR="${2:-}"; BRANCH="${3:-}"; PLAN_PATH="${4:-}"
[[ -z "$EXT_ID" ]] && { echo "opencode-exec: missing ticket ext_id" >&2; exit 2; }
[[ -n "$LAUNCH_DIR" && -d "$LAUNCH_DIR" ]] || LAUNCH_DIR="$REPO"

# --- load plan body + extract the ## Partials manifest (best-effort) -----------------
plan_body=""
if [[ -n "$PLAN_PATH" && -f "$LAUNCH_DIR/$PLAN_PATH" ]]; then
  plan_body="$(cat "$LAUNCH_DIR/$PLAN_PATH")"
elif [[ -n "$BRANCH" && -n "$PLAN_PATH" ]]; then
  plan_body="$(git -C "$REPO" show "origin/${BRANCH}:${PLAN_PATH}" 2>/dev/null || true)"
fi
partials_manifest="$(printf '%s\n' "$plan_body" \
  | awk '/^##[[:space:]]+Partials/{f=1;print;next} f&&/^##[[:space:]]/{f=0} f{print}')"
[[ -z "${partials_manifest//[[:space:]]/}" ]] \
  && partials_manifest="(no ## Partials section — orchestrator partitions the plan itself)"
mapfile -t partial_ids < <(printf '%s\n' "$partials_manifest" \
  | grep -oiE '\bp[0-9]+\b' | tr 'P' 'p' | awk '!seen[$0]++')

# --- helper: record one implement phase-event (positional ticket.sh phase form) ------
phase_event() { # <state> <subagent> <partial> <duration_s> <exit>
  local detail
  detail="$(jq -cn --arg s "$2" --arg p "$3" --argjson d "${4:-0}" --argjson e "${5:-0}" \
    '{executor:"opencode",subagent:$s,partial:$p,duration_s:$d,exit:$e}')"
  bash "$REPO/scripts/ticket.sh" phase "$EXT_ID" implement "$1" \
    --driver factory --detail "$detail" 2>/dev/null || true
}

phase_event entered orchestrator all 0 0

# --- build the orchestrator prompt (manifest as a data arg — NO shell expansion) -----
PROMPT="$(printf '%s\n' \
  "You are the Software Factory orchestrator. Implement ticket ${EXT_ID} from its staged plan." \
  "Feature branch (origin): ${BRANCH:-<none>}" \
  "Worktree (your cwd): ${LAUNCH_DIR}" \
  "Plan file: ${PLAN_PATH:-<none>}" \
  "" \
  "Dispatch up to 4 bonsai-8b subagents onto the DISJOINT partials below; each owns" \
  "its partial end-to-end (edit, test) inside this worktree." \
  "" \
  "## Partials" \
  "${partials_manifest}" \
  "" \
  "Guardrails (opt-in trial, D3):" \
  "- Do NOT merge the PR and do NOT enable auto-merge — stop at the pr-ready gate." \
  "- Respect the existing pr-ready / CI gate; never bypass it." \
  "- After 2 failed attempts on a single partial, escalate THAT partial to the" \
  "  deepseek-helper subagent (do not loop the same bonsai-8b agent)." \
  "- Report only the final JSON result.")"

# --- run opencode in the launch worktree, measure duration ---------------------------
start=$(date +%s)
run_log="$(mktemp)"
( cd "$LAUNCH_DIR" && opencode run --agent orchestrator --format json "$PROMPT" ) \
  >"$run_log" 2>&1
ex=$?
dur=$(( $(date +%s) - start ))
state=done; [[ $ex -ne 0 ]] && state=blocked

# --- terminal telemetry: one event per partial (deterministic gang-slot mapping) -----
if [[ ${#partial_ids[@]} -eq 0 ]]; then
  phase_event "$state" orchestrator all "$dur" "$ex"
else
  i=0
  for pid in "${partial_ids[@]}"; do
    phase_event "$state" "bonsai-8b-$(( i % 4 + 1 ))" "$pid" "$dur" "$ex"
    i=$(( i + 1 ))
  done
fi

if [[ $ex -ne 0 ]]; then
  echo "opencode-exec: orchestrator run for $EXT_ID exited $ex (blocked; NO claude fallback)" >&2
  tail -n 40 "$run_log" | sed "s/^/[opencode-exec:${EXT_ID}] /" >&2
fi
rm -f "$run_log"
exit "$ex"
