---
title: G-DB09 slow-query measurement — exclude CREATE INDEX DDL
ticket_id: T002095
domains: [db, health-goals]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# db-slow-query — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the G-DB09 health-goal regression by excluding one-time `CREATE INDEX` DDL statements from the `pg_stat_statements`-based slow-query measurement, so a legitimate maintenance operation (the `chunks_embedding_hnsw` vector index build) stops being counted as an application slow query.

**Architecture:** Live investigation (`SELECT query, calls, mean_exec_time, total_exec_time, rows FROM pg_stat_statements WHERE mean_exec_time > 1000 AND query NOT ILIKE 'COPY %'` against `workspace`/`fleet`) found exactly one row: `CREATE INDEX chunks_embedding_hnsw ON knowledge.chunks USING hnsw (embedding public.vector_cosine_ops)`, `calls=1`, `mean_exec_time=13123.135566ms`. This is a one-time DDL build, not a repeated application query — `EXPLAIN ANALYZE` does not apply to DDL. The fix mirrors the precedent from T001926 (which excluded `COPY %` backup statements from this same measurement): add a second, narrowly-scoped `NOT ILIKE 'CREATE INDEX%'` exclusion to the G-DB09 `db_scalar` query in `scripts/health-goals-check.sh`, document it in `.claude/lib/goals.md`, and regenerate the derived website goal-dashboard artifact.

**Tech Stack:** Bash (`scripts/health-goals-check.sh`), Markdown (`.claude/lib/goals.md`), Node (`scripts/gen-goals-data.mjs` regeneration), BATS (`tests/spec/health-goals.bats`).

## File Structure

- `scripts/health-goals-check.sh` — modified: G-DB09 `db_scalar` query gains a second exclusion clause (`NOT ILIKE 'CREATE INDEX%'`) alongside the existing `NOT ILIKE 'COPY %'`.
- `tests/spec/health-goals.bats` — modified: new regression test asserting the `CREATE INDEX%` exclusion is present in the script (RED before Task 2, GREEN after).
- `.claude/lib/goals.md` — modified: G-DB09 section documents the new DDL exclusion and its root cause.
- `website/src/lib/goals-data.generated.json` — regenerated (derived artifact, not hand-edited) via `node scripts/gen-goals-data.mjs` to reflect the updated goal-doc text.

## Global Constraints

- Measurement query change only — no schema/index/migration changes (confirmed: the flagged statement is a legitimate one-time DDL build, not a missing-index symptom).
- Exclusion must be narrowly scoped to `CREATE INDEX%` (not a broad DDL blocklist) per `openspec/changes/db-slow-query/design.md` — avoids masking future genuinely slow DDL-adjacent statements.
- `scripts/health-goals-check.sh` (`.sh`, S1 limit 500 lines): current 471 lines, not baselined → effective budget = 500 − 471 = **29 lines**. This change only appends ~26 characters to one existing line plus edits the description string on the same line — net line delta 0, well within budget.
- `.claude/lib/goals.md` and `website/src/lib/goals-data.generated.json` are `.md`/`.json` — not covered by the S1 extension table (`.ts .js .jsx .py .svelte .sh .mjs .mts .astro .tsx .java .php .bash .cjs`), no budget constraint applies.
- `tests/spec/health-goals.bats` is `.bats` — likewise not in the S1 extension table.

---

### Task 1: Verify the pre-existing RED test for the CREATE INDEX exclusion

**Files:**
- Test: `tests/spec/health-goals.bats` (already contains the new test, added during brainstorming/root-cause investigation — this task just confirms it's red before the fix lands)

**Interfaces:**
- Consumes: `scripts/health-goals-check.sh` (reads its G-DB09 `db_scalar` query string via `grep`).
- Produces: nothing new — this task is a checkpoint, not a code change.

- [ ] **Step 1: Confirm the failing test exists and is red**

The test file already contains this test (added ahead of the plan while investigating T002095):

```bash
g_db09_query() {
  grep -oE "db_scalar \"SELECT count\(\*\) FROM pg_stat_statements WHERE mean_exec_time > 1000[^\"]*\"" "$SCRIPT" | head -1
}

@test "G-DB09: measurement query excludes CREATE INDEX DDL statements (T002095)" {
  query=$(g_db09_query)
  [ -n "$query" ]
  [[ "$query" == *"NOT ILIKE 'CREATE INDEX%'"* ]]
}
```

Run:
```bash
bats tests/spec/health-goals.bats
```
Expected: FAIL — specifically `not ok ... G-DB09: measurement query excludes CREATE INDEX DDL statements (T002095)` with output `` `[[ "$query" == *"NOT ILIKE 'CREATE INDEX%'"* ]]' failed ``. All other tests in the file (including the sibling `G-DB09: measurement query excludes COPY backup statements (T001926, regression guard)` test) must remain green — confirming the harness itself is sound and only the new exclusion is missing.

- [ ] **Step 2: Commit checkpoint (if the test file isn't already staged)**

```bash
git status --porcelain tests/spec/health-goals.bats
```
If it shows as untracked/modified (i.e. not yet committed from the investigation phase), stage and note it — it will be committed together with Task 2's fix in one commit per the fix-path convention (RED test + fix stay logically paired, but this repo's `chore(plans):` stage-commit convention only applies to the plan-stage commit itself, not to `dev-flow-execute`'s implementation commits — implementation commits use `fix(db):`).

### Task 2: Add the CREATE INDEX exclusion to the G-DB09 measurement query

**Files:**
- Modify: `scripts/health-goals-check.sh:413`
- Test: `tests/spec/health-goals.bats` (already written in Task 1 — this task turns it green)

**Interfaces:**
- Consumes: none (pure string edit to an existing `db_scalar` call argument).
- Produces: the corrected G-DB09 SQL string, which Task 3's doc update and Task 4's regeneration both reference verbatim.

- [ ] **Step 1: Edit the G-DB09 line in `scripts/health-goals-check.sh`**

Current line 413:
```bash
row target G-DB09 "$(db_scalar "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000 AND query NOT ILIKE 'COPY %'")" le 0 "Slow Queries in pg_stat_statements (mean_exec_time > 1s, exkl. Backup-COPY T001926)"
```

New line 413:
```bash
row target G-DB09 "$(db_scalar "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000 AND query NOT ILIKE 'COPY %' AND query NOT ILIKE 'CREATE INDEX%'")" le 0 "Slow Queries in pg_stat_statements (mean_exec_time > 1s, exkl. Backup-COPY T001926 + einmalige CREATE INDEX-DDL T002095)"
```

- [ ] **Step 2: Run the test to verify it now passes**

```bash
bats tests/spec/health-goals.bats
```
Expected: PASS — all 12 tests in the file green, including
`G-DB09: measurement query excludes CREATE INDEX DDL statements (T002095)`.

- [ ] **Step 3: Commit**

```bash
git add scripts/health-goals-check.sh tests/spec/health-goals.bats
git commit -m "fix(db): exclude CREATE INDEX DDL from G-DB09 slow-query measurement [T002095]"
```

### Task 3: Document the exclusion in the goal doc

**Files:**
- Modify: `.claude/lib/goals.md` (G-DB09 section, currently reads: "**Was:** Zählt Abfragen in `pg_stat_statements` mit `mean_exec_time > 1s`. T001926 hatte Backup-COPY aus dem Mess-Scope ausgeschlossen — seitdem ist eine weitere Slow Query aufgetaucht.")

**Interfaces:**
- Consumes: the corrected SQL string from Task 2 (must match exactly, so the doc doesn't drift from the script).
- Produces: updated goal-doc prose that Task 4's `gen-goals-data.mjs` parses into the generated JSON.

- [ ] **Step 1: Update the G-DB09 "Was" paragraph**

Find this block in `.claude/lib/goals.md`:
```markdown
## G-DB09 — Slow Queries in pg_stat_statements (COPY-bereinigt): 1 → 0

**Was:** Zählt Abfragen in `pg_stat_statements` mit `mean_exec_time > 1s`. T001926 hatte
Backup-COPY aus dem Mess-Scope ausgeschlossen — seitdem ist eine weitere Slow Query
aufgetaucht.
```

Replace with:
```markdown
## G-DB09 — Slow Queries in pg_stat_statements (COPY+DDL-bereinigt): 1 → 0

**Was:** Zählt Abfragen in `pg_stat_statements` mit `mean_exec_time > 1s`. T001926 hatte
Backup-COPY aus dem Mess-Scope ausgeschlossen. T002095 (2026-07-23) fand die seitdem
aufgetauchte neue Slow Query: eine einmalige `CREATE INDEX chunks_embedding_hnsw ON
knowledge.chunks USING hnsw (...)`-DDL (calls=1, mean_exec_time=13123ms) — ein legitimer
Vektorindex-Build, keine wiederholte Applikations-Query. Fix: `NOT ILIKE 'CREATE INDEX%'`
zusätzlich zu `NOT ILIKE 'COPY %'` im Mess-Query ausgeschlossen (bewusst eng auf
`CREATE INDEX` begrenzt statt breiter DDL-Blockliste, siehe
`openspec/changes/db-slow-query/design.md`).
```

- [ ] **Step 2: Verify the doc references the exact corrected SQL clause**

```bash
grep -n "NOT ILIKE 'CREATE INDEX%'" .claude/lib/goals.md scripts/health-goals-check.sh
```
Expected: both files show a match (doc mentions the literal clause in prose; script has the executable clause from Task 2).

- [ ] **Step 3: Commit**

```bash
git add .claude/lib/goals.md
git commit -m "docs(goals): document G-DB09 CREATE INDEX DDL exclusion [T002095]"
```

### Task 4: Regenerate the derived goals-data artifact

**Files:**
- Modify (generated): `website/src/lib/goals-data.generated.json`

**Interfaces:**
- Consumes: `.claude/lib/goals.md` (Task 3's updated prose) via `scripts/gen-goals-data.mjs`.
- Produces: the regenerated JSON consumed by the website's goal dashboard (no other task depends on this beyond the freshness check).

- [ ] **Step 1: Regenerate**

```bash
node scripts/gen-goals-data.mjs
```
Expected: exits 0, rewrites `website/src/lib/goals-data.generated.json` with the updated G-DB09 title/description text from Task 3.

- [ ] **Step 2: Confirm the diff is limited to the G-DB09 entry**

```bash
git diff website/src/lib/goals-data.generated.json | grep -c '^[+-]'
git diff website/src/lib/goals-data.generated.json | grep -i "G-DB09"
```
Expected: the diff touches only the G-DB09 object's title/description fields (a small, bounded diff — not a full-file rewrite), and the grep for `G-DB09` shows the new "CREATE INDEX" wording.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/goals-data.generated.json
git commit -m "chore(goals): regenerate goals-data.generated.json for G-DB09 [T002095]"
```

### Task 5: Final verification (mandatory CI-equivalent gates)

**Files:** none (verification only)

**Interfaces:**
- Consumes: all changes from Tasks 1–4.
- Produces: nothing — this is the terminal gate before PR.

- [ ] **Step 1: Run targeted tests for changed domains**

```bash
task test:changed
```
Expected: exits 0 — includes the `tests/spec/health-goals.bats` BATS suite (all green, per Task 2 Step 2) and any vitest suites touched by the `db`/`health-goals` domains.

- [ ] **Step 2: Regenerate freshness artifacts**

```bash
task freshness:regenerate
```
Expected: exits 0 — re-derives `test-inventory.json`/`repo-index` and any other generated artifacts; commit any resulting diff (`git add` + `git commit -m "chore: regenerate freshness artifacts [skip ci]"` if the working tree is dirty afterward).

- [ ] **Step 3: Run the freshness check gate**

```bash
task freshness:check
```
Expected: exits 0 — confirms no generated-artifact drift and the S1–S4 quality ratchet stays green (per the Global Constraints budget analysis: `scripts/health-goals-check.sh` net line delta is 0, well inside its 29-line budget; no new baseline entries introduced).

- [ ] **Step 4: Manual live-DB verification (documented limitation — not a CI-runnable test)**

This goal measures live PostgreSQL state (`pg_stat_statements` on the `shared-db` instance),
which cannot be reproduced as a repo-local fixture or asserted in CI (no local Postgres
instance carries the exact `pg_stat_statements` history that triggered this regression, and
synthesizing one would test the fixture, not reality). The BATS test added in Task 1/2 is a
**static regression guard** on the query string itself (prevents the exclusion clause from
being silently reverted) — it is not a substitute for confirming the live measurement value.
As the actual acceptance check, run the measurement command itself against the live cluster
post-merge:

```bash
PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context fleet -c postgres -- \
  psql -U website -d website -tAc \
  "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000 AND query NOT ILIKE 'COPY %' AND query NOT ILIKE 'CREATE INDEX%'"
```
Expected: `0` (matches the G-DB09 target `le 0`). Record this in the PR description as the
manual verification evidence, since it cannot run inside CI.
