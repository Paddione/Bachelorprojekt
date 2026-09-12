---
title: Consolidate SSOT specs, remove FreeToken and prune stale assets
ticket_id: T900163
domains: [sdlc, ops]
status: plan_staged
---

# Consolidate SSOT specs, remove FreeToken and prune stale assets — Implementation Plan

## File Structure
- `.opencode/agent-models.jsonc` (mod: remove FreeToken providers & re-route agents)
- `AGENTS.md` (mod: update agent routing table to active models)
- `.opencode/plugin/freetoken-active.ts` (delete: obsolete plugin)
- `scripts/task-oracle.sh` (delete: deprecated wrapper)
- `scripts/t.sh` (delete: deprecated wrapper)
- `scripts/lmstudio-preload.sh` (delete: obsolete script)
- `scripts/lm-studio/lmstudio-bge-autoload.service` (delete: obsolete service)
- `scripts/lm-studio/lmstudio-bge-autoload.sh` (delete: obsolete script)
- `scripts/lm-studio/lmstudio-bge-autoload.timer` (delete: obsolete timer)
- `taskfiles/Taskfile.devcluster.yml` (delete: decommissioned taskfile)
- `taskfiles/Taskfile.dev-stack.yml` (mod: remove deprecated targets)
- `Taskfile.yml` (mod: remove direct workspace:deploy push deprecation lines)
- `interview/please-figure-out-where-global-user-project-open-9583c5a6-5884-4581-8654-bf4923870b5a.md` (delete: untracked note)
- `openspec/specs/mishap-tracking.md` (mod: consolidate mishap micro-specs)
- `openspec/specs/software-factory.md` (mod: consolidate factory micro-specs)
- `openspec/specs/ci-cd.md` (mod: consolidate CI micro-specs)
- `openspec/specs/fleet-operations.md` (mod: consolidate infra micro-specs)
- `tests/spec/agent-skills.bats` (mod: verify agent routing & model setup)

## Tasks

### Partial 1: Remove FreeToken Model & Agent Routing Configs (`p1-freetoken-removal`)
- [ ] Remove `freetoken-*` model definitions and providers from `.opencode/agent-models.jsonc`.
- [ ] Update `AGENTS.md` agent routing table to target `qwen38-primary`, `qwen-cloud`, or `deepseek-*`.
- [ ] Delete `.opencode/plugin/freetoken-active.ts`.

### Partial 2: Prune Deprecated Shell & LM-Studio Scripts (`p2-stale-script-cleanup`)
- [ ] Delete deprecated wrappers `scripts/task-oracle.sh` and `scripts/t.sh`.
- [ ] Delete retired LM Studio script `scripts/lmstudio-preload.sh` and directory `scripts/lm-studio/` containing `lmstudio-bge-autoload.sh`, `lmstudio-bge-autoload.service`, and `lmstudio-bge-autoload.timer`.

### Partial 3: Prune Decommissioned Taskfile Targets & Draft Files (`p3-taskfile-cleanup`)
- [ ] Remove `taskfiles/Taskfile.devcluster.yml`.
- [ ] Clean up deprecated `cluster:create` references in `taskfiles/Taskfile.dev-stack.yml` and `Taskfile.yml`.
- [ ] Delete untracked `interview/please-figure-out-where-global-user-project-open-9583c5a6-5884-4581-8654-bf4923870b5a.md`.

### Partial 4: Consolidate Single-Ticket Micro-Specs (`p4-micro-spec-consolidation`)
- [ ] Merge micro-specs (`mishap-t*.md`) into `openspec/specs/mishap-tracking.md`.
- [ ] Merge factory micro-specs into `openspec/specs/software-factory.md`.
- [ ] Merge CI/Infra micro-specs into `openspec/specs/ci-cd.md` and `openspec/specs/fleet-operations.md`.
- [ ] Delete original micro-spec files in `openspec/specs/`.

### Partial 5: Verification & Tests (`p5-tests-verification`)
- [ ] Run failing test step: `tests/spec/agent-skills.bats` (expected: FAIL until routing updated).
- [ ] Run `task test:changed` to verify all test suites pass.
- [ ] Run `task freshness:regenerate` and `task freshness:check` to confirm manifest freshness.
