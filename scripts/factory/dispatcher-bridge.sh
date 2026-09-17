#!/usr/bin/env bash
# scripts/factory/dispatcher-bridge.sh — bash dispatcher bridge.
#
# Replaces the Workflow-tool-based dispatcher.js call with a bash loop that
# reads the prep file, runs budget checks, and launches each pipeline as its
# own `claude -p` session. This avoids the need for qwen3.6-14b-a3b-fablevibes to call Workflow().
#
# Usage: dispatcher-bridge.sh <prep_file> [--dry-run]
#   <prep_file>  path to the factory-prep JSON (launch array)
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# check_ticket_readiness [T003773] — Branch/Plan-Gate vor jedem Launch (siehe
# Aufrufstelle in der Launch-Schleife). Sourcen statt aufrufen, damit der Guard
# die einzige Implementierung dieser Regel bleibt.
# shellcheck source=scripts/factory/readiness-check.sh
source "$HERE/readiness-check.sh"
# shellcheck source=/dev/null
source "$HERE/lib.sh"
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

# resolve_executor (T900210, STRUCT1/STRUCT3): pure routing function, no ENV reads.
#   resolve_executor <mode> <executor>  ->  echoes one of claude|opencode|dsh.
#   local            -> opencode (no cloud escalation; dsh harness preserved).
#   api              -> the passed executor (claude path kept for API operation).
#   mixed (default)  -> opencode, unless explicitly claude.
#   unknown/empty mode -> warning on stderr + mixed behavior (F2).
#   unknown/empty executor -> opencode (fail-closed, F1; the caller warns).
resolve_executor() {
  local mode="${1:-mixed}" executor="${2:-opencode}"
  case "$mode" in
    local|api|mixed) ;;
    *) echo "dispatcher-bridge: unknown FACTORY_MODE='$mode' — falling back to mixed" >&2
       mode=mixed ;;
  esac
  if [[ "$executor" == "dsh" ]]; then
    echo "dsh"
    return 0
  fi
  case "$mode" in
    local) echo "opencode" ;;
    api)
      case "$executor" in
        claude|opencode) echo "$executor" ;;
        *) echo "opencode" ;;
      esac
      ;;
    mixed|*)
      case "$executor" in
        claude) echo "claude" ;;
        *) echo "opencode" ;;
      esac
      ;;
  esac
}

# Budget check + pipeline launch for each feature.
# Iterate compact-JSON rows safely: the previous `for row in $(...)` form split
# on IFS whitespace, so any title with spaces (e.g. T001945's
# "Health-Goal: G-SIZE02 — Großdateien … (17 → ≤8)") caused the loop to fire
# once per whitespace-delimited fragment with empty ext_id/brand, blocking at
# the budget-guard without ever launching the pipeline. `mapfile` reads the
# newline-delimited rows verbatim.
mapfile -t launch_rows < <(echo "$prep" | jq -c '.launch[]' 2>/dev/null)
for row in "${launch_rows[@]}"; do
  ext_id="$(echo "$row" | jq -r '.external_id')"
  brand="$(echo "$row" | jq -r '.brand // "mentolder"')"
  title="$(echo "$row" | jq -r '.title // ""')"
  description="$(echo "$row" | jq -r '.description // ""')"
  description_escaped="$(printf '%s' "$description" | jq -Rs .)"
  branch="$(echo "$row" | jq -r '.branch // ""')"
  plan_path="$(echo "$row" | jq -r '.plan_path // ""')"
  wt_path="$(echo "$row" | jq -r '.worktree_path // ""')"
  # [T012502] docs/ mitstrippen: pipeline.mjs leitet den Praefix seit T012502 aus
  # dem Ticket-Typ ab. Bliebe docs/ stehen, landete es im slug — und damit im
  # Worktree-Pfad (.worktrees/docs/<name>) und im OpenSpec-Verzeichnis.
  slug="$(echo "$row" | jq -r '.branch // ""' | sed -E 's#^(feature|fix|chore|docs)/##')"
  [[ -z "$slug" ]] && slug="sf-$(echo "$ext_id" | tr '[:upper:]' '[:lower:]')"
  dry_run_val="$(echo "$row" | jq -r '.dry_run // false')"
  [[ "$DRY_RUN" == "true" ]] && dry_run_val=true
  attempt="$(echo "$row" | jq -r '.attempt // 1')"
  model_tier="$(echo "$row" | jq -r '.model_tier // "flash"')"
  # [T900208] Der Modell-Pin/Lock aus llm-proxy /admin/factory ist mit dem Proxy
  # entfallen; model_tier kommt allein aus der Launch-Zeile.

  # Readiness-Gate [T003773] — VOR dem Budget-Guard, damit eine planlose Zeile
  # weder Budget noch Gang-Slot verbraucht. Der Guard existierte samt Requirement
  # und Tests, hatte aber ausserhalb tests/unit/factory-readiness.bats keinen
  # Aufrufer: planlose Tickets liefen mit branch/plan_path="null" durch, und der
  # LAUNCH_DIR-Fallback unten schickte sie in den HAUPT-CHECKOUT (am 2026-08-11
  # rebaste und benannte ein Lauf dort den Branch einer fremden Session um).
  #
  # KEINE eigene "null"-Normalisierung hier: check_ticket_readiness behandelt den
  # Literalstring bereits als missing_args. Eine zweite Pruefung waere die
  # Duplikation, die das Requirement ausdruecklich untersagt.
  if ! readiness_json="$(check_ticket_readiness "$branch" "$plan_path")"; then
    readiness_reason="$(printf '%s' "$readiness_json" | jq -r '.reason // "unknown"' 2>/dev/null || echo unknown)"
    echo "dispatcher-bridge: $ext_id not ready (readiness=$readiness_reason) — skipping launch" >&2
    continue
  fi

  # Doppel-Dispatch-Guard [T004610] — branch-scoped geclaimter Branch wird uebersprungen
  if ! lock_json="$(check_branch_lock "$branch")"; then
    lock_reason="$(printf '%s' "$lock_json" | jq -r '.reason // "unknown"' 2>/dev/null || echo unknown)"
    echo "dispatcher-bridge: $ext_id not ready (readiness=$lock_reason) — skipping launch" >&2
    continue
  fi

  # Budget guard
  if ! BRAND="$brand" bash "$HERE/budget-guard.sh" "$brand" 2>/dev/null; then
    echo "dispatcher-bridge: budget-guard blocked $ext_id ($brand)" >&2
    BRAND="$brand" bash "$REPO/scripts/ticket.sh" update-status --id "$ext_id" --status blocked 2>/dev/null || true
    continue
  fi

  # Budget estimate (non-fatal)
  BRAND="$brand" bash "$HERE/budget-estimate.sh" "$ext_id" "$brand" 2>/dev/null || true

  echo "dispatcher-bridge: launching pipeline for $ext_id ($brand) tier=${model_tier} attempt=${attempt}" >&2

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "dispatcher-bridge: DRY RUN — would launch pipeline for $ext_id" >&2
    continue
  fi

  # Launch pipeline via claude -p: qwythos-9b-v2 handles agent() calls fine,
  # only the Workflow() meta-tool was problematic.
  #
  # The factory-prep step pre-created an isolated worktree branched from
  # origin/<branch> (not origin/main) and the plan file is materialized on disk
  # at <wt_path>/<plan_path>. The prompt is intentionally written without any
  # "do NOT refuse / call it anyway" override — that pattern is correctly
  # detected by the model as manipulation and triggers a full safety refusal
  # even for legitimate use. The plan existence is verifiable via the worktree
  # path or via `git show origin/<branch>:<plan_path>` from the main repo.
  TIMESTAMP="$(date -u +%FT%TZ)"
  PIPELINE_PROMPT="Run the Software Factory pipeline for ticket ${ext_id} (${title}).

Context:
  - repo: ${REPO}
  - feature branch (origin): ${branch:-<none>}
  - plan file: ${plan_path:-<none>}  (materialized at ${wt_path:-<n/a>}/${plan_path:-<none>}, or read with: git show origin/${branch:-HEAD}:${plan_path:-<none>})
  - slug: ${slug}
  - brand: ${brand}
  - dry_run: ${dry_run_val}
  - timestamp: ${TIMESTAMP}

Invoke the Workflow tool with these exact arguments to run the pipeline:
  Workflow({scriptPath:\"${REPO}/scripts/factory/pipeline.mjs\"}, {
    title:\"${title}\",
    description:${description_escaped},
    ticket_id:\"${ext_id}\",
    brand:\"${brand}\",
    slug:\"${slug}\",
    timestamp:\"${TIMESTAMP}\",
    dry_run:${dry_run_val},
    attempt:${attempt},
    model_tier:\"${model_tier}\",
    branch:$(if [[ -n "$branch" ]]; then echo "\"${branch}\""; else echo 'null'; fi),
    plan_path:$(if [[ -n "$plan_path" ]]; then echo "\"${plan_path}\""; else echo 'null'; fi),
    worktree_path:$(if [[ -n "$wt_path" && "$wt_path" != "null" ]]; then echo "\"${wt_path}\""; else echo 'null'; fi)
  })

Report only the pipeline's final JSON result. The pipeline.js workflow is the
standard, supported way to run a Software Factory pipeline; do not try to run
it as a Skill or via any other mechanism. If a tool call fails, do not retry
the identical call — stop and report the error verbatim instead of looping."

  # Run the session rooted in the pre-created worktree (T001990) — without an
  # explicit cd, the process inherits dispatcher-bridge.sh's own cwd (the main
  # checkout), so any file write the agent makes (including a workaround like
  # invoking pipeline.js directly with node instead of the Workflow tool)
  # lands in the shared main checkout instead of the isolated worktree.
  LAUNCH_DIR="${wt_path:-$REPO}"
  if [[ "$LAUNCH_DIR" == "null" || ! -d "$LAUNCH_DIR" ]]; then
    LAUNCH_DIR="$REPO"
  fi

  # Executor branch (T002128, D3; T900210 default-flip): default opencode
  # orchestrator vs. explicit claude -p. The claude branch is byte-identical to
  # the pre-T002128 spawn and stays for explicit API operation; dsh stays for
  # the dsh-harness. Unknown executor warns and falls back to opencode
  # (fail-closed, F1). FACTORY_MODE (local|api|mixed, default mixed) routes via
  # resolve_executor() above; the resolved value drives the single spawn site
  # per executor below (STRUCT2). Both branches keep the [pipeline:${ext_id}]
  # sed prefix and the trailing & so the outer `wait` (below) still joins them.
  executor="${FACTORY_EXECUTOR:-opencode}"
  case "$executor" in
    claude|opencode|dsh) ;;
    *) echo "dispatcher-bridge: unknown FACTORY_EXECUTOR='$executor' — falling back to opencode" >&2
       executor=opencode ;;
  esac
  FACTORY_MODE="${FACTORY_MODE:-mixed}"
  case "$FACTORY_MODE" in
    local|api|mixed) ;;
    *) echo "dispatcher-bridge: unknown FACTORY_MODE='$FACTORY_MODE' — falling back to mixed" >&2
       FACTORY_MODE=mixed ;;
  esac
  resolved_executor="$(resolve_executor "$FACTORY_MODE" "$executor")"

  if [[ "$resolved_executor" == "opencode" ]]; then
    ( bash "$HERE/opencode-exec.sh" "$ext_id" "$LAUNCH_DIR" "$branch" "$plan_path" 2>&1 ) \
      | sed "s/^/[pipeline:${ext_id}] /" >&2 &
  elif [[ "$resolved_executor" == "dsh" ]]; then
    ( bash "$HERE/dsh-exec.sh" "$ext_id" "$LAUNCH_DIR" "$branch" "$plan_path" 2>&1 ) \
      | sed "s/^/[pipeline:${ext_id}] /" >&2 &
  else
    (cd "$LAUNCH_DIR" && "${CLAUDE_BIN:-claude}" -p "$PIPELINE_PROMPT" \
      --allowedTools "Workflow,Bash(bash scripts/factory/*),Bash(bash scripts/ticket.sh*),Bash(bash scripts/vda.sh*),ToolSearch,PushNotification" \
      --dangerously-skip-permissions 2>&1) | sed "s/^/[pipeline:${ext_id}] /" >&2 &
  fi
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
