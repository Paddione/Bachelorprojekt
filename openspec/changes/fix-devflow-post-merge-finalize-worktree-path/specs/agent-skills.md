## MODIFIED Requirements

### Requirement: Post-Merge-Finalisierung als idempotente Skript-Einheit

Das Skript `scripts/devflow-post-merge-finalize.sh <ticket-id>` SHALL existieren und die Abschluss-Schritte (PR-Link, Ticket-Status `done` mit korrekter Resolution, `verify:done`-Phase-Event, Plan-Archiv nach `tickets.ticket_plans`, OpenSpec-Archiv inklusive Archiv-PR, Lock-Release, Worktree-Remove, Branch-Delete) als eine deterministische, **idempotente** Einheit ausführen: Bereits erledigte Schritte (Ticket bereits `done`, Plan bereits archiviert, Lock bereits frei, Worktree bereits entfernt) SHALL erkannt und übersprungen werden. Das Skript SHALL einen klaren Exit-Code liefern (0 = alle Schritte erledigt/übersprungen, 1 = Fehler) und ohne Cluster-/DB-Zugriff für den Offline-Modus einen dokumentierten Fehlerpfad haben.

| | Before | After |
|---|---|---|
| Closure-Schritte (PR-Link, `done` mit Resolution, `verify:done`) | laufen für jede übergebene PR-Nummer (`--pr`), ohne State-Prüfung | laufen NUR für bestätigt gemergte PRs: auch im `--pr`-Pfad prüft das Skript den PR-State (`gh pr view --json state`) und schließt nur bei `MERGED` (T001149-M1); bei offenem/geschlossenem PR oder nicht erreichbarem `gh` werden die Closure-Schritte übersprungen |
| OpenSpec-Archiv (Schritt 8) | wiederholt die Archiv-Sektion bei jedem Lauf, solange der Change-Ordner im Arbeitsbaum liegt — inklusive `git checkout -B` auf den Archiv-Branch des geteilten Arbeitsbaums, kollidierendem Push und FATAL bei `gh pr create` | überspringt die Archiv-Sektion idempotent, sobald der Archiv-Branch bereits auf origin existiert (`git ls-remote --exit-code`), und restauriert nach der Archivierung den vorherigen Branch des Arbeitsbaums, statt auf dem Archiv-Branch stehen zu bleiben |
| cwd-Abhängigkeit | Plan-Pfad-Prüfung (`[[ -s "$PLAN_FILE" ]]`) und der `branch-reaper.sh`-Aufruf gelten nur bei Aufruf aus dem Repo-Root | das Skript ist cwd-unabhängig: `cd "$REPO_DIR"` zu Skriptbeginn und explizites `--repo "$REPO_DIR"` im Reaper-Aufruf |
| Worktree-Pfad-Auflösung (Schritte 8+10) | `WORKTREE="$REPO_DIR/.worktrees/$SLUG"` konkateniert den Slug ohne `-T<id>`-Suffix — reale Worktrees heißen `<slug>-T<id>` oder `<branch-ohne-Typ-Praefix>-T<id>`, der Suffix-Treffer fehlt, Cleanup wird fälschlich als erledigt übersprungen | Worktree wird per `git worktree list --porcelain` dem Branch exakt zugeordnet (`refs/heads/$BRANCH`, Zeilen-Gleichheit) — eindeutig und unabhängig von der Verzeichnis-Konvention; Fallback auf die Slug-Konkatenation für Worktrees ohne Suffix |
| Plan-Pfad-Prüfung (Schritt 7) | `git cat-file -e "$BRANCH:$PLAN_FILE"` bekommt den absolutierten `PLAN_FILE` — `rev:path` verlangt einen relativen Pfad, der Check schlägt immer fehl und meldet fälschlich "vermutlich bereits persistiert" | Repo-Präfix wird entfernt (`${PLAN_FILE#"$REPO_DIR"/}`) — der Check prüft den Plan-Pfad tatsächlich und unterscheidet echt persistierte von fehlenden Plänen |

Hintergrund: Die Einzelschritte existieren als separate Skripte; es fehlte die zusammenfassende, aufrufbare und wiederholbare Einheit. Beim Incident T006284 musste die Eskalation die Abschluss-Schritte manuell in mehreren Schritten nachholen — ein idempotentes Finalize-Skript macht denselben Vorgang zu einem Ein-Befehl-Vorgang für Finalizer, Recovery-Sessions und den Factory-Poller. Review-Befunde aus PR #4539 (T006348) schärften die Zusagen: Closure nur für gemergte PRs, Archiv-Skip bei bereits laufender/erledigter Archivierung, cwd-Unabhängigkeit. T008014 (PR #4663-Beobachtung) fixte zwei falsche Skips aus der Pfad-Ableitung: die Worktree-Auflösung per `git worktree list`-Suffix-Match und die relative `rev:path`-Prüfung beim Plan-Archiv.

#### Scenario: Finalize-Skript ist idempotent

- **GIVEN** `scripts/devflow-post-merge-finalize.sh <ticket-id>` wurde bereits einmal erfolgreich ausgeführt
- **WHEN** es erneut ausgeführt wird
- **THEN** überspringt es alle bereits erledigten Schritte
- **AND** beendet sich mit Exit-Code 0

#### Scenario: Closure-Schritte laufen nur für gemergte PRs

- **GIVEN** ein Aufruf mit `--pr <n>` eines noch offenen PRs
- **WHEN** das Finalize-Skript den PR-State prüft
- **THEN** sind PR-Link, Ticket-Abschluss und `verify:done` übersprungen
- **AND** das Ticket bleibt offen (kein done bei PR=OPEN, T001149-M1)

#### Scenario: Zweiter Lauf bei bereits laufender Archivierung überspringt Schritt 8

- **GIVEN** die OpenSpec-Archivierung ist bereits ausgeführt (Archiv-Branch existiert auf origin, Archiv-PR offen)
- **WHEN** das Finalize-Skript erneut läuft
- **THEN** überspringt es die Archiv-Sektion idempotent
- **AND** der Arbeitsbaum-Branch wird nicht gewechselt und das Skript endet mit Exit-Code 0

#### Scenario: Finalize-Skript hat dokumentierten Offline-Fehlerpfad

- **GIVEN** eine Umgebung ohne Cluster-/DB-Zugriff (z. B. `TICKET_OFFLINE`-Modus)
- **WHEN** das Finalize-Skript aufgerufen wird
- **THEN** bricht es mit einer klaren Meldung und Exit-Code ungleich 0 ab, statt still falsche Zustände zu melden

#### Scenario: Worktree mit -T<id>-Suffix wird aufgelöst

- **GIVEN** ein Worktree `<repo>/.worktrees/<slug>-T<id>` oder `<repo>/.worktrees/<branch-ohne-Typ-Praefix>-T<id>` existiert und `<repo>/.worktrees/<slug>` nicht
- **WHEN** das Finalize-Skript den Worktree für den Branch auflöst
- **THEN** ist `WORKTREE` auf den Worktree-Pfad gesetzt (per `git worktree list`-Branch-Zuordnung)
- **AND** Cleanup (Schritte 8+10) läuft nicht fälschlich als "bereits erledigt" in den Skip

#### Scenario: Plan-Archiv-Check funktioniert mit absolutem Plan-Pfad

- **GIVEN** `PLAN_FILE` ist ein absoluter Pfad unterhalb von `$REPO_DIR` und der Plan liegt committet auf dem Branch
- **WHEN** das Finalize-Skript Schritt 7 den Plan per `git cat-file -e` prüft
- **THEN** ist der Pfad relativ zum Repo (`${PLAN_FILE#"$REPO_DIR"/}`) — der Check findet den Plan
- **AND** ein fehlender Plan wird nicht fälschlich als "vermutlich bereits persistiert" übersprungen
