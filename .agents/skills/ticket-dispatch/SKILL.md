---
name: ticket-dispatch
description: 'Turn already-triaged tickets into a dependency-aware wave plan and, after explicit approval, dispatch Wave 1 to dev-flow-plan or dev-flow-execute. Use for ticket waves, parallel work planning, quick wins, collision checks, and dispatch approval.'
---

> **Mishap Tracking:** Maintain `MISHAP_LOG`; at the end invoke `mishap-tracker`.

# ticket-dispatch

This skill consumes persisted output from `ticket-triage`. It plans and launches only ticket work; `dev-flow-plan`, `dev-flow-execute`, and Factory retain their own lifecycle ownership.

## Contract

- Read dependencies from both `tickets.depends_on` and `tickets.ticket_links`; links are ticket-to-ticket edges, never PR references. Read every full ticket description before routing.
- Batch groups are a planning unit only. Never group critical, in-progress, or already staged tickets; children retain their own IDs and closure.
- The orchestrator performs planning dispatches. Execution dispatches go only to the configured execution model; do not use that model for planning.
- Before any claim, re-fetch Wave-1 status and plan marker, check ticket and proposed-branch locks, inspect all lock scopes and matching worktrees. Report `LOCK-KONFLIKT` or `STALE-STATE` and skip those tickets.
- For unplanned tickets, run dev-flow-plan Phase A in the main checkout before creating the branch-scoped claim and worktree.
- No ticket disappears silently: cap/defer excess work explicitly.
- **Only Wave-1 dispatch needs explicit user approval.** Building and presenting a masterplan does not authorize dispatch.

## Procedure

Read `ticket-ops-procedures.md` §Phase 3 only. It defines graph construction, topological waves, quick-win selection, plan-versus-execute routing, the masterplan format, state recheck, and the approved Wave-1 dispatch sequence.

## Handoff

- `ai_ready` tickets without a staged plan → `dev-flow-plan`.
- `plan_staged` tickets → `dev-flow-execute`.
- A green merge closes each ticket; deployment state is not this skill's completion condition.

## Framework delivery

Claude Code and Codex use this canonical definition. opencode mirrors it; agy uses opencode's path authoritatively. Bash and MCP calls are framework-agnostic.
