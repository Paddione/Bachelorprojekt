---
title: Plan: dev-flow Improvements & Chain Review Fixes
ticket_id: T000370
domains: [infra, ops, test]
status: active
pr_number: null
---

# Plan: dev-flow Improvements & Chain Review Fixes

Address the structural safety issues, visual asset leaks, size constraints, and integration seams in `dev-flow-plan`, `dev-flow-execute`, and `dev-flow-e2e` skills.

## Milestones

### M1: Create Ticket CLI Helper (`scripts/ticket.sh`)
- [ ] Create `scripts/ticket.sh` encapsulating all ticket database operations.
  - Commands: `create`, `update-status`, `archive-plan`, `get-attachments`.
- [ ] Test CLI operations locally to verify they connect to the database.

### M2: Refactor dev-flow Skills to Use Helper
- [ ] Refactor `dev-flow-plan/SKILL.md` to use `scripts/ticket.sh create`.
- [ ] Refactor `dev-flow-execute/SKILL.md` to use `scripts/ticket.sh update-status` and `archive-plan`.
- [ ] Remove all raw SQL execution blocks from both skill files.

### M3: Visual Asset Handoff Flow
- [ ] Update `dev-flow-execute/SKILL.md` Step 1/2 to fetch ticket attachments via `scripts/ticket.sh get-attachments`.
- [ ] Add instruction for execution agent to `Read` visual/textual assets before coding.
- [ ] Document that `/model`, `/compact`, and `/clear` are user-only slash commands.

### M4: Resolve Safety, Collisions, and Seams
- [ ] Delete `scripts/e2e-skill-selfpatch.sh` and remove the self-patch Step 9 from `dev-flow-e2e/SKILL.md`.
- [ ] Update E2E termination step to use `mishap-tracker` and point to `operations-management`.
- [ ] Add a mandatory Code Review gate in `dev-flow-execute/SKILL.md` before the PR merge using `requesting-code-review`.
- [ ] Add instructions to suppress interactive menus in `writing-plans` (Planning) and `finishing-a-development-branch` (Execution).
- [ ] Integrate `verification-before-completion` and `systematic-debugging` in verification/failure paths.

### M5: Progressive Disclosure & Size Budget Optimization
- [ ] Create `docs/superpowers/references/brainstorm-tunnel-setup.md` containing tunnel setup instructions.
- [ ] Create `docs/superpowers/references/dev-flow-gotchas.md` containing all `T000xxx` gotchas.
- [ ] Replace inline tunnel details and gotchas in skills with links and read-on-demand prompts.
- [ ] Trim YAML descriptions in `dev-flow-plan` and `dev-flow-e2e` to prevent CSO anti-pattern.
- [ ] Clean up dead pre/post YAML hooks, standardizing on in-body mishap tracker.

---

## Verification Plan

### Automated Checks
- Run `task test:all` to ensure manifests and tests compile.
- Run `scripts/ticket.sh` basic commands manually.

### Manual Verification
- Verify the plan is successfully archived using the new `scripts/ticket.sh archive-plan` command.
- Verify `dev-flow-plan` and `dev-flow-execute` files are significantly reduced in size.
