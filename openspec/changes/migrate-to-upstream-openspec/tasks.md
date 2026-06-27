---
title: "OpenSpec improvements batch: backfill + /opsx:* commands + polish [T001267]"
ticket_id: T001267
domains: [openspec, ci, docs, tooling]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: openspec-improvements-batch (T001267)

- [ ] Task 0: Write failing tests in `tests/spec/openspec-workflow.bats`; run `bats tests/spec/openspec-workflow.bats` to verify it fails before any changes (expected: FAIL on all three guards)
- [ ] Task 1 (T001261-a): Investigate each of the 11 stub specs — backfill from archive or delete
- [ ] Task 2 (T001261-b): Backfill confirmed stubs from `openspec/changes/archive/<date>-<slug>/tasks.md`; delete phantom spec+change pairs
- [ ] Task 3 (T001261-c): Bulk-add `## Purpose` + `## Requirements` H2 headers to all 60 SSOT specs via awk pass; manual review of every changed spec
- [ ] Task 4 (T001261-d): Update `scripts/openspec-validate.ts` to enforce `## Purpose` and `## Requirements`; run `task test:openspec` — expected: PASS
- [ ] Task 5 (T001261-e): Open PR `chore(openspec): backfill 11 SSOT stubs + add Purpose/Requirements headers [T001261]`; merge after CI green
- [ ] Task 6 (T001263-a): Run `openspec init --tools opencode,claude --profile core --force`; verify 4 `.opencode/commands/opsx-*.md` + 4 `.claude/skills/openspec-*/SKILL.md` created
- [ ] Task 7 (T001263-b): Update `.claude/skills/dev-flow-plan/SKILL.md` — replace `task openspec:propose` with `/opsx:propose`
- [ ] Task 8 (T001263-c): Update `.claude/skills/dev-flow-execute/SKILL.md` — replace `task openspec:apply` with `/opsx:apply`
- [ ] Task 9 (T001263-d): Open PR `feat(openspec): install upstream workflow commands in .opencode + .claude [T001263]`; merge after CI green
- [ ] Task 10 (T001265-a): Add `specs:` and `design:` keys to `openspec/config.yaml` under `rules:`
- [ ] Task 11 (T001265-b): Add `OPENSPEC_TELEMETRY: '0'` to workflow-level `env:` in every `.github/workflows/*.yml`
- [ ] Task 12 (T001265-c): Add "OpenSpec conventions" + "Dev experience" subsections to `AGENTS.md`
- [ ] Task 13 (T001265-d): Open PR `chore(openspec): polish — frontmatter convention, rules, telemetry opt-out, completions [T001265]`; merge after CI green
- [ ] Task 14 (Verify): `task test:changed` + `task freshness:regenerate` + `task freshness:check` + `task test:openspec` — all green; `task openspec:validate` — no errors

---

# OpenSpec Improvements Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Three independent improvements to the OpenSpec workflow, executed sequentially and shipped as three separate PRs.
Sub-tickets: T001261 (backfill SSOT stubs + add Purpose/Requirements headers), T001263 (install /opsx:* commands), T001265 (polish: config.yaml rules, CI telemetry opt-out, AGENTS.md docs).
T001264 is already shipped (commit cdc8d61f). T001262 + T001266 are parked per user instruction 2026-06-27.

**Architecture:** All changes are content + config — no runtime code paths affected.
Batch executes sequentially: T001261 PR → merge → T001263 PR → merge → T001265 PR → merge.
Between PRs: pull main to keep the worktree current.

## File Structure

### New files
- `tests/spec/openspec-workflow.bats` — BATS guards for all three acceptance criteria
- `.opencode/commands/opsx-propose.md` — upstream propose workflow command
- `.opencode/commands/opsx-explore.md` — upstream explore workflow command
- `.opencode/commands/opsx-apply.md` — upstream apply workflow command
- `.opencode/commands/opsx-archive.md` — upstream archive workflow command
- `.claude/skills/openspec-propose/SKILL.md` — claude skill for propose
- `.claude/skills/openspec-explore/SKILL.md` — claude skill for explore
- `.claude/skills/openspec-apply/SKILL.md` — claude skill for apply
- `.claude/skills/openspec-archive/SKILL.md` — claude skill for archive

### Modified files
- `openspec/specs/*.md` — 60 files: add `## Purpose` + `## Requirements` H2 headers; 11 stubs replaced or deleted
- `scripts/openspec-validate.ts` (77 → ~120 lines; S1-budget vs. limit 600 = budget 523)
- `.claude/skills/dev-flow-plan/SKILL.md` — reference `/opsx:propose` instead of `task openspec:propose`
- `.claude/skills/dev-flow-execute/SKILL.md` — reference `/opsx:apply` instead of `task openspec:apply`
- `openspec/config.yaml` — add `specs:` and `design:` keys under `rules:` (ungated .yaml)
- `.github/workflows/*.yml` — 21 files, add `OPENSPEC_TELEMETRY: '0'` workflow-level env (ungated .yml)
- `AGENTS.md` — 2 new subsections: "OpenSpec conventions" + "Dev experience" (ungated .md)

## Task 0 — Failing tests (RED phase)

Write `tests/spec/openspec-workflow.bats` with three guards before making any other changes. Run `bats tests/spec/openspec-workflow.bats` to verify it fails before changes (expected: FAIL on all three guards):

```bash
#!/usr/bin/env bats
# tests/spec/openspec-workflow.bats
# SSOT: openspec/specs/openspec-workflow.md

REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"

@test "T001261: all SSOT specs declare a ## Purpose header" {
  local missing=0
  for f in "$REPO"/openspec/specs/*.md; do
    grep -q '^## Purpose' "$f" || { echo "MISSING: $f"; missing=1; }
  done
  [ "$missing" -eq 0 ]
}

@test "T001263: opsx-propose command is installed for opencode" {
  [ -f "$REPO/.opencode/commands/opsx-propose.md" ]
}

@test "T001265: CI workflows opt out of OpenSpec telemetry" {
  local missing=0
  for f in "$REPO"/.github/workflows/*.yml; do
    grep -q 'OPENSPEC_TELEMETRY' "$f" || { echo "MISSING: $f"; missing=1; }
  done
  [ "$missing" -eq 0 ]
}
```

Run: `bats tests/spec/openspec-workflow.bats` — expected: FAIL on all three guards before any changes.
Commit the test file alone so the CI baseline shows red.

## Task 1 — T001261-a: Stub investigation

For each of the 11 stub specs listed in `design.md`, determine the action:

| Spec | Archive match | Action |
|------|---------------|--------|
| `active-sessions-hub.md` | `archive/2026-06-21-active-sessions-hub` | backfill |
| `cockpit-direct-ticket-links.md` | `archive/2026-06-21-cockpit-direct-ticket-links` | backfill |
| `openspec-pgvector.md` | `archive/2026-06-21-openspec-pgvector` | backfill |
| `t1224-lockfile-drift.md` | `archive/2026-06-27-t1224-lockfile-drift` | backfill |
| `ci-speed.md` | none | investigate → decide |
| `fix-coaching-studio-prod-manifest.md` | none | investigate → decide |
| `korczewski-monolith-keycloak-auth.md` | none | investigate → decide |
| `openspec-ticket-detail-view.md` | none | investigate → decide |
| `secrets-deploy-automation.md` | none | investigate → decide |
| `sidekick-ai-quality.md` | none | investigate → decide |
| `sidekick-cleanup-grilling-broadcast.md` | none | investigate → decide |

For the "investigate → decide" group: if no archived change and no git history for the spec, delete. If git log shows real work ever happened, backfill from commits.

## Task 2 — T001261-b: Backfill or delete stubs

For each **backfill** target: read `openspec/changes/archive/<date>-<slug>/tasks.md` plus any delta spec. Rewrite the SSOT spec with real Requirements/Scenarios. Cite source as HTML comment (`<!-- from archive/... line N -->`).

For each **delete** target: remove `openspec/specs/<name>.md` and its associated `openspec/changes/archive/<date>-<slug>/` folder if one exists. Do NOT touch other archived changes.

Commit: `chore(openspec): stub audit — backfill N + delete M [T001261]`.

## Task 3 — T001261-c: Bulk header injection

Run an awk pass over all 60 specs in `openspec/specs/`. Each spec gets `## Purpose` before the first paragraph after the H1 title, and `## Requirements` before the first `### Requirement:` line.

```bash
# Dry-run first to review diffs:
bash scripts/openspec-header-inject.sh --dry-run openspec/specs/
# Then apply:
bash scripts/openspec-header-inject.sh openspec/specs/
```

Write `scripts/openspec-header-inject.sh` as a one-shot helper (awk-based). After application:
- `git diff --stat openspec/specs/` — should show exactly the 60 spec files modified, no others
- Manual review: scan each diff for broken formatting before commit

Commit: `chore(openspec): add Purpose + Requirements H2 to all 60 SSOT specs [T001261]`.

## Task 4 — T001261-d: Validator enforcement

Update `scripts/openspec-validate.ts` to assert that every `openspec/specs/*.md` file contains `^## Purpose` and `^## Requirements` lines. Add a new check after the existing stub detection:

```typescript
// New validator assertions (add after existing checks):
if (!content.includes('\n## Purpose\n')) {
  errors.push(`${specFile}: missing ## Purpose header`);
}
if (!content.includes('\n## Requirements\n')) {
  errors.push(`${specFile}: missing ## Requirements header`);
}
```

Run `task test:openspec` — expected: PASS (all specs were updated in Task 3).

## Task 5 — T001261-e: Open PR

```bash
git push origin chore/openspec-improvements-batch
gh pr create \
  --title "chore(openspec): backfill 11 SSOT stubs + add Purpose/Requirements headers [T001261]" \
  --body "$(cat openspec/changes/migrate-to-upstream-openspec/design.md | head -44)" \
  --base main
```

Wait for CI green. Merge: `gh pr merge --squash --auto <pr-number>`. Pull main into worktree before proceeding to T001263.

## Task 6 — T001263-a: Install upstream commands

Install the upstream CLI on the host (one-time, not committed):
```bash
npm i -g @fission-ai/openspec@1.3.1
```

Run init in the repo root (committed):
```bash
openspec init --tools opencode,claude --profile core --force
```

Verify outputs:
- `ls .opencode/commands/opsx-*.md` — 4 files
- `ls .claude/skills/openspec-*/SKILL.md` — 4 files
- `openspec config list` — shows `profile: core`

Commit: `feat(openspec): install upstream /opsx:* workflow commands [T001263]`.

## Task 7 — T001263-b: Update dev-flow-plan skill

In `.claude/skills/dev-flow-plan/SKILL.md`, replace every reference to `task openspec:propose -- <slug>` or `bash scripts/openspec.sh propose` with `/opsx:propose <slug>`. Keep the existing `bash scripts/openspec.sh` fallback note in a code comment.

## Task 8 — T001263-c: Update dev-flow-execute skill

In `.claude/skills/dev-flow-execute/SKILL.md`, replace every reference to `task openspec:apply` with `/opsx:apply`. Keep `task openspec:apply` as fallback note.

Commit both skill updates with Task 6 in one commit: `feat(openspec): update dev-flow skills to use /opsx:* commands [T001263]`.

## Task 9 — T001263-d: Open PR

```bash
gh pr create \
  --title "feat(openspec): install upstream workflow commands in .opencode + .claude [T001263]" \
  --base main
```

Wait for CI green. Merge. Pull main into worktree before proceeding to T001265.

## Task 10 — T001265-a: Expand config.yaml rules

Add two new rule categories to `openspec/config.yaml` under the existing `rules:` key:

```yaml
  specs:
    - Purpose auf Deutsch, Requirements auf Englisch, Scenarios auf Englisch (GIVEN/WHEN/THEN)
  design:
    - Goals/Non-Goals explizit trennen
    - Decisions mit Begründung und ggf. Trade-offs
```

## Task 11 — T001265-b: CI telemetry opt-out

For every `.github/workflows/*.yml` that does not already have `OPENSPEC_TELEMETRY`:

```bash
# Check which files are missing it:
grep -rL 'OPENSPEC_TELEMETRY' .github/workflows/*.yml
```

For each missing file, add at the top-level `env:` block (or create one):
```yaml
env:
  OPENSPEC_TELEMETRY: '0'
```

## Task 12 — T001265-c: Update AGENTS.md

Add two subsections to `AGENTS.md`. Insert after the existing "Development workflow" section:

```markdown
### OpenSpec conventions

Proposal and task files may include YAML frontmatter (parsed by `scripts/openspec-embed.mjs`).
Language: Purpose sections in German; Requirements and Scenarios in English (GIVEN/WHEN/THEN).
Rule source: `openspec/config.yaml` (keys: `proposal`, `tasks`, `specs`, `design`).

### Dev experience

After installing the OpenSpec CLI (`npm i -g @fission-ai/openspec@1.3.1`),
run `openspec completion install` once to enable shell completions (bash/zsh/fish/powershell).
```

Commit: `chore(openspec): polish — config rules, telemetry opt-out, AGENTS.md [T001265]`.

## Task 13 — T001265-d: Open PR

```bash
gh pr create \
  --title "chore(openspec): polish — frontmatter convention, rules, telemetry opt-out, completions [T001265]" \
  --base main
```

Wait for CI green. Merge.

## Task 14 — Verify

After all three PRs are merged and main is pulled:

```bash
task test:changed
task freshness:regenerate
task freshness:check
task test:openspec
bash scripts/openspec.sh validate
```

All commands must exit 0. Update `openspec/changes/migrate-to-upstream-openspec/.ticket` status to `done` via `bash scripts/ticket.sh update-status --id T001267 --status done`.

Also update each sub-ticket:
```bash
bash scripts/ticket.sh update-status --id T001261 --status done
bash scripts/ticket.sh update-status --id T001263 --status done
bash scripts/ticket.sh update-status --id T001265 --status done
```
