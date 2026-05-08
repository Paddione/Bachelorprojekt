# System-Test Drift Pipeline — Design Spec

> **Date:** 2026-05-09
> **Status:** Approved for implementation

## Goal

Run all 12 system-test templates end-to-end in a single command, and produce a structured drift report that quantifies compliance, surfaces coverage gaps between `bachelorprojekt.features` and the seed's `req_ids`, flags reality gaps (features DB says "done" but the test can't walk the step), and identifies staleness in CLAUDE.md that misleads agents operating in this repo.

---

## Architecture Overview

Two independent phases, each invocable on its own:

```
Phase 1 — Walk (prod-connected machine)
  task systemtest:all ENV=mentolder
    └─ cycles 1→2→3→4 (sequential)
         └─ 3 parallel Playwright sessions per cycle (existing fanout)
              └─ walkSystemtestByTemplate writes outcome JSON per spec

Phase 2 — Analyse (runs anywhere, including WSL)
  task systemtest:analyze ENV=mentolder
    └─ scripts/systemtest-analyze.sh mentolder
         ├─ collect: outcome JSONs + psql features query + CLAUDE.md
         ├─ build: analysis-context-<env>.json
         └─ render: docs/drift-reports/YYYY-MM-DD-systemtest-<env>.md
```

---

## Section 1 — Fan-out Tasks

### `task systemtest:all`

New Taskfile task. Runs the four cycles sequentially for a given `ENV`, passing `SKIP_DB_PURGE=1` so the global Playwright setup/teardown hook does not require `CRON_SECRET` (systemtest specs create wizard assignments, not FA-test-data rows — the purge hook is not needed for this project).

```yaml
systemtest:all:
  desc: "Run all 12 system-test specs across 4 cycles (ENV=mentolder|korczewski|dev)"
  vars:
    ENV: '{{.ENV | default "mentolder"}}'
  preconditions:
    - sh: '[ -n "${E2E_ADMIN_PASS:-}" ]'
      msg: "E2E_ADMIN_PASS must be set"
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
```

### `task systemtest:all-prods`

Runs `systemtest:all` against mentolder then korczewski. Fail-fast per cluster (sequential, not parallel — avoids shared-db contention across clusters).

### `task systemtest:cycle` — SKIP_DB_PURGE fix

Add `env: SKIP_DB_PURGE: "1"` to the existing `systemtest:cycle` task definition so standalone `task systemtest:cycle CYCLE=2` also bypasses the purge hook without requiring the caller to export the variable.

### Notes

- `systemtest-fanout.sh` is unchanged. Its `if [[ ! -f "$spec" ]]` / `SKIP: not yet implemented` guard is now dead code for all 12 templates but harmless.
- Cycle ordering (1→2→3→4) is fixed. Each cycle's 3 specs run in parallel; cycles themselves are sequential to avoid hammering the DB with 12 concurrent assignments.

---

## Section 2 — Outcome JSON Writer

### What changes

`walkSystemtestByTemplate` in `tests/e2e/lib/systemtest-runner.ts` writes a deterministic outcome file after completing its assertions (success path only — if the walk throws, no file is written; the absence is a signal).

### File path

```
tests/e2e/results/outcomes/systemtest-NN-<env>.json
```

Example: `systemtest-07-mentolder.json`. One file per (template number, env). Overwritten on each run. The directory is created if absent.

### Schema

```ts
interface OutcomeFile {
  templateNumber: number;          // 1–12
  templateTitle: string;           // "System-Test 7: Rechnungserstellung & ZUGFeRD"
  env: string;                     // "mentolder" | "korczewski" | "dev"
  timestamp: string;               // ISO-8601 UTC
  submitted: boolean;
  complianceScore: number;         // (erfüllt + 0.5 × teilweise) / total, range 0–1
  steps: Array<{
    position: number;              // 1-based
    questionText: string;
    recorded: 'erfüllt' | 'teilweise' | 'nicht_erfüllt';
    testRole: 'admin' | 'user' | null;
    reqIds: string[];              // from SYSTEM_TEST_TEMPLATES[n].steps[i].req_ids ?? []
  }>;
}
```

### Implementation detail

`reqIds` is populated from `SYSTEM_TEST_TEMPLATES` — the same array already imported by `walkSystemtestByTemplate`. No second import needed. `env` is derived from `process.env.PROD_DOMAIN` (already set by fanout script per environment).

`complianceScore` formula:

```
score = (erfüllt_count + 0.5 × teilweise_count) / steps.length
```

---

## Section 3 — Analysis Pipeline

### `scripts/systemtest-analyze.sh <env>`

Pure Bash. No LLM dependency in the data-collection phase.

**Steps:**

1. **Validate inputs** — check `tests/e2e/results/outcomes/systemtest-*-<env>.json` exists (at least one file); abort with clear message otherwise.

2. **Port-forward shared-db** — `kubectl port-forward -n ${WORKSPACE_NAMESPACE:-workspace} svc/shared-db 5432:5432 &` with `PF_PID=$!` and `trap "kill $PF_PID 2>/dev/null" EXIT`. Sleep 2s for the tunnel to stabilise.

3. **Query features** — psql query over the port-forward:
   ```sql
   SELECT pr_number, title, description, requirement_id, scope, category, merged_at
   FROM bachelorprojekt.features
   ORDER BY merged_at DESC;
   ```
   Output as JSON via `psql -t -A -F',' ... | jq -R ...` or `psql --csv`.

4. **Read seed req_ids** — extract all `req_ids` arrays from `website/src/lib/system-test-seed-data.ts` using grep/sed (no TS runtime):
   ```bash
   grep -o "req_ids: \[[^]]*\]" website/src/lib/system-test-seed-data.ts
   ```

5. **Read CLAUDE.md** verbatim.

6. **Assemble context bundle** — write `tests/e2e/results/outcomes/analysis-context-<env>.json`:
   ```json
   {
     "env": "mentolder",
     "generatedAt": "...",
     "outcomes": [ ...OutcomeFile[] ],
     "features": [ ...features rows ],
     "seedReqIds": { "7": ["A-01","A-02",...], ... },
     "claudeMd": "..."
   }
   ```

7. **Render report** — if `claude` CLI is on PATH:
   ```bash
   claude --print -p "$(cat scripts/systemtest-analysis-prompt.md)" \
     < tests/e2e/results/outcomes/analysis-context-<env>.json \
     > docs/drift-reports/${DATE}-systemtest-${ENV}.md
   ```
   If `claude` is not on PATH: write the report with all data sections populated (compliance matrix, gaps computed from JSON) and `<!-- AGENT: fill in observation -->` markers for the LLM-authored sections. The user can then ask Claude Code to fill them in interactively.

### `scripts/systemtest-analysis-prompt.md`

A committed prompt file that instructs the LLM to:
- Write one observation sentence per template (does the features DB clearly represent this domain? what's missing or stale?)
- Derive a concrete improvement plan from the coverage gaps, reality gaps, and CLAUDE.md staleness
- Produce valid markdown matching the report template structure

### `task systemtest:analyze`

```yaml
systemtest:analyze:
  desc: "Analyse system-test outcome files and produce drift report (ENV=mentolder|korczewski)"
  vars:
    ENV: '{{.ENV | default "mentolder"}}'
  preconditions:
    - sh: 'ls tests/e2e/results/outcomes/systemtest-*-{{.ENV}}.json 2>/dev/null | grep -q .'
      msg: "No outcome files found for ENV={{.ENV}} — run task systemtest:all first"
  cmds:
    - bash scripts/systemtest-analyze.sh "{{.ENV}}"
```

---

## Report Structure

File: `docs/drift-reports/YYYY-MM-DD-systemtest-<env>.md`

```markdown
# System-Test Drift Report — <ENV> — YYYY-MM-DD

## Compliance Matrix
| # | Template | Steps | ✅ erfüllt | ⚠️ teilweise | ❌ nicht erfüllt | Score |
|---|----------|-------|-----------|------------|----------------|-------|
| 1 | Auth & SSO | 6 | 5 | 1 | 0 | 91.7% |
...
| **Σ** | | 97 | N | N | N | **NN.N%** |

## Coverage Gaps (req_ids → features.requirement_id)
Steps whose req_ids have no matching row in bachelorprojekt.features:
- Template 7, step 8: req_ids=[A-08] — no feature row with requirement_id='A-08'
...
> **Finding #1 (structural):** The seed uses an A/B/C internal numbering scheme;
> bachelorprojekt.features uses FA/SA/NFA IDs. This mismatch means automated
> coverage joins return 0% until the ID schemes are aligned.

## Reality Gaps (features "done" vs test outcome)
Features whose requirement_id appears in the seed but whose matching step was
walked as `nicht_erfüllt` or `teilweise`:
- requirement_id=FA-21 (PR #452, 2026-03-01 "billing system") — ST-07 step 8: teilweise

## Agent Observations (one per template)
### ST-01: Authentifizierung & SSO
<!-- AGENT: one sentence about features DB clarity for this domain -->
...

## CLAUDE.md Staleness Candidates
Keyword matches against removed services / renamed tasks:
- "Mattermost" — mentioned N times; removed from stack (see git history)
- "InvoiceNinja" — mentioned N times; removed
- `mentolder:*` / `korczewski:*` shorthands — noted as removed 2026-05-05 but still
  appear in N places in CLAUDE.md

## Improvement Plan
<!-- AGENT: synthesise coverage gaps + reality gaps + staleness into an ordered plan -->

## Quantitative Summary
| Metric | Value |
|--------|-------|
| Overall compliance score | NN.N% |
| Templates with score < 80% | N |
| req_ids with no feature row | N / M |
| Reality gaps (done but failing) | N |
| CLAUDE.md staleness candidates | N |
| Outcome files present | N / 12 |
```

---

## Quantitative Compliance Formulae

| Metric | Formula |
|--------|---------|
| Per-template score | `(erfüllt + 0.5 × teilweise) / total_steps` |
| Overall score | `mean(per-template scores)` for templates with outcome files |
| Coverage ratio | `req_ids_with_matching_feature / total_req_ids_in_seed` |
| Reality compliance | `steps_erfüllt_for_done_features / done_features_with_seed_steps` |
| CLAUDE.md staleness index | count of keyword matches against removed-service list |

---

## Files Created / Modified

**Modified:**
- `tests/e2e/lib/systemtest-runner.ts` — add outcome writer at end of `walkSystemtestByTemplate`
- `Taskfile.yml` — add `systemtest:all`, `systemtest:all-prods`; patch `systemtest:cycle` with `SKIP_DB_PURGE: "1"`

**Created:**
- `scripts/systemtest-analyze.sh`
- `scripts/systemtest-analysis-prompt.md`
- `docs/drift-reports/` (directory, populated at runtime)

**Runtime output (gitignored — add to `.gitignore`):**
- `tests/e2e/results/outcomes/systemtest-NN-<env>.json` (12 per env)
- `tests/e2e/results/outcomes/analysis-context-<env>.json`

**`.gitignore` — add entries:**
```
tests/e2e/results/outcomes/
```
(The `docs/drift-reports/` markdown files are committed — they are thesis evidence.)

**Committed output:**
- `docs/drift-reports/YYYY-MM-DD-systemtest-<env>.md`

---

## Out of Scope

- Sub-project B (goal-driven probes, project abstraction, admin targeting UI) — deferred
- Automatic re-seeding when coverage gap is detected
- CI gate on compliance score threshold
- Parallelising cycles (would require DB connection pooling analysis first)
