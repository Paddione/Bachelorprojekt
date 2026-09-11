---
name: ticket-triage
description: 'Triage ticket content without dispatching work: determine completeness, DoR, severity, component, areas, dependencies, human questions, and batch candidates. Use for "triage tickets", "what is missing", Definition of Readiness, attention_mode, planning_rank, and clarification requests.'
---

> **Mishap Tracking:** Maintain `MISHAP_LOG`; at the end invoke `mishap-tracker`.

# ticket-triage

Triage is a bounded preparation phase. It may persist ticket bookkeeping and ask people for genuine decisions, but it never creates worktrees, claims branches, or dispatches implementation. For waves and dispatch, hand the persisted result to `ticket-dispatch`.

## Contract

- `tickets.tickets` is the SSOT. Use only valid enum values; see `ticket-ops-procedures.md` §Ticket-Modell.
- Read complete descriptions before deciding. Before intake, dedupe against an open normalized title; reuse the ticket and add a re-trigger comment instead of a near-duplicate.
- DoR (`dorScore = 4`) is not the Factory gate. For a feature moved to `backlog`, populate `requirements_list` and set `lastenheft_locked` in the same pass.
- A live ticket or branch claim means ongoing work: leave it `in_progress` and do not re-triage it.
- Reads are MCP-first. If mcp-postgres is unavailable, use the documented `ticket.sh` fallback.
- Batch candidates are advisory until `ticket-dispatch` validates dependencies and file conflicts.

## Run only the needed phase

| Need | Read from `ticket-ops-procedures.md` |
|---|---|
| classify incomplete/resolved/obsolete/ready tickets | §Phase 1 |
| identify compatible backlog batches | §Phase 1.5 |
| ask and persist missing human decisions | §Phase 2 |

Phase-1 writes are bookkeeping: ambiguous cases remain untouched and become human questions. Limit an escalation round to about three tickets and explicitly label excess tickets `DEFERRED`. Write readiness JSON with a JSONB merge so existing flags are preserved.

## Handoff to ticket-dispatch

Persist and report only ticket IDs, `missing[]`, readiness/attention state, dependency evidence, batch candidates, unresolved human questions, and deferred IDs. Do not invent a wave or claim a branch. Once the ready set is stable, invoke `ticket-dispatch`.

## Framework delivery

Claude Code and Codex use the canonical definition. This opencode entrypoint mirrors it; agy uses this path authoritatively. Bash and MCP calls are framework-agnostic.
