---
description: Execute an OpenSpec plan through the dev-flow-execute lifecycle
---

# /dev-flow-exe — Plan Execution & PR Flow

Execute the staged OpenSpec plan following the repository's SDLC execution lifecycle ([dev-flow-execute](.opencode/skills/dev-flow-execute/SKILL.md)).

**Input**: Optionally specify a change slug or ticket ID (e.g. `/dev-flow-exe backup-mail-routing` or `/dev-flow-exe T900041`). If omitted, infer from current branch/worktree, or pick the highest-priority active staged plan.

## Execution Steps

1. **Identify Target Plan & Context**
   - If argument provided: locate `openspec/changes/<slug>/`
   - If on a feature/fix branch: resolve slug matching the branch
   - Otherwise, list active plans with `status: plan_staged` or `status: planning`:
     ```bash
     node --input-type=module -e "import { listLocalActivePlans } from './scripts/openspec-embed.mjs'; console.log(listLocalActivePlans('.'));"
     ```
   - Read the plan files: `proposal.md`, `tasks.md`, and any files in `specs/`.

2. **Worktree & Branch Setup (Mandatory Worktree Isolation)**
   - **NEVER** implement directly on `main`.
   - Check current branch and worktree:
     ```bash
     git branch --show-current
     git rev-parse --show-toplevel
     ```
   - If on `main`, switch to or create an isolated worktree under `.worktrees/<slug>`:
     ```bash
     bash scripts/worktree-create.sh "<slug>"
     ```
   - All subsequent git commands must target the worktree (`git -C <worktree>`).

3. **Claim Branch Lock**
   - Claim session lock for the branch:
     ```bash
     bash scripts/agent-lock.sh claim branch "$(git -C <worktree> branch --show-current)"
     ```

4. **Task Implementation Loop**
   - For each task in `tasks.md`:
     - Inspect the requirements and acceptance criteria.
     - Apply code changes surgically with proper linting and conventions.
     - Run relevant unit/spec tests:
       ```bash
       task test:changed
       ```
     - Mark task complete in `tasks.md`: `- [ ]` → `- [x]`.
     - Commit changes with scoped conventional commits (`feat:`, `fix:`, `chore:`) referencing ticket/spec.

5. **Quality Verification Gate**
   - Run required verification checks before PR:
     ```bash
     task freshness:check
     task test:changed
     task workspace:validate
     ```
   - If freshness artifacts are stale, regenerate them:
     ```bash
     task freshness:update
     ```

6. **Archive & Merge**
   - Archive the completed change:
     ```bash
     bash scripts/openspec.sh archive "<slug>"
     ```
   - Push branch and create PR or merge according to repo protocol.
   - Release lock:
     ```bash
     bash scripts/agent-lock.sh release branch "$(git -C <worktree> branch --show-current)"
     ```
   - Report final status to user with completed tasks summary.
