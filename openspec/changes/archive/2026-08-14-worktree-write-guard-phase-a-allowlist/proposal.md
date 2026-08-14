# Proposal: worktree-write-guard-phase-a-allowlist

## Why

Beim parallelen `ticket-ops`-Dispatch teilen mehrere `dev-flow-plan`-Subagenten dieselbe Session-ID (`SID`). Sobald ein Subagent seinen Worktree anlegt und claimt (`agent-lock claim branch`), blockiert `scripts/hooks/worktree-write-guard.sh` im Haupt-Checkout alle Schreibzugriffe für die übrigen Schwester-Agenten, die sich noch in Phase A (Proposal-Erstellung auf `main`) befinden. Dies zwingt Agenten zum Notausgang `WORKTREE_GUARD_BYPASS=1`.

## What

In `scripts/hooks/worktree-write-guard.sh` werden Phase-A-Proposal-Pfade im Haupt-Checkout (`$MAIN_ROOT/openspec/changes/*` und `$MAIN_ROOT/.lavish/*`) explizit erlaubt, auch wenn bereits eigene Claims für andere Worktrees in derselben Session existieren.

_Ticket: T005559_

