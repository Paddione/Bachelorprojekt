## ADDED Requirements

### Requirement: JUnit-Shard-Artefakte sind gitignored — Worktree-Cleanup unblockiert

BATS-Läufe erzeugen JUnit-Artefakte als `spec-junit-shard-1..4/report.xml`. Diese
Shard-Form SHALL in `.gitignore` neben `junit-report/` (BATS_JUNIT_DIR, T003025) und
`vitest-junit-report/` ignoriert sein, damit untracked Shard-Artefakte den
`worktree-clean-check` (Nicht-Allowlist-Filter) nicht blockieren und Worktree-Removes
nicht an CI-Artefakten scheitern. Ein BATS-Guard SHALL die Ignore-Regel für die erste
und letzte Shard-Nummer verankern (`git check-ignore` rc=0).

#### Scenario: Shard-Artefakte sind ignoriert, Worktree-Remove bleibt unblockiert

- **GIVEN** ein Worktree, in dem BATS-Shard-Läufe `spec-junit-shard-1..4/report.xml` erzeugt haben
- **WHEN** `git check-ignore -q spec-junit-shard-1/report.xml` (und `spec-junit-shard-4/report.xml`) ausgeführt wird
- **THEN** git meldet die Artefakte als ignoriert (rc=0)
- **AND** `worktree-clean-check` verwirft die Shard-Artefakte nicht als Nicht-Allowlist-Dateien

#### Scenario: Bestehende JUnit-Ignore-Muster bleiben wirksam

- **GIVEN** die `.gitignore`-Zeilen für `junit-report/` (BATS_JUNIT_DIR) und `vitest-junit-report/`
- **WHEN** die Shard-Regel `spec-junit-shard-*/` ergänzt wird
- **THEN** bleiben beide bestehenden Muster unverändert und wirksam (check-ignore rc=0)
