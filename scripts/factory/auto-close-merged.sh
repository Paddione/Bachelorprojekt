#!/usr/bin/env bash
# scripts/factory/auto-close-merged.sh — factory poll: close tickets whose
# associated PR is already merged on GitHub but the local ticket status has
# not yet advanced to done. Closes the auto-close gap observed in T001415
# (T001371, T001412, T414 all merged without their tickets transitioning).
#
# USAGE: BRAND=<brand> bash scripts/factory/auto-close-merged.sh [--dry-run]
#
# ENV:
#   BRAND              — mentolder|korczewski (required)
#   FACTORY_DRY_RESOLVE — when set, skips cluster access (offline-test)

set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"

DRY_RUN=false
while [[ $# -gt 0 ]]; do case "$1" in
  --dry-run) DRY_RUN=true; shift ;;
  --help)
    echo "Usage: BRAND=<brand> bash $(basename "${BASH_SOURCE[0]}") [--dry-run]"
    echo "  auto-close-merged: merged PRs with [T-NNNNNN] → ticket.sh update-status done"
    # T001580: Skips plan-only/archive branches to avoid premature closure
    exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac; done

if [[ -z "${BRAND:-}" ]]; then
  echo "ERROR: BRAND env var is required (mentolder|korczewski)" >&2
  exit 1
fi

if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
  echo "auto-close-merged [DRY-RESOLVE]: ctx=dry ns=dry brand=${BRAND} [T001580]"
  exit 0
fi

factory_resolve

# T002598-M1: Decide whether a PR is plan-only by file content, not by branch
# name. `gh pr view --json files` caps at 100 files, which hides implementation
# files in large PRs (e.g. #3737 — scripts/openspec.sh was beyond the cap), so
# use the paginated gh api instead. A plan-only PR changes only openspec/**
# plan/archive files plus regenerated artifacts; any implementation file
# (scripts/, tests/, k3d/, website/src/, .github/, brett/, docs/ non-generated)
# makes it an execution PR that must auto-close.
#
# Returns 0 (plan-only) or 1 (execution / cannot determine).
pr_is_plan_only() {
  local pr_num="$1"
  local files
  files="$(gh api "repos/{owner}/{repo}/pulls/${pr_num}/files?per_page=100" --paginate --jq '.[].filename' 2>/dev/null)" || return 1
  [[ -z "$files" ]] && return 1
  local f
  while IFS= read -r f; do
    case "$f" in
      openspec/*) continue ;;
      # Generated artifacts — plan-only PRs regenerate these (openspec-status-map,
      # freshness:regenerate). Everything else is implementation.
      website/src/data/openspec-status.json) continue ;;
      website/src/data/test-inventory.json) continue ;;
      website/src/data/route-manifest.json) continue ;;
      website/src/lib/learning-assets.generated.json) continue ;;
      website/src/lib/sdlc/goals-data.generated.json) continue ;;
      website/src/lib/agent-guide.generated.json) continue ;;
      docs/code-quality/repo-index.json) continue ;;
      docs/code-quality/loc-budget.json) continue ;;
      docs/generated/*) continue ;;
      k3d/docs-content-built/*) continue ;;
      *) return 1 ;;
    esac
  done <<< "$files"
  return 0
}

# Pull the most recent 30 merged PRs with metadata (branch name for T001580).
# The branch name is needed to skip plan-only PRs (chore/archive-*, openspec/* branches).
PRS=$(gh pr list --state merged --limit 30 --json number,title,headRefName --template '{{range .}}{{.number}}	{{.title}}	{{.headRefName}}{{"\n"}}{{end}}')

if [[ -z "$PRS" ]]; then
  echo "auto-close-merged: keine merged PRs in den letzten 30 für ${BRAND} [T001580]" >&2
  exit 0
fi

# Extract the first [T-NNNNNN] tag from each title, look up the ticket's
# current status, and transition non-terminal ones. The tag pattern is
# `[T-NNNNNN]` (literal `[T` + 6 digits + `]`, e.g. [T123456] or [T001415]).
echo "$PRS" | while IFS=$'\t' read -r pr_num title branch; do
  # Skip if no ticket tag in title
  ticket=$(printf '%s' "$title" | sed -n 's/.*\[\(T[0-9]\{6\}\)\].*/\1/p' | head -1)
  [[ -z "$ticket" ]] && continue

  # T001580 FIX: Skip plan-only PRs. These are implementation plans that shouldn't
  # auto-close tickets. Decided by FILE CONTENT, not branch name (T002598-M1): the
  # old branch heuristic `^chore/(archive|openspec)|^openspec/` wrongly matched
  # EXECUTION branches like chore/openspec-ticket-links-T002573 (#3734) and
  # chore/openspec-stragglers-T002577 (#3737), leaving those tickets open after a
  # green merge. Archive branches (chore/archive-*, openspec/*) never carry
  # implementation, so they stay a fast-path skip.
  if printf '%s\n' "$branch" | grep -qE '^chore/archive-|^openspec/'; then
    echo "auto-close-merged [T001580]: $ticket (PR #$pr_num, branch: $branch) — SKIP (archive/plan branch)" >&2
    continue
  fi
  # T003684: The plan-only check used to run ONLY for chore/openspec-* branches.
  # A plan-only PR on any other branch family (e.g. feature/batch-ticket-ops-meta-T003541)
  # fell through and auto-closed the ticket while its plan was still plan_staged —
  # the factory then never executed it. Verify by file content for EVERY non-archive
  # branch; the api call is cheap and the decision is unambiguous.
  if pr_is_plan_only "$pr_num"; then
    echo "auto-close-merged [T001580]: $ticket (PR #$pr_num, branch: $branch) — SKIP (plan-only PR)" >&2
    continue
  fi

  # Check partial plan completeness guard (T002105):
  # Skip auto-closing multi-partial plans if partial tasks remain unimplemented.
  if ! bash "$(dirname "${BASH_SOURCE[0]}")/merge-hooks.sh" "$ticket" "$HERE/../.."; then
    echo "auto-close-merged [T002105]: $ticket (PR #$pr_num, branch: $branch) — SKIP (incomplete multi-partial plan)" >&2
    continue
  fi

  # Look up the ticket's current status, type, and title. SQL is read-only.
  row=$(cat <<SQL | factory_psql 2>/dev/null
SELECT status, type, title FROM tickets.tickets WHERE external_id = '$ticket' LIMIT 1;
SQL
)
  [[ -z "$row" ]] && { echo "auto-close-merged: $ticket (PR #$pr_num) existiert nicht in ${BRAND} — skip [T001580]" >&2; continue; }
  status=$(printf '%s' "$row" | awk -F'|' '{print $1}' | tr -d ' ')
  ttype=$(printf '%s' "$row" | awk -F'|' '{print $2}' | tr -d ' ')
  title=$(printf '%s' "$row" | awk -F'|' '{print $3}' | tr -d ' ')

  # T002407: Rollup-Container-Recycling statt close. Der Container
  # ("Mishap Rollup — fortlaufende Sammlung") wird nach Merge NICHT
  # auf done gesetzt, sondern auf plan_staged+execution_released=false
  # recycelt, damit er weitere Mishap-Batches sammeln kann.
  if [[ "$title" == "Mishap Rollup — fortlaufende Sammlung" ]]; then
    echo "auto-close-merged: $ticket (PR #$pr_num) ist Rollup-Container — recycling statt done" >&2
    cat <<SQL | factory_psql >/dev/null 2>&1 || true
UPDATE tickets.tickets
   SET status = 'plan_staged',
       readiness = COALESCE(readiness,'{}'::jsonb) || '{"execution_released":false}'::jsonb
 WHERE external_id = '$ticket';
SQL
    BRAND="$BRAND" bash "$(dirname "${BASH_SOURCE[0]}")/../ticket.sh" add-comment \
      --id "$ticket" \
      --body "Rollup-Container recycelt nach Merge von PR #${pr_num} (status=plan_staged, execution_released=false)" \
      --author "auto-close-merged" \
      --visibility "internal" >/dev/null 2>&1 || true
    continue
  fi

  case "$status" in
    done|archived) echo "auto-close-merged: $ticket (PR #$pr_num) bereits $status — skip [T001580]" >&2; continue ;;
  esac

  resolution="shipped"
  # Dual-Vokabular [T002329]: 'bug' bleibt gueltig, bis Teil D (T002331) es aus dem
  # CHECK entfernt. Muss deckungsgleich mit cockpit-labels.ts bleiben, sonst weichen
  # Cockpit-Anzeige und automatischer Merge-Abschluss voneinander ab.
  [[ "$ttype" == "bug" || "$ttype" == "fix" ]] && resolution="fixed"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "auto-close-merged [DRY-RUN]: würde $ticket (PR #$pr_num, ${BRAND}) → done/$resolution"
    continue
  fi

  echo "auto-close-merged: $ticket (PR #$pr_num, ${BRAND}) $status → done/$resolution [T001580]" >&2
  # Single-line transition so the audit grep `ticket.sh update-status --status done` matches verbatim.
  BRAND="$BRAND" bash "$(dirname "${BASH_SOURCE[0]}")/../ticket.sh" update-status --id "$ticket" --status done --resolution "$resolution" || \
    echo "auto-close-merged: $ticket update-status fehlgeschlagen — continue [T001580]" >&2
done

echo "auto-close-merged: fertig (BRAND=${BRAND}, DRY_RUN=${DRY_RUN}) [T001580]"
