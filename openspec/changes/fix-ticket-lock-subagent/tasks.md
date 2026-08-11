# T003102: Ticket-Locks blockieren Abschluss durch Subagent

## Ziel
Ticket-Scoped-Locks der auftraggebenden Session blockieren nicht mehr den Abschluss durch Subagenten, ticket-mcp und post-merge.yml.

## Status

Erledigt — T003102. Der Abschluss (update-status → done/archived) läuft im closure-Modus am
ticket-scoped Lock vorbei; Subagent/`ticket-mcp`/post-merge (auto-close-merged.sh) schließen
im selben Vorgang mit je eigener SID ab. Execute-Skills und ticket-ops claimen branch-scoped;
`factory-prep.sh` erkennt branch-scoped Claims über die Ticket-ID im Branch-Namen und dispatcht
nicht doppelt.

## Tasks

### 1. Lock-Scope-Analyse
- [x] `scripts/agent-lock.sh` — ticket-scoped vs. branch-scoped Verhalten dokumentieren
- [x] Welche Komponenten prüfen den ticket-scoped Lock? (Subagent, ticket-mcp, post-merge.yml)

### 2. Fix
- [x] ticket-ops: NUR branch-scoped Locks claimen (keine ticket-scoped)
- [x] Subagent: ticket-scoped Lock beim Abschluss ignorieren oder eigenen Lock verwenden

### Verify
- [x] ticket-ops claimt branch-Lock, Subagent kann trotzdem abschließen
- [x] post-merge.yml kann Ticket schließen trotz ticket-Lock
