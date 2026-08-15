## ADDED Requirements

### Requirement: devflow-ci-watch.sh ruft ticket.sh cwd-unabhängig auf

`scripts/devflow-ci-watch.sh` SHALL seine `ticket.sh`-Aufrufe (phase, assert-phase-chain)
gegen den Skript-Speicherort auflösen, nicht gegen das cwd des Prozesses. Der Pfad SHALL
über `TICKET_SH` überschreibbar sein (Testbarkeits-Schnittstelle, Muster
`MAX_CI_ATTEMPTS`); ohne Override SHALL er aus `BASH_SOURCE[0]` abgeleitet werden.

Hintergrund: Beobachtet bei T006370 (2026-08-15, Archiv-PR #4533) — nach Worktree-Remove
zeigte das cwd ins Nichts, der relative Aufruf `./scripts/ticket.sh` brach mit
`No such file or directory` ab, und der `if !`-Guard um assert-phase-chain übersetzte
diesen Umgebungsfehler fälschlich in Exit 6 „Phase-Chain nicht vollständig", obwohl die
Chain nie geprüft wurde.

#### Scenario: ticket.sh-Aufruf aus cwd ohne scripts/

- **GIVEN** `devflow-ci-watch.sh` wird aus einem cwd gestartet, das kein `./scripts/`
  enthält (Worktree entfernt oder fremdes Verzeichnis)
- **WHEN** das Skript `ticket.sh phase` oder `ticket.sh assert-phase-chain` aufruft
- **THEN** löst es den Aufruf über den Skript-Speicherort (bzw. den `TICKET_SH`-Override)
  auf statt über `./scripts/ticket.sh` relativ zum cwd

#### Scenario: TICKET_SH-Override steuert das Ticket-Tool

- **GIVEN** die Umgebung setzt `TICKET_SH` auf einen ausführbaren Pfad
- **WHEN** `devflow-ci-watch.sh` ticket.sh aufruft
- **THEN** verwendet es genau diesen Pfad (Testbarkeits-Schnittstelle, kein DB-Zugriff
  im Test nötig)
