## ADDED Requirements

### Requirement: Der Rückfall auf die volle Testsuite ist sichtbar

`scripts/find-changed-tests.sh` SHALL announce on stderr when it abandons diff-scoped
selection and returns the complete suite, naming the file that triggered the fallback. The
announcement SHALL appear exactly once per run, regardless of how many files qualify as
triggers, and SHALL NOT be written to stdout — callers parse stdout as a plain file list.

A silent fallback is not merely unhelpful: the resulting run takes over ten minutes (measured:
138 of 138 spec files, 2016 tests). When such a run hits a caller-side timeout it exits
non-zero **while every sub-test passed** — indistinguishable, from the outside, from a real
test failure. The visible reason is what makes that distinction possible.

#### Scenario: Eine Harness-Änderung löst den Vollauf aus

- **GIVEN** ein Diff berührt `tests/spec/helpers/**`, `Taskfile*`, `.github/workflows/**`
  oder ein Skript ohne zugeordnete BATS-Datei
- **WHEN** `find-changed-tests.sh spec` läuft
- **THEN** listet stdout unverändert alle Spec-Dateien
- **AND** nennt stderr die auslösende Datei zusammen mit dem Hinweis, dass die **volle**
  Suite läuft

#### Scenario: Mehrere Auslöser erzeugen nur einen Hinweis

- **GIVEN** ein Diff enthält gleichzeitig eine Harness-Datei und einen Workflow
- **WHEN** `find-changed-tests.sh spec` läuft
- **THEN** erscheint der Hinweis genau einmal — eine Zeile je Datei würde die Meldung
  zutexten und damit wieder unsichtbar machen

#### Scenario: Die Task unterscheidet Auswahl von Vollauf

- **GIVEN** `task test:spec:changed` läuft
- **WHEN** die Anzahl der ausgewählten Dateien der Gesamtzahl in `tests/spec/` entspricht
- **THEN** meldet die Ausgabe den Vollauf samt Laufzeiterwartung statt „Running changed
  spec tests"
