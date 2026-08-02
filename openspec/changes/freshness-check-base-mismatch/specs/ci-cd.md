## ADDED Requirements

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
