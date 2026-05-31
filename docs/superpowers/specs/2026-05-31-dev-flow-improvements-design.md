# Spec: dev-flow Improvements & Chain Review Fixes

## 1. Problem Statement & Goals

The `dev-flow` pipeline is a solid framework with a clear planning/execution split, branch guards, and force-with-lease fallbacks. However, it currently suffers from:
1. **Critical Safety Defect (Self-Patch Loop)**: `dev-flow-e2e` automatically patches its own skill file and auto-merges it without human review or tests, violating the writing-skills iron law.
2. **Visual Asset Leak**: Image mockups attached to tickets shape the plan but are not re-fetched or read during execution (`dev-flow-execute`), forcing Sonnet to work on prose alone for UI tasks.
3. **Broken Handoff Seams & Missing Skills**:
   - **No code review gate**: PRs are merged with zero review.
   - **Menu Collisions**: Delegation to tools/skills like `finishing-a-development-branch` and `writing-plans` trigger interactive menus or handoffs that conflict with the sequential execution of `dev-flow`.
   - **Ad-hoc Verification & Debugging**: Systematic debugging and verification skills are not invoked in failure paths.
4. **Maintenance & standard violations**:
   - Skill files are extremely large (~10x size target), making them hard to maintain and increasing token/context overhead.
   - Duplicated raw SQL blocks for ticket operations (8+ PGPOD lookups, 12+ raw psql runs).
   - High density of inline gotchas (`T000xxx`).
   - Descriptions summarize workflow steps, triggering the CSO (Claude ignores body) anti-pattern.
   - Inconsistent use of the `mishap-tracker` (dead pre/post hooks).

---

## 2. Proposed Architecture & Solutions

### A. Remove the E2E Self-Patch Loop
- **Action**: Delete the automated patching script `scripts/e2e-skill-selfpatch.sh`.
- **Skill update**: Modify `dev-flow-e2e/SKILL.md` to remove Step 9a, 9b, and 9c entirely. E2E will log any friction or mishaps as tickets using `mishap-tracker` (which already does so). Actual edits to the skills will be done by a human using the `writing-skills` cycle.
- **Loop Correction**: Update Step 9d to reference `operations-management` instead of the defunct `ticket-management`.

### B. Dev↔Agent Visual Asset Flow
- **Action**: Introduce a CLI ticket helper script: `scripts/ticket.sh`. This script will encapsulate all database queries, inserts, and updates for tickets to eliminate raw SQL duplication and schema-drift hazards.
- **Script Capabilities**:
  - `create --type <type> --title <title> --description <desc>`: Creates a ticket.
  - `update-status --id <external_id> --status <status> [--resolution <res>]`: Updates ticket status.
  - `archive-plan --id <external_id> --slug <slug> --branch <branch> --plan-file <file> [--pr <num>]`: Archives a plan.
  - `get-attachments --id <external_id> --out-dir <dir>`: Queries `tickets.ticket_attachments` for the ticket and downloads all attachments (both images and text files) to a temporary directory so the agent can read them.
- **Skill Update**: In `dev-flow-execute/SKILL.md` Step 1/2, run `scripts/ticket.sh get-attachments` and instruct the agent to use the `Read` tool on those attachments for UI implementation tasks.
- **Slash Commands Clarification**: Clarify in the skills that `/model`, `/compact`, and `/clear` are user-only slash commands, and the agent must prompt the user to execute them.

### C. Standardize and Integrate Missing Skills
1. **Code Review Gate**: Add an explicit, mandatory step in `dev-flow-execute/SKILL.md` before merging the PR (between Step 3 Local Verification and Step 6 Auto-Merge). The agent must invoke the `code review` skill (`requesting-code-review` / `pr-review-toolkit:review-pr`) or run a code-review subagent, and address feedback.
2. **finishing-a-development-branch**: When invoking delegate skills that might trigger `finishing-a-development-branch`, pass an explicit override variable (e.g. `MENU=skip` or `--no-menu`) to suppress the interactive menu.
3. **writing-plans Execution-Handoff**: Add an instruction to the `dev-flow-plan` step where `writing-plans` is invoked to explicitly suppress the execution handoff prompt.
4. **verification-before-completion**: Formally delegate to this skill during Step 3 of `dev-flow-execute`.
5. **systematic-debugging**: Add an explicit error handling step in `dev-flow-execute` and `dev-flow-iterate` that directs the agent to invoke the `systematic-debugging` skill when a build or test fails.

### D. Refactoring & Word Count Reduction
To bring the files closer to the word targets and ensure readability/maintainability, we will perform **progressive disclosure**:
1. **Move Gotchas**: Extract all `T000xxx` Gotchas into a central reference file: `docs/superpowers/references/dev-flow-gotchas.md`. Keep only links to these gotchas in the main skill files.
2. **Move Brainstorming Tunnel Setup**: Move the detailed, multi-step brainstorming SSH tunnel setup instructions into a reference file: `docs/superpowers/references/brainstorm-tunnel-setup.md`. The main `dev-flow-plan` will simply link to this file and instruct the agent to read it only if they need to setup or troubleshoot the tunnel.
3. **Consolidate database lookups**: Replace the ~12 inline raw SQL execution blocks in the skills with simple calls to `scripts/ticket.sh`.

### E. Standardize Mishap-Tracker Hooks
- **Action**: Delete the YAML `hooks` pre/post blocks from `dev-flow-plan/SKILL.md` and `dev-flow-execute/SKILL.md`.
- **Skill update**: Ensure both files use a consistent in-body markdown section at the very end to invoke `mishap-tracker` via `scripts/hooks/mishap-tracker.sh` or standard skill commands.

---

## 3. Scope & Out of Scope
- **In Scope**:
  - `dev-flow-plan/SKILL.md` refactoring.
  - `dev-flow-execute/SKILL.md` refactoring.
  - `dev-flow-e2e/SKILL.md` refactoring.
  - Deletion of `scripts/e2e-skill-selfpatch.sh`.
  - Creation of `scripts/ticket.sh` CLI wrapper.
  - Creation of reference docs: `docs/superpowers/references/brainstorm-tunnel-setup.md` and `docs/superpowers/references/dev-flow-gotchas.md`.
- **Out of Scope**:
  - Modifying the underlying database schema of `tickets.tickets`.
  - Adjusting branding configurations for Mentolder or Korczewski.
