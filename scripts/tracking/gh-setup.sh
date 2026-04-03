#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# gh-setup.sh — Create GitHub Issues + Labels for all requirements
# ═══════════════════════════════════════════════════════════════════
# Usage: ./scripts/tracking/gh-setup.sh [--dry-run]
#
# Creates:
#   - Labels for categories (Funktionale Anforderung, Sicherheitsanforderung, etc.) and pipeline stages
#   - One issue per requirement with structured body
#   - Milestone for the project
#
# Prerequisites: gh CLI authenticated (gh auth status)
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
OVERVIEW="${PROJECT_DIR}/../docs/requirements/overview.md"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Prerequisites ────────────────────────────────────────────────
if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI required. Install: https://cli.github.com" >&2
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "Error: Not authenticated. Run: gh auth login" >&2
  exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null)
if [[ -z "$REPO" ]]; then
  echo "Error: Not in a GitHub repository" >&2
  exit 1
fi

echo "Repository: ${REPO}"
echo "Dry run: ${DRY_RUN}"
echo ""

# ── Helper ───────────────────────────────────────────────────────
run_gh() {
  if $DRY_RUN; then
    echo "  [dry-run] gh $*"
  else
    gh "$@"
  fi
}

# ── Create labels ────────────────────────────────────────────────
echo "Creating labels..."

declare -A CATEGORY_COLORS=(
  ["Funktionale Anforderung"]="0075ca"           # blue — functional
  ["Sicherheitsanforderung"]="d73a4a"            # red — security
  ["Nicht-Funktionale Anforderung"]="e4e669"     # yellow — non-functional
  ["Abnahmekriterium"]="a2eeef"                   # cyan — acceptance
  ["Auslieferbares Objekt"]="7057ff"             # purple — deliverables
)

declare -A STAGE_COLORS=(
  ["stage:idea"]="f9d0c4"
  ["stage:implementation"]="fbca04"
  ["stage:testing"]="0e8a16"
  ["stage:documentation"]="1d76db"
  ["stage:archive"]="5319e7"
)

declare -A STATUS_COLORS=(
  ["status:pass"]="0e8a16"
  ["status:fail"]="d73a4a"
  ["status:pending"]="cccccc"
  ["automated"]="bfdadc"
  ["manual"]="fef2c0"
)

for label in "${!CATEGORY_COLORS[@]}"; do
  run_gh label create "$label" --color "${CATEGORY_COLORS[$label]}" \
    --description "Category: ${label}" --force 2>/dev/null || true
done

for label in "${!STAGE_COLORS[@]}"; do
  run_gh label create "$label" --color "${STAGE_COLORS[$label]}" --force 2>/dev/null || true
done

for label in "${!STATUS_COLORS[@]}"; do
  run_gh label create "$label" --color "${STATUS_COLORS[$label]}" --force 2>/dev/null || true
done

echo "  Labels created."

# ── Create milestone ─────────────────────────────────────────────
echo "Creating milestone..."
run_gh api repos/"${REPO}"/milestones \
  --method POST \
  -f title="Bachelorprojekt MVP" \
  -f description="All requirements for the Workspace MVP" \
  -f state="open" 2>/dev/null || echo "  Milestone may already exist"

MILESTONE_NUMBER=$(gh api repos/"${REPO}"/milestones --jq '.[0].number' 2>/dev/null || echo "")

# ── Create issues ────────────────────────────────────────────────
echo ""
echo "Creating issues for requirements..."

create_issue() {
  local id="$1" name="$2" desc="$3" criteria="$4" tests="$5" category="$6" automated="$7"

  # Check if issue already exists (search by title)
  local existing
  existing=$(gh issue list --search "\"[${id}]\" in:title" --json number --jq '.[0].number' 2>/dev/null || echo "")
  if [[ -n "$existing" ]]; then
    echo "  ${id}: already exists (#${existing}), skipping"
    return
  fi

  local test_label="manual"
  [[ "$automated" == "1" ]] && test_label="automated"

  local body
  body=$(cat <<EOF
## ${name}

${desc}

### Erfüllungskriterien (Acceptance Criteria)

${criteria}

### Testfälle (Test Cases)

${tests}

---

**Category:** ${category} | **Test type:** ${test_label}
**Pipeline:** idea → implementation → testing → documentation → archive
EOF
)

  if $DRY_RUN; then
    echo "  [dry-run] Would create: [${id}] ${name} (${category}, ${test_label})"
  else
    gh issue create \
      --title "[${id}] ${name}" \
      --body "$body" \
      --label "${category}" \
      --label "stage:idea" \
      --label "${test_label}" \
      --milestone "Bachelorprojekt MVP" 2>&1 || echo "  ${id}: FAILED"
    echo "  ${id}: created"
  fi
}

# Process all requirements from the canonical Markdown overview.
# Section headers determine the category; rows are parsed by awk.
process_requirements_from_md() {
  local file="$1"
  local current_category=""

  while IFS=$'\t' read -r category id name desc criteria tests; do
    [[ -n "$id" ]] || continue
    if [[ "$category" != "$current_category" ]]; then
      current_category="$category"
      echo ""
      echo "── ${current_category} ──"
    fi
    local automated=0
    [[ -f "${PROJECT_DIR}/tests/local/${id}.sh" ]] && automated=1 || true
    create_issue "$id" "$name" "$desc" "$criteria" "$tests" "$category" "$automated"
  done < <(awk -F' \\| ' '
    /^## Functional/      { cat = "Funktionale Anforderung" }
    /^## Security/        { cat = "Sicherheitsanforderung" }
    /^## Non-Functional/  { cat = "Nicht-Funktionale Anforderung" }
    /^## Acceptance/      { cat = "Abnahmekriterium" }
    /^## Deliverables/    { cat = "Auslieferbares Objekt" }
    /^\| [A-Z]+-[0-9]+/ {
      id       = $1; sub(/^\| /, "", id)
      name     = $2
      desc     = $3
      criteria = $4
      tests    = $5; sub(/ \|.*$/, "", tests)
      print cat "\t" id "\t" name "\t" desc "\t" criteria "\t" tests
    }
  ' "$file")
}

process_requirements_from_md "$OVERVIEW"

echo ""
echo "Done! View your issues:"
echo "  gh issue list --milestone 'Bachelorprojekt MVP'"
echo ""
echo "To create a GitHub Project board:"
echo "  gh project create --title 'Workspace MVP Pipeline' --owner '$(echo "$REPO" | cut -d/ -f1)'"
echo "  Then add issues to the project and set up columns: Idea | Implementation | Testing | Documentation | Archive"
