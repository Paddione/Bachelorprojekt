# Proposal: worktree-reap

## Why

`cmd_reap` in `scripts/agent-lock.sh` läuft bei jedem Session-Start und zusätzlich als
Pre-Claim-Reap bei jedem `claim` — räumt aber weder verwaiste Worktrees noch squash-gemergte
Branches ab. Am 2026-08-03 hatten sich dadurch acht verwaiste `.worktrees/`-Verzeichnisse
angesammelt (Ticket `done`, Remote-Branch gelöscht, Arbeitsbaum sauber); sie mussten manuell
entfernt werden.

Zwei belegte Ursachen, jede für sich hinreichend:

1. Der Vorfilter `git branch --merged main` in Schritt 2c liefert im Repo nur `main` — nach einem
   Squash-Merge wird der Branch-Tip nie Vorfahre von `origin/main`. Die nachgelagerte
   `upstream-gone`-Prüfung wird deshalb nie erreicht.
2. `git branch -d` bricht ab, solange der Branch in einem Worktree ausgecheckt ist; das
   angehängte `2>/dev/null || true` macht diesen Fehlschlag unsichtbar.

## What

Eine geteilte Kandidaten-Prüfung mit vier fail-closed Kriterien (Upstream gelöscht, Ticket
`done`/`archived`, Arbeitsbaum sauber, kein lebender Claim), konsumiert von zwei Verwertern:
Schritt 2c für Branches ohne Worktree, eine neue Stufe für solche mit. Sicherheitsnetz ist ein
lokaler Tag `reaped/<branch>` vor jedem `branch -D`; der eigene Worktree ist nie Kandidat; jeder
übersprungene Kandidat erzeugt eine Begründung auf stderr.

Details, Trade-offs und Test-Strategie: `design.md`.

_Ticket: T002622_
