---
title: "Mishap-Bundle: skills/references, scripts/brain, scripts/vda.sh"
ticket_id: T001583
domains: [ops, skills]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001583-mishap-skills — Implementation Plan

## File Structure

- `.claude/skills/**` — investigate only (mishap 1), no change expected
- `scripts/brain/ingest-sources.yaml` — extend excludes (mishap 2)
- `tests/spec/brain-initial-ingest.bats` — add regression coverage (mishap 2)
- `scripts/vda/oracle-task-vars.sh` — new: ENV/BRAND var resolution helper (mishap 3)
- `scripts/vda/oracle.sh` — wire in the helper, replace hardcoded `ENV=` (mishap 3)
- `tests/unit/oracle-task-vars.bats` — new: regression coverage (mishap 3)

## Tasks

### Task 1: Verify mishap 1 (ticket.sh comment drift)

Grep all active `.claude/skills/**` for `ticket.sh comment` / non-`add-comment`
usage. If found, fix to `add-comment`. If not found (as verified during this
run), document as already-resolved — no code change.

**Steps:**
- `grep -rn "ticket\.sh comment\b" .claude/skills/`
- Expected: no active-skill hits (docs/superpowers/{plans,specs}/ historical
  archives don't count — they're not live snippets)

### Task 2: Tighten scripts/brain/ingest-sources.yaml excludes

Add excludes for `node_modules/`, `.git/`, `.astro/`, `.taskmaster/`, `.agy/`,
`.antigravitycli/`, `.design-sync/`, `dist/`, `build/`, `coverage/`,
`tests/unit/lib/`, `.venv/`, `__pycache__/`, `.claude/commands/`.

**Steps:**
- Red: add `tests/spec/brain-initial-ingest.bats` assertions for the new
  excludes (manifest content + a nested `node_modules` fixture case)
- Green: update `scripts/brain/ingest-sources.yaml`
- Verify: `bash scripts/brain-ingest-worklist.sh | wc -l` drops significantly

### Task 3: Fix oracle.sh BRAND-var materialization

Extract `task_required_var` / `materialize_task_env_arg` into
`scripts/vda/oracle-task-vars.sh`, source it from `scripts/vda/oracle.sh`,
and replace the description-substring `ENV=` guess with an actual
Taskfile.yml `requires: vars:` lookup — both for the single-env case and the
`__BOTH__` (mentolder+korczewski sequential) case.

**Steps:**
- Red: `tests/unit/oracle-task-vars.bats` against a fixture Taskfile
- Green: implement the helper + wire into `oracle.sh` (phase-3 LLM path,
  `emit_dry_run`, and the `__BOTH__` execution branch)
- Verify against the real Taskfile.yml: `fleet:deploy:brand` + `mentolder`
  token materializes `BRAND=fleet-mentolder`

### Task 4: Verify

- `task test:changed`
- `task freshness:regenerate`
- `task freshness:check`
