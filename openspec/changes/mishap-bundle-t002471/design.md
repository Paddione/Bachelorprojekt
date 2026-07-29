# Design: T002471 — 10-Entry Mishap Bundle

**Ticket:** T002471
**Slug:** mishap-bundle-t002471
**Target Spec:** misc-scripts

## Scope

10 Mishaps aus der Session 2026-07-29, alle mit bekanntem Fix.

### Gruppierung nach Subsystem

| Gruppe | Mishaps | Subsystem | Files |
|--------|---------|-----------|-------|
| **Pre-commit** | M4, M7 | .githooks/pre-commit, worktree-create.sh | Branch-Name-Guard, gitleaks-Hinweis |
| **Collision** | M5, M9 | scripts/agent-collision.sh | False in-flight, Self-Filter SID |
| **Stage-Plan** | M6 | scripts/ticket.sh | plan_ref-Validierung |
| **Ticket-Ops** | M3 | .agents/skills/references/ticket-ops-procedures.md | requirements_list |
| **Frontmatter** | M10 | scripts/vda.sh | domain-Ableitung |
| **CI/Tools** | M1, M2, M8 | scripts/pre-push, scripts/, openspec-embed.mjs | gh, node_modules, Embedding |

## Partials

| Partial | Mishaps | Files |
|---------|---------|-------|
| p1 | M4 | scripts/worktree-create.sh, .githooks/pre-commit |
| p2 | M5, M9 | scripts/agent-collision.sh |
| p3 | M6 | scripts/ticket.sh |
| p4 | M3 | .agents/skills/references/ticket-ops-procedures.md |
| p5 | M10 | scripts/vda.sh |
| p6 | M1, M2, M7, M8 | scripts/quality-gate.sh, openspec-embed.mjs |
