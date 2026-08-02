# Proposal: freshness-check-base-mismatch

## Why

`task freshness:check` vergleicht generierte Artefakte ausschließlich gegen den lokalen
`HEAD` (`git diff HEAD -- "$f"` in `Taskfile.yml`). CI führt denselben Task jedoch gegen den
PR-Merge-Commit aus, der bereits den aktuellen `origin/main`-Stand enthält. Beide Messungen
sind für sich genommen korrekt, vergleichen aber unterschiedliche Basen — ein lokal grüner
Lauf sagt nichts darüber aus, ob CI ebenfalls grün wird, sobald der lokale Branch hinter
`origin/main` zurückliegt. Ein Re-Run ändert daran nichts, weil die Diskrepanz nicht in den
Artefakten liegt, sondern in der gemessenen Basis. Das kostete 3 Anläufe an PR #3658.

Root-Cause-Verifikation (T002448-M5): Quellcode-Inspektion von `Taskfile.yml` bestätigt,
dass die `freshness:check`-Task-Definition an keiner Stelle `origin/main` oder
`git rev-list` referenziert — es gibt keinerlei Prüfung, ob der lokale Branch veraltet ist,
und die Fehlermeldungen nennen nie, gegen welchen Commit gemessen wurde. Dies ist keine
ungeprüfte Hypothese mehr, sondern durch die vollständige Abwesenheit dieser Referenzen im
Task-Body belegt.

## What

`freshness:check` soll (1) in seiner Ausgabe die gemessene Basis (lokaler `HEAD`) nennen und
(2) warnen, wenn der lokale Branch hinter `origin/main` zurückliegt (`git rev-list --count
HEAD..origin/main`), damit ein Operator sofort erkennt, dass ein lokal grüner Lauf gegen eine
veraltete Basis gemessen wurde und CI mit einer aktuelleren Basis abweichen kann.

_Ticket: T002561_

### Requirement: Freshness-Check nennt die gemessene Basis und warnt bei veraltetem lokalem Branch

Der `freshness:check`-Task MUSS ermitteln, wie viele Commits der lokale `HEAD` hinter
`origin/main` zurückliegt (`git rev-list --count HEAD..origin/main`), und MUSS eine Warnung
ausgeben, wenn dieser Wert größer als 0 ist — inklusive der Anzahl fehlender Commits und dem
Hinweis, dass CI gegen eine aktuellere Basis (den Merge-Commit) prüft.

#### Scenario: Local branch is behind origin/main

- **GIVEN** the local branch has fetched `origin/main` and is 3 commits behind it
- **WHEN** `task freshness:check` runs
- **THEN** the output includes a warning naming the number of commits behind `origin/main`
  and states that CI measures against a newer merge-commit base

#### Scenario: Local branch is up to date with origin/main

- **GIVEN** the local branch is even with `origin/main` (0 commits behind)
- **WHEN** `task freshness:check` runs
- **THEN** no behind-origin/main warning is printed and the task proceeds unchanged
