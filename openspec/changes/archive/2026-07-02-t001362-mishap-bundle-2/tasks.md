---
title: "Mishap-Bundle: scripts/plan-context.sh, skills/ticket-ops"
ticket_id: T001362
domains:
  - ops
  - skills
status: plan_staged
---

# t001362-mishap-bundle-2 — Implementation Plan

## File Structure

- `.claude/agents/bachelorprojekt-ticket-ops.md` — investigate
- `.opencode/opencode.jsonc` — investigate
- `scripts/ticket.sh` — investigate

## Tasks

### Task 1: Investigate triage_ticket --priority requirement

Read `scripts/ticket.sh` to understand why `--priority` is required in non-interactive mode even when not changing priority. Determine if the MCP schema or the script should be fixed.

**Steps:**
- `grep -n 'triage\|priority' scripts/ticket.sh`
- Verify the MCP tool schema in `.opencode/opencode.jsonc`
- Expected: root cause identified

### Task 2: Fix subagent worktree context isolation

Investigate why subagents dispatched during Wave 3 wrote proposal files to the main checkout instead of the worktree. Ensure `cd` into the worktree is enforced in subagent prompts.

**Steps:**
- Review subagent prompt template for worktree path handling
- Expected: fix identified and applied

### Task 3: Verify

- `task test:changed`
- `task freshness:regenerate`
- `task freshness:check`
