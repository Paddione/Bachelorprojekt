---
name: ticket-ops
description: 'Compatibility router for internal ticket content. Routes completeness triage and clarification to ticket-triage; routes dependency waves and approved dispatch to ticket-dispatch. Use for existing "ticket-ops" invocations or ambiguous ticket-content requests. Not for repository hygiene or production incidents.'
---

# ticket-ops — compatibility router

Use this small entrypoint to preserve existing invocations without loading the complete ticket workflow. The ticket database is the system of record; GitHub PRs are only merge mechanics.

| Request | Load next |
|---|---|
| completeness, DoR, missing facts, severity, areas, human questions, batch candidates | `ticket-triage` |
| dependency graph, waves, collision checks, quick wins, dispatch | `ticket-dispatch` |
| both, or "triage everything" | `ticket-triage`, then `ticket-dispatch` only after triage results exist |
| branches, worktrees, PRs, factory queue | `repo-hygiene` |
| a live production outage | `incident-response` |

Do not dispatch work from this router. `ticket-dispatch` owns the single user-approval gate; `dev-flow-plan` and `dev-flow-execute` own implementation planning and execution.

## Routing invariants

- Preserve the **Dedupe-Guard**: GitHub issue intake checks for an existing same-title/duplicate ticket before creating one (T001147).
- **Pre-Check-Invariante [T002422]**: `ticket-dispatch` rechecks ticket and lock state before a claim.
- A Claim starts only after dev-flow-plan **Phase A** / proposal work in the main checkout; a Claim must not block that Phase A work (T004602).

## Framework delivery

Claude Code and Codex use this canonical `.claude/skills` definition. opencode has a mirrored entrypoint, and agy treats opencode's path as authoritative. Keep the two entrypoints behaviorally identical when this router changes.
