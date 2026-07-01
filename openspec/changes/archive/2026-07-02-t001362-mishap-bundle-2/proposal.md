---
title: "Mishap-Bundle: scripts/plan-context.sh, skills/ticket-ops"
ticket_id: T001362
status: planning
---

## Problem

This bundle aggregates 3 mishap entries from today's ticket-ops session:

1. **ticket-mcp triage_ticket** — MCP tool fails with `--priority required` despite schema not marking it required. 6 calls failed.
2. **Subagent worktree context leakage** — planning subagents wrote files to main checkout instead of the designated worktree.
3. *(third mishap — details in ticket comments)*

## Goal

Fix or document all 3 issues so future ticket-ops runs don't hit the same friction.
