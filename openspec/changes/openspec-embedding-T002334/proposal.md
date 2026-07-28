# Proposal: openspec-embedding-T002334

## Why

`bash scripts/openspec-embed-local.sh <slug>` steht ausschließlich in dev-flow-plan C.4. Bricht die Session vor C.4 ab (z.B. Watchdog-Timeout, Kontext-Overflow), fehlt das Embedding still — kein Alarm, kein Hinweis.

## What

Embedding-Aufruf aus dev-flow-plan C.4 in einen Post-Commit-Hook oder CI-Step verschieben, der unabhängig von der Session-Existenz läuft:
- Post-Commit-Hook in `.githooks/post-commit` für Worktree-Branches  
- Fallback: CI-Step in `ci.yml` der bei Plan-Commits embeddet

_Ticket: T002334_
