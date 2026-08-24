## ADDED Requirements

### Requirement: Indexierung läuft single-flight über alle Instanzen

Skriptgesteuerte codebase-memory-Indexierungen SHALL über einen
flock-basierten Single-Flight-Wrapper (`scripts/mcp/cbm-single-flight.sh`)
serialisiert werden, sodass pro Repo-Pfad zu jedem Zeitpunkt höchstens ein
Index-Job läuft; konkurrierende Aufrufer warten auf die Sperre, statt
parallele Volljobs zu starten.

#### Scenario: Zwei parallele Aufrufer

- **GIVEN** ein Index-Job läuft bereits unter der Lockdatei im
  `~/.cache/codebase-memory-mcp/`
- **WHEN** ein zweiter Aufrufer den Wrapper mit demselben Repo-Pfad startet
- **THEN** wartet der zweite Aufrufer auf die Sperre und startet erst nach
  Freigabe — es laufen niemals zwei Volljobs für denselben Pfad.

#### Scenario: Wrapper-Fail-Safe

- **GIVEN** das Cache-Verzeichnis existiert nicht
- **WHEN** der Wrapper startet
- **THEN** legt er die Lockdatei inklusive Verzeichnis an (mkdir -p) und
  schlägt nicht wegen fehlender Infrastruktur fehl.

### Requirement: Stampede-Runbook dokumentiert Akut-Mitigation und Prävention

Das Repository SHALL ein Runbook `docs/runbooks/cbm-index-stampede.md`
führen, das die beobachtete Index-Stampede (Load-Spitze 54.5 bei nproc=4)
mit akuten Gegenmaßnahmen und Präventionsregeln beschreibt — insbesondere:
vor manuellem Reindex zuerst `index_status`/`detect_changes` prüfen, nur
eine Session indiziert zur Zeit, graph-Lese-Tools arbeiten stale-tolerant,
und getötete Worker respawnen (STOP/TERM allein heilt nicht).

#### Scenario: Session trifft auf stale Store unter Last

- **GIVEN** der Graph-Store ist stale und mehrere Sessions sind aktiv
- **WHEN** eine Session dem Runbook folgt
- **THEN** prüft sie Store-Frische und Index-Laufende zuerst und stößt
  einen Volljob ausschließlich über den Single-Flight-Wrapper an — kein
  direkter `index_repository`-Aufruf aus parallelen Sessions.
