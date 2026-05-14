---
title: System-Test Drift Pipeline — Implementation Plan
domains: [test, infra]
status: active
pr_number: null
---

# System-Test Drift Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `task systemtest:all`, an outcome JSON writer in `walkSystemtestByTemplate`, and a `scripts/systemtest-analyze.sh` script that collects walk results + features DB state and renders a drift/compliance report.

**Architecture:** Phase 1 (walk) produces deterministic `tests/e2e/results/outcomes/systemtest-NN-<env>.json` files via a new writer in the runner. Phase 2 (analyze) is a standalone Bash script that queries the DB with `kubectl exec`, extracts seed req_ids with Python, assembles a context bundle with `jq`, and renders a markdown report — with LLM `<!-- AGENT -->` markers for the agent-observation and improvement-plan sections.

**Tech Stack:** TypeScript/CommonJS (Playwright), Bash, jq, Python 3, kubectl exec (no port-forward), `claude` CLI optional.

**Reference spec:** `docs/superpowers/specs/2026-05-09-systemtest-drift-pipeline-design.md`

---

## File Structure

**Modified:**
- `tests/e2e/lib/systemtest-runner.ts` — add `OutcomeFile` type, `computeComplianceScore`, `buildOutcomeFile`, `writeOutcomeFile`; call `writeOutcomeFile` at end of `walkSystemtestByTemplate`
- `tests/e2e/lib/systemtest-runner.test.ts` — extend unit tests with `computeComplianceScore` and `buildOutcomeFile` cases
- `Taskfile.yml` — add `env: SKIP_DB_PURGE: "1"` to `systemtest:cycle`; add `systemtest:all`, `systemtest:all-prods`, `systemtest:analyze`
- `.gitignore` — add `tests/e2e/results/outcomes/`

**Created:**
- `scripts/systemtest-analysis-prompt.md` — LLM prompt for agent-observation sentences and improvement plan
- `scripts/systemtest-analyze.sh` — data collection + report rendering
- `docs/drift-reports/.gitkeep` — ensures directory is committed (reports added at runtime)

---

## Task 1 — Outcome JSON writer in systemtest-runner.ts (TDD)

**Files:**
- Modify: `tests/e2e/lib/systemtest-runner.ts`
- Modify: `tests/e2e/lib/systemtest-runner.test.ts`

- [ ] **Step 1: Add the new unit tests (failing)**

Open `tests/e2e/lib/systemtest-runner.test.ts`. Append this block after the existing three `deriveOptionsFromSeed` tests:

```ts
import {
  computeComplianceScore,
  buildOutcomeFile,
} from './systemtest-runner';

test.describe('computeComplianceScore', () => {
  test('all erfüllt → 1.0', () => {
    const steps = [
      { position: 1, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'erfüllt' as const, notes: '' },
      { position: 2, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'erfüllt' as const, notes: '' },
    ];
    expect(computeComplianceScore(steps)).toBeCloseTo(1.0);
  });

  test('all teilweise → 0.5', () => {
    const steps = [
      { position: 1, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'teilweise' as const, notes: '' },
      { position: 2, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'teilweise' as const, notes: '' },
    ];
    expect(computeComplianceScore(steps)).toBeCloseTo(0.5);
  });

  test('mixed: 1 erfüllt + 1 teilweise + 1 nicht_erfüllt → (1 + 0.5) / 3', () => {
    const steps = [
      { position: 1, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'erfüllt'       as const, notes: '' },
      { position: 2, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'teilweise'     as const, notes: '' },
      { position: 3, questionText: '', testRole: null, testFunctionUrl: null, recorded: 'nicht_erfüllt' as const, notes: '' },
    ];
    expect(computeComplianceScore(steps)).toBeCloseTo(0.5);
  });

  test('empty steps → 0', () => {
    expect(computeComplianceScore([])).toBe(0);
  });
});

test.describe('buildOutcomeFile', () => {
  test('maps recorded options and req_ids from template', () => {
    const template = {
      title: 'System-Test 99: Synthetic',
      description: '',
      instructions: '',
      steps: [
        { question_text: 'q1', expected_result: '', test_function_url: '/', test_role: 'admin' as const, req_ids: ['X-01'] },
        { question_text: 'q2', expected_result: '', test_function_url: '/', test_role: 'admin' as const },
      ],
    };
    const result = {
      templateId: 'id-99',
      templateTitle: 'System-Test 99: Synthetic',
      assignmentId: 'a-1',
      submitted: true,
      steps: [
        { position: 1, questionText: 'q1', testRole: 'admin' as const, testFunctionUrl: '/', recorded: 'erfüllt' as const,  notes: '' },
        { position: 2, questionText: 'q2', testRole: 'admin' as const, testFunctionUrl: '/', recorded: 'teilweise' as const, notes: '' },
      ],
    };
    const outcome = buildOutcomeFile(result, 99, template, 'dev');
    expect(outcome.templateNumber).toBe(99);
    expect(outcome.env).toBe('dev');
    expect(outcome.submitted).toBe(true);
    expect(outcome.complianceScore).toBeCloseTo(0.75);        // (1 + 0.5) / 2
    expect(outcome.steps[0].reqIds).toEqual(['X-01']);
    expect(outcome.steps[1].reqIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
SKIP_DB_PURGE=1 npx playwright test --project=unit
```

Expected: fails — `computeComplianceScore is not a function` (or similar TS compile error).

- [ ] **Step 3: Implement the new exports in systemtest-runner.ts**

Open `tests/e2e/lib/systemtest-runner.ts`. Add these lines at the very top, after the existing `import` block (after line 25):

```ts
import * as fs from 'fs';
import * as path from 'path';
```

Then add this block immediately ABOVE the line `export async function walkSystemtestByTemplate(` (i.e. before the orchestrator):

```ts
// ── Outcome JSON ──────────────────────────────────────────────────────────

export interface OutcomeStep {
  position: number;
  questionText: string;
  recorded: TestOption;
  testRole: 'admin' | 'user' | null;
  reqIds: string[];
}

export interface OutcomeFile {
  templateNumber: number;
  templateTitle: string;
  env: string;
  timestamp: string;
  submitted: boolean;
  complianceScore: number;
  steps: OutcomeStep[];
}

export function computeComplianceScore(steps: StepOutcome[]): number {
  if (steps.length === 0) return 0;
  const erfüllt   = steps.filter(s => s.recorded === 'erfüllt').length;
  const teilweise = steps.filter(s => s.recorded === 'teilweise').length;
  return (erfüllt + 0.5 * teilweise) / steps.length;
}

export function buildOutcomeFile(
  result: WalkResult,
  n: number,
  template: Pick<SystemTestTemplate, 'title' | 'steps'>,
  env: string,
): OutcomeFile {
  return {
    templateNumber: n,
    templateTitle: result.templateTitle,
    env,
    timestamp: new Date().toISOString(),
    submitted: result.submitted,
    complianceScore: computeComplianceScore(result.steps),
    steps: result.steps.map(s => ({
      position: s.position,
      questionText: s.questionText,
      recorded: s.recorded,
      testRole: s.testRole,
      reqIds: template.steps[s.position - 1]?.req_ids ?? [],
    })),
  };
}

function writeOutcomeFile(outcome: OutcomeFile): void {
  const dir = path.resolve(__dirname, '../results/outcomes');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `systemtest-${String(outcome.templateNumber).padStart(2, '0')}-${outcome.env}.json`;
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(outcome, null, 2));
}

function deriveEnv(): string {
  const d = process.env.PROD_DOMAIN ?? '';
  if (d.includes('mentolder'))  return 'mentolder';
  if (d.includes('korczewski')) return 'korczewski';
  return 'dev';
}
```

- [ ] **Step 4: Call writeOutcomeFile at end of walkSystemtestByTemplate**

In `walkSystemtestByTemplate`, immediately BEFORE the `return result;` line at the very end, add:

```ts
  writeOutcomeFile(buildOutcomeFile(result, n, template, deriveEnv()));
```

- [ ] **Step 5: Run the unit tests — expect all to pass**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e
SKIP_DB_PURGE=1 npx playwright test --project=unit
```

Expected: `7 passed` (3 original + 4 new).

- [ ] **Step 6: TypeScript compile check**

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add tests/e2e/lib/systemtest-runner.ts tests/e2e/lib/systemtest-runner.test.ts
git commit -m "$(cat <<'EOF'
feat(systemtest): outcome JSON writer in walkSystemtestByTemplate

Adds OutcomeFile type, computeComplianceScore, buildOutcomeFile (pure,
unit-tested), and writeOutcomeFile to systemtest-runner.ts. Called at the
end of every successful walkSystemtestByTemplate — writes
tests/e2e/results/outcomes/systemtest-NN-<env>.json for analysis.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Taskfile fan-out tasks + .gitignore

**Files:**
- Modify: `Taskfile.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Patch `systemtest:cycle` with SKIP_DB_PURGE**

Find the `systemtest:cycle:` task in `Taskfile.yml` (around line 318). Add `env:` block between `preconditions:` and `cmds:` so it reads:

```yaml
  systemtest:cycle:
    desc: "Fan out 3 parallel Playwright sessions, one per System-Test (CYCLE=1..4, ENV=mentolder|korczewski|dev)"
    vars:
      CYCLE: '{{.CYCLE | default "2"}}'
      ENV:   '{{.ENV   | default "mentolder"}}'
    preconditions:
      - sh: '[ -n "${E2E_ADMIN_PASS:-}" ]'
        msg: "systemtest:cycle requires E2E_ADMIN_PASS in the env"
    env:
      SKIP_DB_PURGE: "1"
    cmds:
      - bash scripts/systemtest-fanout.sh "{{.CYCLE}}" "{{.ENV}}"
```

- [ ] **Step 2: Add `systemtest:all` and `systemtest:all-prods` tasks**

Insert these two tasks immediately AFTER the closing of `systemtest:cycle:` (after line 327):

```yaml
  systemtest:all:
    desc: "Run all 12 system-test specs across 4 cycles (ENV=mentolder|korczewski|dev)"
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    preconditions:
      - sh: '[ -n "${E2E_ADMIN_PASS:-}" ]'
        msg: "systemtest:all requires E2E_ADMIN_PASS in the env"
    env:
      SKIP_DB_PURGE: "1"
    cmds:
      - task: systemtest:cycle
        vars: { CYCLE: "1", ENV: "{{.ENV}}" }
      - task: systemtest:cycle
        vars: { CYCLE: "2", ENV: "{{.ENV}}" }
      - task: systemtest:cycle
        vars: { CYCLE: "3", ENV: "{{.ENV}}" }
      - task: systemtest:cycle
        vars: { CYCLE: "4", ENV: "{{.ENV}}" }

  systemtest:all-prods:
    desc: "Run all 12 system-test specs against mentolder then korczewski"
    preconditions:
      - sh: '[ -n "${E2E_ADMIN_PASS:-}" ]'
        msg: "systemtest:all-prods requires E2E_ADMIN_PASS in the env"
    env:
      SKIP_DB_PURGE: "1"
    cmds:
      - task: systemtest:all
        vars: { ENV: "mentolder" }
      - task: systemtest:all
        vars: { ENV: "korczewski" }

  systemtest:analyze:
    desc: "Analyse system-test outcome files and produce drift report (ENV=mentolder|korczewski)"
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    preconditions:
      - sh: 'ls tests/e2e/results/outcomes/systemtest-*-{{.ENV}}.json 2>/dev/null | grep -q .'
        msg: "No outcome files for ENV={{.ENV}} — run: task systemtest:all ENV={{.ENV}} first"
    cmds:
      - bash scripts/systemtest-analyze.sh "{{.ENV}}"
```

- [ ] **Step 3: Add .gitignore entry**

Open `.gitignore`. After the existing `test-results/` line (line 88), add:

```
tests/e2e/results/outcomes/
```

- [ ] **Step 4: Dry-run the new tasks**

```bash
cd /home/patrick/Bachelorprojekt
task --list 2>&1 | grep systemtest
```

Expected: `systemtest:all`, `systemtest:all-prods`, `systemtest:analyze`, `systemtest:cycle` all appear.

- [ ] **Step 5: Validate Taskfile syntax**

```bash
task workspace:validate 2>&1 | tail -5
```

Expected: no Taskfile parse errors (kustomize errors about missing cluster are fine).

- [ ] **Step 6: Commit**

```bash
git add Taskfile.yml .gitignore
git commit -m "$(cat <<'EOF'
feat(systemtest): systemtest:all + systemtest:analyze Taskfile tasks

systemtest:all runs cycles 1-4 sequentially (SKIP_DB_PURGE=1 inherited).
systemtest:all-prods fans out to mentolder then korczewski.
systemtest:analyze runs the drift analysis script.
systemtest:cycle patched with SKIP_DB_PURGE so standalone cycle calls
also bypass the global DB purge hook.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Analysis prompt + script

**Files:**
- Create: `scripts/systemtest-analysis-prompt.md`
- Create: `scripts/systemtest-analyze.sh`
- Create: `docs/drift-reports/.gitkeep`

- [ ] **Step 1: Create `scripts/systemtest-analysis-prompt.md`**

```markdown
# System-Test Drift Analysis Prompt

You are a software-quality agent for the Bachelorprojekt platform. You have been given a JSON context bundle containing:

- `outcomes`: array of walk results for system-test templates (up to 12)
- `features`: rows from `bachelorprojekt.features` (the single source of truth for what has been built)
- `seedReqIds`: map of template number → flat array of req_ids found in that template's seed steps
- `coverageGaps`: req_ids appearing in the seed but absent from features.requirement_id
- `realityGaps`: features rows whose requirement_id appears in the seed but whose matching step was walked as `nicht_erfüllt` or `teilweise`
- `stalenessCandidates`: CLAUDE.md lines mentioning removed services or renamed commands
- `complianceMatrix`: per-template compliance scores

Your task: produce a section of a markdown drift report. Output ONLY the following two sections, in valid markdown, with no preamble:

## Agent Observations

For each template in `outcomes` (ordered by templateNumber), write exactly ONE sentence that answers: "Does the `bachelorprojekt.features` table clearly represent the work done for this domain, and is there anything an agent working in this area should be aware of?" Be specific — cite req_ids, PR titles, or gap counts. If the template has no outcome file (walk not yet run), note that.

Format each observation as:
### ST-NN: <title suffix>
<one sentence>

## Improvement Plan

Synthesise the coverage gaps, reality gaps, staleness candidates, and agent observations into a concrete, ordered list of improvements to `bachelorprojekt.features` and CLAUDE.md. Each item should be actionable (name the file, field, or row to change). Lead with the structural req_id mismatch if it is present. Aim for 5-10 items.
```

- [ ] **Step 2: Create `scripts/systemtest-analyze.sh`**

Create the file with executable permissions (`chmod +x` in the script or set mode in the commit). Full content:

```bash
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
SEED_REQ_IDS=$(python3 - <<'PYEOF'
import re, json, sys

with open('website/src/lib/system-test-seed-data.ts') as f:
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
  map(.steps[] | select(.recorded == "nicht_erfüllt" or .recorded == "teilweise") | {
    template: .position,
    templateTitle: (input_filename | gsub(".*/systemtest-(?<n>[0-9]+)-.*"; "ST-\(.n)")),
    recorded: .recorded,
    reqIds: .reqIds
  })
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
jq -n \
  --arg  env            "$ENV" \
  --arg  generatedAt    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson features    "$FEATURES_JSON" \
  --argjson seedReqIds  "$SEED_REQ_IDS" \
  --argjson covGaps     "$COVERAGE_GAPS" \
  --argjson realGaps    "$REALITY_GAPS" \
  --rawfile claudeMd    "$REPO_ROOT/CLAUDE.md" \
  '{
    env:                  $env,
    generatedAt:          $generatedAt,
    features:             $features,
    seedReqIds:           $seedReqIds,
    coverageGaps:         $covGaps,
    realityGaps:          $realGaps,
    claudeMd:             $claudeMd
  }' > "$CONTEXT_FILE"

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
TOTAL_ERFÜLLT=$(jq -rs '[.[].steps[] | select(.recorded == "erfüllt")] | length' "${outcome_files[@]}")
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
| **Σ** | | **${TOTAL_STEPS}** | **${TOTAL_ERFÜLLT}** | **${TOTAL_TEILWEISE}** | **${TOTAL_NICHT}** | **${OVERALL_SCORE}** |

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

$(echo "$REALITY_GAPS" | jq -r '.[] | "- \(.templateTitle // "unknown") step \(.template): \(.recorded) (req_ids: \(.reqIds | join(", ")))"' 2>/dev/null || echo "_None found._")

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
  FILLED=$(claude --print -p "$(cat "$REPO_ROOT/scripts/systemtest-analysis-prompt.md")" \
    < "$CONTEXT_FILE" 2>/dev/null || echo "")
  if [[ -n "$FILLED" ]]; then
    # Replace the two AGENT blocks with LLM output
    python3 - <<PYEOF
import re

with open('$REPORT_FILE') as f:
    report = f.read()

filled = """$FILLED"""

# Replace Agent Observations section placeholder
report = re.sub(
    r'(## Agent Observations\n\n)<!-- AGENT:.*?-->\n\n.*?(?=\n## )',
    r'\1' + filled.split('## Improvement Plan')[0].replace('## Agent Observations\n\n', ''),
    report, flags=re.DOTALL
)

# Replace Improvement Plan section placeholder
if '## Improvement Plan' in filled:
    plan_content = filled.split('## Improvement Plan')[1].strip()
    report = re.sub(
        r'(## Improvement Plan\n\n)<!-- AGENT:.*?-->',
        r'\1' + plan_content,
        report
    )

with open('$REPORT_FILE', 'w') as f:
    f.write(report)
PYEOF
    echo "==> AGENT sections filled."
  fi
else
  echo "==> claude CLI not found — AGENT sections left as <!-- AGENT --> markers."
  echo "    To fill them: ask Claude Code to read $CONTEXT_FILE and $REPORT_FILE"
fi

echo ""
echo "Done. Report: $REPORT_FILE"
```

- [ ] **Step 3: Make the script executable**

```bash
chmod +x /home/patrick/Bachelorprojekt/scripts/systemtest-analyze.sh
```

- [ ] **Step 4: Create `docs/drift-reports/.gitkeep`**

```bash
mkdir -p /home/patrick/Bachelorprojekt/docs/drift-reports
touch /home/patrick/Bachelorprojekt/docs/drift-reports/.gitkeep
```

- [ ] **Step 5: Smoke-test the precondition check**

```bash
cd /home/patrick/Bachelorprojekt
task systemtest:analyze ENV=mentolder 2>&1
```

Expected output (no outcome files exist yet): task precondition error — `No outcome files for ENV=mentolder — run: task systemtest:all ENV=mentolder first`.

- [ ] **Step 6: Smoke-test the script's own validation**

```bash
bash scripts/systemtest-analyze.sh mentolder 2>&1 | head -5
```

Expected: `ERROR: No outcome files found for ENV=mentolder in …/outcomes`

- [ ] **Step 7: Create a synthetic outcome file and verify the report renders**

```bash
mkdir -p tests/e2e/results/outcomes
cat > tests/e2e/results/outcomes/systemtest-09-mentolder.json <<'EOF'
{
  "templateNumber": 9,
  "templateTitle": "System-Test 9: Monitoring & Bug-Tracking",
  "env": "mentolder",
  "timestamp": "2026-05-09T00:00:00Z",
  "submitted": true,
  "complianceScore": 1.0,
  "steps": [
    { "position": 1, "questionText": "q1", "recorded": "erfüllt", "testRole": "admin", "reqIds": [] },
    { "position": 2, "questionText": "q2", "recorded": "erfüllt", "testRole": "admin", "reqIds": [] },
    { "position": 3, "questionText": "q3", "recorded": "erfüllt", "testRole": "admin", "reqIds": [] },
    { "position": 4, "questionText": "q4", "recorded": "erfüllt", "testRole": "admin", "reqIds": [] },
    { "position": 5, "questionText": "q5", "recorded": "erfüllt", "testRole": "admin", "reqIds": [] }
  ]
}
EOF
```

Then run (kubectl will fail since we're in WSL without cluster access, but the script should produce a partial report):

```bash
bash scripts/systemtest-analyze.sh mentolder 2>&1
```

Expected: script runs past validation, kubectl exec fails gracefully (features = `[]`), report file is created at `docs/drift-reports/<date>-systemtest-mentolder.md`. Check it exists:

```bash
ls -la docs/drift-reports/
```

Then delete the synthetic file:

```bash
rm tests/e2e/results/outcomes/systemtest-09-mentolder.json
```

- [ ] **Step 8: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add scripts/systemtest-analysis-prompt.md scripts/systemtest-analyze.sh docs/drift-reports/.gitkeep
git commit -m "$(cat <<'EOF'
feat(systemtest): systemtest-analyze.sh drift report pipeline

Collects walk outcomes + bachelorprojekt.features (kubectl exec,
no port-forward) + seed req_ids (Python regex) + CLAUDE.md staleness
scan. Renders compliance matrix, coverage/reality gaps, and AGENT
placeholder sections (optionally filled by claude CLI) to
docs/drift-reports/YYYY-MM-DD-systemtest-<env>.md.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — PR

- [ ] **Step 1: Push and open PR**

```bash
cd /home/patrick/Bachelorprojekt
git push
gh pr create \
  --title "feat(systemtest): drift pipeline — fan-all-12 + outcome JSON + analyze script" \
  --body "$(cat <<'EOF'
## Summary
- `task systemtest:all ENV=<env>` fans out all 4 cycles (12 specs) sequentially with `SKIP_DB_PURGE=1`.
- `walkSystemtestByTemplate` writes `tests/e2e/results/outcomes/systemtest-NN-<env>.json` after each walk (compliance score, step outcomes, req_ids per step).
- `scripts/systemtest-analyze.sh` collects outcomes + `bachelorprojekt.features` (kubectl exec) + seed req_ids (Python) + CLAUDE.md staleness scan → renders `docs/drift-reports/YYYY-MM-DD-systemtest-<env>.md`.
- `task systemtest:analyze ENV=<env>` wraps the script with a precondition guard.
- Identifies **Finding #1**: A/B/C req_id scheme in seed vs FA/SA/NFA in features — zero coverage joins until aligned.

Spec: `docs/superpowers/specs/2026-05-09-systemtest-drift-pipeline-design.md`

## Test plan
- [x] `SKIP_DB_PURGE=1 npx playwright test --project=unit` — 7 tests pass (3 original + 4 new)
- [x] `npx tsc --noEmit` — no errors
- [x] `task systemtest:analyze ENV=mentolder` with no outcome files → precondition error
- [x] Synthetic outcome file → report renders correctly
- [ ] Live: `task systemtest:all ENV=mentolder` on prod-connected machine → 12 outcome files written
- [ ] Live: `task systemtest:analyze ENV=mentolder` → compliance report committed to `docs/drift-reports/`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Merge**

```bash
gh pr merge --squash --delete-branch
```

---

## Self-Review Notes

- **Spec coverage:** All three spec sections are implemented: fan-out tasks (Task 2), outcome JSON writer (Task 1), analysis pipeline (Task 3). Finding #1 (A/B/C mismatch) is explicitly surfaced in the report. CLAUDE.md staleness scan covers the mentioned removed services (Mattermost, InvoiceNinja, old korczewski:* shorthands).
- **Type consistency:** `OutcomeFile`, `OutcomeStep`, `computeComplianceScore`, `buildOutcomeFile` defined in Task 1 and used in Task 1 tests — no cross-task type drift.
- **No placeholders:** All Bash, TypeScript, and Python code blocks are complete and runnable.
- **TDD:** Unit tests written before implementation in Task 1; precondition smoke tests in Task 3 verify the script's error paths before live use.
- **Gitignore:** `tests/e2e/results/outcomes/` added in Task 2; `docs/drift-reports/` is committed (thesis evidence) with `.gitkeep` so the directory exists before the first run.
- **kubectl exec pattern:** Matches `workspace:psql` task — `kubectl --context $CTX exec -n $NS deploy/shared-db -- psql -U postgres -d postgres`. ENV_CONTEXT sourced from `env-resolve.sh`.
- **Outcome files deleted in smoke test:** Synthetic file created in Task 3 Step 7 is removed before commit so it doesn't land in the repo.
