## Context

T002469 vereint 10 Mishaps aus acht Komponenten. Jeder Mishap für sich ist klein, aber zusammen erzeugen sie Lärm und Misstrauen in Guards. Die Fixes sind lokal begrenzt (maximal 2-3 Dateien pro Partial), sodass eine Partial-Struktur mit 5 disjunkten Gruppen sinnvoll ist.

## Goals / Non-Goals

**Goals:**
- agent-collision.sh: False Positives eliminieren (M7, M9)
- worktree-create.sh: auto-sync auf origin/main statt lokalem main (M6)
- worktree-create.sh: git-crypt-Key beim Worktree-Anlegen mitkopieren (M10)
- agent-lock.sh: stale-Locks in opencode verhindern (M4)
- ticket-mcp: factory_excluded-Flag entfernbar machen (M8)
- mcp-postgres: Read-Only-Fallback für ticket-ops dokumentieren (M2)
- ticket-ops: Line-Nummern-Prüfung + Dispatch-Unterscheidung (M1, M3)
- DoR-Prüfung: live-claimed Tickets erkennen (M5)

**Non-Goals:**
- Keine Änderungen am Factory-Dispatch-Mechanismus
- Kein neues MCP oder neuer Service
- Keine Datenmigration

## Decisions

1. **Partial-Struktur nach Datei-Disjunktheit**: 5 Partials (p1-p5) mit disjunkten Files, letztes Partial Tests.
2. **agent-collision.sh Fix**: File-Exists-Prüfung (`[ -f "$peer_path" ]`) vor blob-Vergleich — schlägt nur bei wirklich existierenden Kollisionen Alarm.
3. **worktree-create.sh auto-sync**: `git fetch origin main && git rev-parse origin/main` statt lokalem `main`-Branch.
4. **git-crypt-Key**: `cp .git/git-crypt/keys/default .worktrees/<slug>/.git/git-crypt/keys/default` im Worktree-Create-Script.
5. **ticket-mcp factory_excluded**: `remove_readiness_flag` API erweitern um das factory_excluded-Flag.

## Risks / Trade-offs

- [Risk] git-crypt-Key-Kopie: Sicherheitsbedenken? → Nein, gleicher User, gleicher Host, nur Komfort.
- [Risk] agent-collision.sh Änderung: Könnte echte Kollisionen verschleiern? → Nein, weil die Datei dann ja existiert und der Compare trotzdem greift.
