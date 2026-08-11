# T003102: Ticket-Locks blockieren Abschluss durch Subagent

## Ziel
Ticket-Scoped-Locks der auftraggebenden Session blockieren nicht mehr den Abschluss durch Subagenten, ticket-mcp und post-merge.yml.

## Tasks

### 1. Lock-Scope-Analyse
- [ ] `scripts/agent-lock.sh` — ticket-scoped vs. branch-scoped Verhalten dokumentieren
- [ ] Welche Komponenten prüfen den ticket-scoped Lock? (Subagent, ticket-mcp, post-merge.yml)

### 2. Fix
- [ ] ticket-ops: NUR branch-scoped Locks claimen (keine ticket-scoped)
- [ ] Subagent: ticket-scoped Lock beim Abschluss ignorieren oder eigenen Lock verwenden

### Verify
- [ ] ticket-ops claimt branch-Lock, Subagent kann trotzdem abschließen
- [ ] post-merge.yml kann Ticket schließen trotz ticket-Lock
