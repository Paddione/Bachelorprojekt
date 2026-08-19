#!/usr/bin/env bash
# scripts/factory/dsh-exec.sh — DeepSeek Harness executor (opt-in, T012962).
# Called by dispatcher-bridge.sh when FACTORY_EXECUTOR=dsh. Builds an orchestrator
# prompt (ticket, branch, worktree, plan, ## Partials manifest, trial guardrails),
# runs `dsh run` in the launch worktree, and records `implement` phase-events
# (entered/done/blocked) with structured detail JSON. Exit != 0 => a blocked event
# and NO fallback to claude -p (observability over convenience).
#
# Usage: dsh-exec.sh <ticket_ext_id> <launch_dir> <branch> <plan_path>
#
# Exit-Codes (jede Ursache ihr eigener Code, T003275):
#   0  Lauf erfolgreich, Commit vorhanden
#   2  dsh-Binary/Checkout nicht gefunden (bewusst nicht 127)
#   6  Lief, hinterließ aber weder Commit noch Änderung
#   7  ohne Branch/Plan abgelehnt, Lauf gar nicht gestartet
#   8  für dieses Ticket läuft bereits ein dsh-Prozess
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

EXT_ID="${1:-}"; LAUNCH_DIR="${2:-}"; BRANCH="${3:-}"; PLAN_PATH="${4:-}"
[[ -z "$EXT_ID" ]] && { echo "dsh-exec: missing ticket ext_id" >&2; exit 2; }
[[ -n "$LAUNCH_DIR" && -d "$LAUNCH_DIR" ]] || LAUNCH_DIR="$REPO"

# --- dsh-Binary auflösen (T003275 analog) -----------------------------------------
DSH_BIN="${DSH_BIN:-$(command -v dsh 2>/dev/null || echo "$HOME/.local/bin/dsh")}"
if [[ -z "${DSH_BIN}" || ! -x "${DSH_BIN}" ]]; then
  DSH_BIN="$REPO/deepseek-harness/node_modules/.bin/dsh"
fi
if [[ -z "${DSH_BIN}" || ! -x "${DSH_BIN}" ]]; then
  echo "dsh-exec: dsh-Binary nicht gefunden (gesucht: \$DSH_BIN, command -v dsh, deepseek-harness/node_modules/.bin/dsh) — Abbruch mit Exit 2" >&2
  exit 2
fi

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

# --- helper: record one implement phase-event --------------------------------------
phase_event() { # <state> <subagent> <partial> <duration_s> <exit> [reason]
  local detail
  detail="$(jq -cn --arg s "$2" --arg p "$3" --argjson d "${4:-0}" --argjson e "${5:-0}" --arg r "${6:-}" \
    '{executor:"dsh",subagent:$s,partial:$p,duration_s:$d,exit:$e,reason:$r}')"
  bash "$REPO/scripts/ticket.sh" phase "$EXT_ID" implement "$1" \
    --driver factory --detail "$detail" 2>/dev/null || true
}

# --- zweite Verteidigungslinie gegen planlose Laeufe [T003773] ----------------------
[[ "$BRANCH"    == "null" ]] && BRANCH=""
[[ "$PLAN_PATH" == "null" ]] && PLAN_PATH=""
if [[ -z "$BRANCH" || -z "$PLAN_PATH" ]]; then
  phase_event blocked orchestrator all 0 7 no_plan
  echo "dsh-exec: $EXT_ID ohne Branch/Plan — Abbruch (reason=no_plan)" >&2
  exit 7
fi

# --- Doppel-Dispatch-Guard [T004610] -----------------------------------------------
# shellcheck source=scripts/factory/readiness-check.sh
source "$HERE/readiness-check.sh"
if ! check_branch_lock "$BRANCH" >/dev/null 2>&1; then
  echo "dsh-exec: $EXT_ID Branch $BRANCH ist geclaimt — kein Launch" >&2
  exit 7
fi

# --- Prozess-Guard gegen Doppel-Dispatch [T011543] ----------------------------------
if pgrep -f "Implement ticket ${EXT_ID} from its staged plan.*dsh" >/dev/null 2>&1; then
  phase_event blocked orchestrator all 0 8 already_running
  echo "dsh-exec: $EXT_ID — es läuft bereits ein dsh-Prozess für dieses Ticket (exit 8)" >&2
  exit 8
fi

# PR-Schritt + Orphan-Erkennung (T011543)
# shellcheck source=scripts/factory/pr-ready.sh
source "$HERE/pr-ready.sh"

pr_ready_signal() { # <duration_s>
  local dur_s="${1:-0}" head_oid total
  head_oid="$(gh pr view -R Paddione/Bachelorprojekt "$BRANCH" --json headRefOid -q '.headRefOid' 2>/dev/null || echo "")"
  if [[ -z "$head_oid" ]]; then
    phase_event done orchestrator pr-ready "$dur_s" 0
    return
  fi
  total="$(gh api "repos/Paddione/Bachelorprojekt/commits/${head_oid}/check-runs" -q '.total_count' 2>/dev/null || echo "")"
  if [[ "$total" == "0" ]]; then
    echo "dsh-exec: $EXT_ID — ci-never-ran: PR-HEAD hat keine Check-Runs" >&2
    phase_event blocked orchestrator pr-ready "$dur_s" 0 ci_never_ran
  elif [[ -n "$total" ]]; then
    phase_event done orchestrator pr-ready "$dur_s" 0 "ci=${total}-checks"
  else
    phase_event done orchestrator pr-ready "$dur_s" 0
  fi
}

# --- Pre-Run-Orphan-Kurzschluss [T011581] -------------------------------------------
if [[ -z "$(git -C "$LAUNCH_DIR" status --porcelain 2>/dev/null)" ]] \
   && has_implementation "$LAUNCH_DIR" "$EXT_ID"; then
  echo "dsh-exec: $EXT_ID — Implementierungs-Commit [$EXT_ID] liegt bereits auf ${BRANCH}; kein erneuter Lauf [T011581]" >&2
  phase_event done orchestrator all 0 0 already_implemented
  if ensure_pr "$LAUNCH_DIR" "$BRANCH" "$EXT_ID"; then
    pr_ready_signal 0
  else
    phase_event blocked orchestrator pr-ready 0 0 pr_step_failed
  fi
  bash "$REPO/scripts/ticket.sh" retry-count reset --id "$EXT_ID" >/dev/null 2>&1 || true
  exit 0
fi

phase_event entered orchestrator all 0 0

# --- build the orchestrator prompt ---------------------------------------------------
PROMPT="$(printf '%s\n' \
  "You are the Software Factory orchestrator. Implement ticket ${EXT_ID} from its staged plan." \
  "Feature branch (origin): ${BRANCH:-<none>}" \
  "Worktree (your cwd): ${LAUNCH_DIR}" \
  "Plan file: ${PLAN_PATH:-<none>}" \
  "" \
  "Dispatch up to 3 local family subagents (gemma12) onto the" \
  "DISJOINT partials below; each owns its partial end-to-end (edit, test) inside" \
  "this worktree." \
  "" \
  "## Partials" \
  "${partials_manifest}" \
  "" \
  "## Required end state (T003335)" \
  "The run counts as done ONLY if all of these hold when you finish:" \
  "1. The plan is implemented in this worktree." \
  "2. The plan's failing test is green." \
  "3. The work is COMMITTED on ${BRANCH:-the feature branch} with a conventional" \
  "   commit whose subject carries [${EXT_ID}]." \
  "4. The commit is PUSHED to origin." \
  "Do NOT stop after analysing the plan. A run that ends without a commit is a" \
  "failed run, not a finished one." \
  "" \
  "Guardrails:" \
  "- Do NOT merge the PR and do NOT enable auto-merge — stop at the pr-ready gate." \
  "- Do NOT open a PR either; the caller does that after verifying the result." \
  "- Report only the final JSON result.")"

# --- run dsh in the launch worktree -------------------------------------------------
start=$(date +%s)
run_log="$(mktemp)"
head_before="$(git -C "$LAUNCH_DIR" rev-parse HEAD 2>/dev/null || true)"

( cd "$LAUNCH_DIR" && "$DSH_BIN" run "$PROMPT" ) \
  >"$run_log" 2>&1
ex=$?
dur=$(( $(date +%s) - start ))

# --- Ergebnis-Check (T003335) --------------------------------------------------------
produced_work=false
if [[ $ex -eq 0 ]]; then
  head_after="$(git -C "$LAUNCH_DIR" rev-parse HEAD 2>/dev/null || true)"
  if [[ -n "$head_after" && "$head_after" != "$head_before" ]]; then
    produced_work=true
  elif [[ -n "$(git -C "$LAUNCH_DIR" status --porcelain 2>/dev/null)" ]]; then
    produced_work=true
  elif has_implementation "$LAUNCH_DIR" "$EXT_ID"; then
    produced_work=true
    echo "dsh-exec: $EXT_ID — Implementierung liegt bereits auf ${BRANCH}; Lauf zählt als done [T011543]" >&2
  fi
  if [[ "$produced_work" != true ]]; then
    ex=6
    echo "dsh-exec: dsh run for $EXT_ID exited 0 but produced NO commit — treating as blocked [T003335]" >&2
  fi
fi

state=done; [[ $ex -ne 0 ]] && state=blocked

# --- PR-Schritt (T011543) ------------------------------------------------------------
if [[ "$state" == done ]]; then
  if ensure_pr "$LAUNCH_DIR" "$BRANCH" "$EXT_ID"; then
    pr_ready_signal "$dur"
  else
    phase_event blocked orchestrator pr-ready "$dur" 0 pr_step_failed
  fi
fi

# --- terminal telemetry --------------------------------------------------------------
if [[ ${#partial_ids[@]} -eq 0 ]]; then
  phase_event "$state" orchestrator all "$dur" "$ex"
else
  i=0
  for pid in "${partial_ids[@]}"; do
    phase_event "$state" "gemma12-$(( i % 3 + 1 ))" "$pid" "$dur" "$ex"
    i=$(( i + 1 ))
  done
fi

# --- Retry-Limit (T003810) -----------------------------------------------------------
if [[ "$produced_work" == true ]]; then
  bash "$REPO/scripts/ticket.sh" retry-count reset --id "$EXT_ID" >/dev/null 2>&1 || true
elif [[ $ex -eq 6 ]]; then
  retries="$(bash "$REPO/scripts/ticket.sh" retry-count incr --id "$EXT_ID" 2>/dev/null | tail -1 || true)"
  retries="$(printf '%s' "$retries" | tr -cd '0-9')"
  if [[ -n "$retries" && "$retries" -ge 3 ]]; then
    echo "dsh-exec: $EXT_ID — 3 aufeinanderfolgende Läufe ohne Implementierungs-Commit (exit 6) — Ticket auf planning zurückgesetzt" >&2
    bash "$REPO/scripts/ticket.sh" update-status --id "$EXT_ID" --status planning >/dev/null 2>&1 || true
    bash "$REPO/scripts/ticket.sh" release-slot --id "$EXT_ID" >/dev/null 2>&1 || true
    bash "$REPO/scripts/ticket.sh" add-comment --id "$EXT_ID" \
      --body "Factory: 3 aufeinanderfolgende Läufe ohne Implementierungs-Commit (exit 6) — Plan mit dsh-Setup nicht umsetzbar. Ticket auf planning zurückgesetzt." >/dev/null 2>&1 || true
    bash "$REPO/scripts/ticket.sh" retry-count reset --id "$EXT_ID" >/dev/null 2>&1 || true
    if [[ "$LAUNCH_DIR" != "$REPO" ]]; then
      if git -C "$REPO" worktree remove --force "$LAUNCH_DIR" 2>/dev/null; then
        git -C "$REPO" worktree prune 2>/dev/null || true
      fi
    fi
  fi
fi

if [[ $ex -ne 0 ]]; then
  echo "dsh-exec: dsh run for $EXT_ID exited $ex (blocked; NO claude fallback)" >&2
  tail -n 40 "$run_log" | sed "s/^/[dsh-exec:${EXT_ID}] /" >&2
fi
rm -f "$run_log"
exit "$ex"
