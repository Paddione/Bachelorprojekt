# Proposal: Consolidate SSOT specs, remove FreeToken and prune stale assets

**Ticket:** `T900163`  
**Status:** `planning`  

## Intent
Clean up technical debt and drift from Single Source of Truth (SSOT):
1. **Remove FreeToken**: Prune all `freetoken-*` model & agent definitions from `.opencode/agent-models.jsonc`, `AGENTS.md`, and plugins. Re-route agents to `llamacpp-local/qwen38-220k` and cloud rails.
2. **Prune Stale Assets**: Delete deprecated wrappers (`scripts/task-oracle.sh`, `scripts/t.sh`), retired LM Studio preloader (`scripts/lmstudio-preload.sh`, `scripts/lm-studio/`), decommissioned taskfiles (`taskfiles/Taskfile.devcluster.yml`), direct `workspace:deploy` lines in `Taskfile.yml`, and untracked `interview/` notes.
3. **Consolidate Micro-Specs**: Consolidate ~21 single-ticket micro-specs into their parent SSOT specs in `openspec/specs/` (`mishap-tracking.md`, `software-factory.md`, `ci-cd.md`, `fleet-operations.md`).

## Requirements
- All subagent roles must resolve to active models without referencing `freetoken`.
- `task test:changed`, `task freshness:check`, and `task workspace:validate` must pass cleanly.
- `openspec/specs/` must maintain proper frontmatter and valid syntax across consolidated specs.
