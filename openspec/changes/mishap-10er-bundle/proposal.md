## Why

Das 10er-Mishap-Bundle (T002469) häuft Friction aus acht Komponenten an: ticket-ops führt Extraktionen mit falschen Zeilenbereichen durch, mcp-postgres fällt während Bulk-Triage aus, der gemma-4-12b-Planning-Dispatch wurde abgebrochen, agent-lock produziert stale Locks in opencode, die DoR-Prüfung erkennt laufende Tickets nicht, worktree-create.sh scheitert bei nicht-main-Checkouts, agent-collision.sh erzeugt lähmende False Positives, das factory_excluded-Flag ist nicht über ticket-mcp löschbar, der git-crypt-Key fehlt in frischen Worktrees, und eine brandneue Datei löst Kollisionsalarm aus.

Diese 10 Einzelfälle teilen ein Muster: keiner blockiert die Produktion, aber jeder kostet Kontext, Zeit und Frustration — und zusammen untergraben sie das Vertrauen in Guards und Automatismen.

## What Changes

1. **agent-collision.sh (M7, M9)**: File-Exists-Prüfung vor blob-Compare bei neuen Dateien; Slug-vs-Branch-Unterscheidung; verhindert False Positives bei brandneuen und nicht-existierenden Dateien
2. **worktree-create.sh (M6)**: auto-sync scheitert wenn main nicht ausgecheckt ist — auf origin/main statt lokalem main fast-forwarden
3. **worktree-create.sh git-crypt (M10)**: Beim Worktree-Anlegen den git-crypt-Key mitkopieren, damit Secret-Dateien nicht als geändert erscheinen
4. **agent-lock.sh opencode stale locks (M4)**: `--worktree`-Flag in opencode-Kontext zuverlässig machen; Ursache der stale Locks beheben
5. **ticket-mcp factory_excluded (M8)**: `remove_readiness_flag`-Wrapper für Flags, die nicht in der erlaubten Liste sind
6. **agent-collision.sh T002452 false positive (M5/M9)**: Datei-Existenz-Check vor blob-Vergleich; nicht-existente Peer-Dateien überspringen statt Alarm schlagen
7. **mcp-postgres availability (M2)**: Read-Only-Fallback für ticket-ops bei nicht erreichbarem mcp-postgres dokumentieren
8. **ticket-ops Extraktion (M1)**: exakte Line-Nummern-Prüfung vor sed-Extraktion
9. **DoR-Awareness (M5)**: agent-lock-check in die DoR-Prüfung einbauen — live-claimed Tickets erkennen
10. **gemma-planning-dispatch (M3)**: Prozedur in ticket-ops zwischen Planning-Dispatch (Orchestrator) und Execution-Dispatch (gemma) unterscheiden

## Capabilities

### New Capabilities

Keine — alle Änderungen betreffen bestehende Komponenten.

### Modified Capabilities

- `active-sessions-hub.md` (agent-lock): stale-Lock-Prävention für opencode
- `ticket-ops.md` (skills/ticket-ops): Line-Nummern-Prüfung + Dispatch-Unterscheidung
- Keine Spec-Änderungen für agent-collision.sh, worktree-create.sh, ticket-mcp (reine Implementierungsdetails)

## Impact

| Komponente | Dateien | Änderungstyp |
|---|---|---|
| scripts/agent-collision.sh | `scripts/agent-collision.sh` | Bugfix (False Positives) |
| scripts/worktree-create.sh | `scripts/worktree-create.sh`, `.githooks/post-checkout` | Bugfix + Feature |
| scripts/agent-lock.sh | `scripts/agent-lock.sh` | Bugfix (stale Locks) |
| ticket-mcp | `scripts/ticket-mcp/go/...` | Feature (remove_readiness_flag) |
| skills/ticket-ops | `.agents/skills/ticket-ops/SKILL.md` | Prozess-Doku |
| infra/mcp-postgres | `docs/...` | Doku |
| infra/git-crypt | `scripts/worktree-create.sh`, `.githooks/post-checkout` | Feature |
