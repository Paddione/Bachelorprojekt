#!/usr/bin/env bash
# scripts/systemtest-analyze.sh — Phase 2 of the systemtest drift pipeline.
# Collects walk outcomes, features DB state, seed req_ids, and CLAUDE.md
# staleness signals; renders a drift report to docs/drift-reports/.
#
# Usage: bash scripts/systemtest-analyze.sh [env]
#        env defaults to mentolder
#
# Prerequisites:
#   - tests/e2e/results/outcomes/systemtest-*-<env>.json must exist
#   - kubectl context for <env> must be reachable
#   - jq, python3 must be on PATH
set -euo pipefail

ENV="${1:-mentolder}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTCOMES_DIR="$REPO_ROOT/tests/e2e/results/outcomes"
DATE="$(date +%Y-%m-%d)"
REPORT_DIR="$REPO_ROOT/docs/drift-reports"
REPORT_FILE="$REPORT_DIR/${DATE}-systemtest-${ENV}.md"
CONTEXT_FILE="$OUTCOMES_DIR/analysis-context-${ENV}.json"

mkdir -p "$REPORT_DIR" "$OUTCOMES_DIR"

# ── 1. Validate outcome files ──────────────────────────────────────────────
shopt -s nullglob
outcome_files=("$OUTCOMES_DIR"/systemtest-*-"${ENV}".json)
shopt -u nullglob
if [[ ${#outcome_files[@]} -eq 0 ]]; then
  echo "ERROR: No outcome files found for ENV=${ENV} in $OUTCOMES_DIR" >&2
  echo "Run: task systemtest:all ENV=${ENV}" >&2
  exit 1
fi
echo "==> Found ${#outcome_files[@]} outcome file(s) for ENV=${ENV}"

# ── 2. Resolve kubectl context + namespace ─────────────────────────────────
# Source env-resolve.sh to get ENV_CONTEXT + WORKSPACE_NAMESPACE
# shellcheck disable=SC1091
source "$REPO_ROOT/scripts/env-resolve.sh" "$ENV" 2>/dev/null || true
KUBE_CTX="${ENV_CONTEXT:-$ENV}"
NS="${WORKSPACE_NAMESPACE:-workspace}"

# ── 3. Query bachelorprojekt.features ─────────────────────────────────────
echo "==> Querying bachelorprojekt.features via kubectl exec..."
FEATURES_JSON=$(kubectl --context "$KUBE_CTX" exec -n "$NS" deploy/shared-db -- \
  psql -U postgres -d postgres -t -A --csv \
  -c "SET search_path=bachelorprojekt,public; SELECT pr_number,title,description,requirement_id,scope,category,merged_at FROM features ORDER BY merged_at DESC;" \
  2>/dev/null \
  | python3 -c "
import sys, csv, json
rows = []
for row in csv.DictReader(sys.stdin, fieldnames=['pr_number','title','description','requirement_id','scope','category','merged_at']):
    rows.append(row)
print(json.dumps(rows))
" 2>/dev/null || echo "[]")

# ── 4. Extract seed req_ids (Python — no TS runtime needed) ───────────────
echo "==> Extracting req_ids from seed data..."
SEED_REQ_IDS=$(python3 - "$REPO_ROOT/website/src/lib/system-test-seed-data.ts" <<'PYEOF'
import re, json, sys

with open(sys.argv[1]) as f:
    content = f.read()

title_re = re.compile(r"title:\s*'(System-Test (\d+):[^']*)'")
reqids_re = re.compile(r"req_ids:\s*\[([^\]]*)\]")
str_re    = re.compile(r"'([^']+)'")

result = {}
matches = list(title_re.finditer(content))
for idx, m in enumerate(matches):
    num = m.group(2)
    start = m.start()
    end   = matches[idx + 1].start() if idx + 1 < len(matches) else len(content)
    chunk = content[start:end]
    ids   = []
    for rm in reqids_re.finditer(chunk):
        ids.extend(str_re.findall(rm.group(1)))
    result[num] = sorted(set(ids))

print(json.dumps(result))
PYEOF
)

# ── 5. Compute coverage + reality gaps ────────────────────────────────────
FEATURE_REQ_IDS=$(echo "$FEATURES_JSON" | jq -r '[.[].requirement_id | select(. != null and . != "")] | unique | sort | .[]' 2>/dev/null | tr '\n' ',' || echo "")

COVERAGE_GAPS=$(python3 - <<PYEOF
import json

seed   = json.loads('''$SEED_REQ_IDS''')
feat   = set('''$FEATURE_REQ_IDS'''.split(',')) - {''}
gaps   = []
for tmpl_num, ids in sorted(seed.items(), key=lambda x: int(x[0])):
    for rid in ids:
        if rid not in feat:
            gaps.append({'template': tmpl_num, 'req_id': rid})
print(json.dumps(gaps))
PYEOF
)

REALITY_GAPS=$(jq -s '
  map(. as $o | $o.steps[]
    | select(.recorded == "nicht_erfüllt" or .recorded == "teilweise")
    | {
        templateNumber: $o.templateNumber,
        templateTitle:  $o.templateTitle,
        position:       .position,
        recorded:       .recorded,
        reqIds:         .reqIds
      }
  ) | flatten
' "${outcome_files[@]}" 2>/dev/null || echo "[]")

# ── 6. CLAUDE.md staleness scan ───────────────────────────────────────────
STALENESS=$(grep -n \
  "Mattermost\|InvoiceNinja\|mentolder:\*\|korczewski:\*\|korczewski:logs\|korczewski:restart\|korczewski:status\|korczewski:deploy" \
  "$REPO_ROOT/CLAUDE.md" 2>/dev/null | head -20 || echo "")

# ── 7. Build compliance matrix data ───────────────────────────────────────
COMPLIANCE_ROWS=$(jq -rs '
  sort_by(.templateNumber) |
  .[] |
  [
    .templateNumber,
    (.templateTitle | split(": ")[1] // .templateTitle),
    (.steps | length),
    (.steps | map(select(.recorded == "erfüllt"))       | length),
    (.steps | map(select(.recorded == "teilweise"))     | length),
    (.steps | map(select(.recorded == "nicht_erfüllt")) | length),
    ((.complianceScore * 1000 | round) / 10 | tostring + "%")
  ] | @tsv
' "${outcome_files[@]}")

# ── 8. Assemble context bundle ─────────────────────────────────────────────
echo "==> Assembling context bundle..."
# Write large variables to temp files to avoid "Argument list too long"
_TMP_DIR=$(mktemp -d)
echo "$FEATURES_JSON"   > "$_TMP_DIR/features.json"
echo "$SEED_REQ_IDS"    > "$_TMP_DIR/seedReqIds.json"
echo "$COVERAGE_GAPS"   > "$_TMP_DIR/covGaps.json"
echo "$REALITY_GAPS"    > "$_TMP_DIR/realGaps.json"
jq -n \
  --arg     env         "$ENV" \
  --arg     generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --slurpfile features    "$_TMP_DIR/features.json" \
  --slurpfile seedReqIds  "$_TMP_DIR/seedReqIds.json" \
  --slurpfile covGaps     "$_TMP_DIR/covGaps.json" \
  --slurpfile realGaps    "$_TMP_DIR/realGaps.json" \
  --rawfile claudeMd    "$REPO_ROOT/CLAUDE.md" \
  '{
    env:                  $env,
    generatedAt:          $generatedAt,
    features:             $features[0],
    seedReqIds:           $seedReqIds[0],
    coverageGaps:         $covGaps[0],
    realityGaps:          $realGaps[0],
    claudeMd:             $claudeMd
  }' > "$CONTEXT_FILE"
rm -rf "$_TMP_DIR"

# Merge outcome files into context bundle
jq -s '.[0] * {outcomes: .[1:]}' \
  "$CONTEXT_FILE" \
  "${outcome_files[@]}" > "${CONTEXT_FILE}.tmp" && mv "${CONTEXT_FILE}.tmp" "$CONTEXT_FILE"

echo "==> Context bundle written to $CONTEXT_FILE"

# ── 9. Render compliance matrix (markdown) ────────────────────────────────
MATRIX_ROWS=$(jq -rs '
  sort_by(.templateNumber) |
  .[] |
  "| \(.templateNumber) | \(.templateTitle | split(": ")[1] // .templateTitle) | \(.steps | length) | \(.steps | map(select(.recorded == "erfüllt")) | length) | \(.steps | map(select(.recorded == "teilweise")) | length) | \(.steps | map(select(.recorded == "nicht_erfüllt")) | length) | \((.complianceScore * 1000 | round) / 10)% |"
' "${outcome_files[@]}")

TOTAL_STEPS=$(jq -rs '[.[].steps | length] | add' "${outcome_files[@]}")
TOTAL_ERFUELLT=$(jq -rs '[.[].steps[] | select(.recorded == "erfüllt")] | length' "${outcome_files[@]}")
TOTAL_TEILWEISE=$(jq -rs '[.[].steps[] | select(.recorded == "teilweise")] | length' "${outcome_files[@]}")
TOTAL_NICHT=$(jq -rs '[.[].steps[] | select(.recorded == "nicht_erfüllt")] | length' "${outcome_files[@]}")
OVERALL_SCORE=$(jq -rs '
  [.[].complianceScore] | (add / length * 1000 | round) / 10 | tostring + "%"
' "${outcome_files[@]}")

COV_GAP_COUNT=$(echo "$COVERAGE_GAPS" | jq 'length')
STALENESS_COUNT=$(echo "$STALENESS" | grep -c "." 2>/dev/null || echo 0)
TEMPLATES_PRESENT=${#outcome_files[@]}

# ── 10. Write report ─────────────────────────────────────────────────────
cat > "$REPORT_FILE" <<MDEOF
# System-Test Drift Report — ${ENV} — ${DATE}

> Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
> Outcome files: ${TEMPLATES_PRESENT}/12

## Compliance Matrix

| # | Template | Steps | ✅ erfüllt | ⚠️ teilweise | ❌ nicht erfüllt | Score |
|---|----------|------:|----------:|------------:|----------------:|------:|
${MATRIX_ROWS}
| **Σ** | | **${TOTAL_STEPS}** | **${TOTAL_ERFUELLT}** | **${TOTAL_TEILWEISE}** | **${TOTAL_NICHT}** | **${OVERALL_SCORE}** |

## Coverage Gaps (req\_ids → features.requirement\_id)

Steps whose req\_ids have no matching row in \`bachelorprojekt.features\`:

$(echo "$COVERAGE_GAPS" | jq -r '.[] | "- Template \(.template), req_id=\(.req_id)"' || echo "_None found._")

> **Finding #1 (structural):** The seed uses an A/B/C internal numbering scheme
> (e.g. A-01, B-03, C-12); \`bachelorprojekt.features.requirement_id\` uses
> FA/SA/NFA IDs. This mismatch causes automated coverage joins to report 0%.
> Aligning the ID schemes is the highest-priority improvement to the single
> source of truth.

## Reality Gaps (feature "done" vs test outcome)

Features whose requirement\_id appears in the seed but the matching step was
walked as \`nicht_erfüllt\` or \`teilweise\`:

$(echo "$REALITY_GAPS" | jq -r '.[] | "- ST-\(.templateNumber) \(.templateTitle // "unknown") step \(.position): \(.recorded) (req_ids: \(.reqIds | join(", ")))"' 2>/dev/null || echo "_None found._")

## Agent Observations

<!-- AGENT: using scripts/systemtest-analysis-prompt.md — fill in one sentence per template -->

$(for f in "${outcome_files[@]}"; do
  num=$(jq -r '.templateNumber' "$f")
  title=$(jq -r '.templateTitle | split(": ")[1] // .templateTitle' "$f")
  echo "### ST-${num}: ${title}"
  echo "<!-- AGENT: one sentence about bachelorprojekt.features clarity for this domain -->"
  echo ""
done)

## CLAUDE.md Staleness Candidates

$(if [[ -n "$STALENESS" ]]; then
  echo "$STALENESS" | while IFS= read -r line; do echo "- \`$line\`"; done
else
  echo "_No staleness candidates found._"
fi)

## Improvement Plan

<!-- AGENT: synthesise coverage gaps, reality gaps, staleness candidates, and agent observations into an ordered improvement plan -->

## Quantitative Summary

| Metric | Value |
|--------|-------|
| Overall compliance score | ${OVERALL_SCORE} |
| Templates walked | ${TEMPLATES_PRESENT} / 12 |
| req\_ids with no feature row | ${COV_GAP_COUNT} |
| CLAUDE.md staleness candidates | ${STALENESS_COUNT} |
| Steps walked total | ${TOTAL_STEPS} |
MDEOF

echo "==> Report written to $REPORT_FILE"

# ── 11. Optionally fill AGENT sections with claude CLI ────────────────────
if command -v claude &>/dev/null; then
  echo "==> claude CLI detected — filling AGENT sections..."
  _TMP_DIR="$(mktemp -d)"
  FILLED=$(claude --print -p "$(cat "$REPO_ROOT/scripts/systemtest-analysis-prompt.md")" \
    < "$CONTEXT_FILE" 2>/dev/null || echo "")
  if [[ -n "$FILLED" ]]; then
    # Replace the two AGENT blocks with LLM output
    _FILLED_FILE="$_TMP_DIR/filled.txt"
    printf '%s' "$FILLED" > "$_FILLED_FILE"
    python3 - <<PYEOF
import re

with open('$REPORT_FILE') as f:
    report = f.read()

with open('$_FILLED_FILE') as f:
    filled = f.read()

# Replace Agent Observations section placeholder
obs_content = filled.split('## Improvement Plan')[0].replace('## Agent Observations\n\n', '')
report = re.sub(
    r'(## Agent Observations\n\n)<!-- AGENT:.*?-->\n\n.*?(?=\n## )',
    lambda m: m.group(1) + obs_content,
    report, flags=re.DOTALL
)

# Replace Improvement Plan section placeholder
if '## Improvement Plan' in filled:
    plan_content = filled.split('## Improvement Plan')[1].strip()
    report = re.sub(
        r'(## Improvement Plan\n\n)<!-- AGENT:.*?-->',
        lambda m: m.group(1) + plan_content,
        report
    )

with open('$REPORT_FILE', 'w') as f:
    f.write(report)
PYEOF
    echo "==> AGENT sections filled."
  fi
  rm -rf "$_TMP_DIR"
else
  echo "==> claude CLI not found — AGENT sections left as <!-- AGENT --> markers."
  echo "    To fill them: ask Claude Code to read $CONTEXT_FILE and $REPORT_FILE"
fi

echo ""
echo "Done. Report: $REPORT_FILE"
