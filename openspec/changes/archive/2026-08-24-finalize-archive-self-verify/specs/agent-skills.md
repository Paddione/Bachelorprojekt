## ADDED Requirements

### Requirement: Der Post-Merge-Archivpfad unterscheidet archiviert von halb archiviert

`scripts/devflow-post-merge-finalize.sh` SHALL determine the archive state of a change from a
**positive** signal and SHALL NOT infer completion from the absence of `openspec/changes/<slug>`.

The script SHALL expose the determination as a standalone subcommand
`--archive-state <slug> [--branch <branch>]` that writes exactly one of `archived`, `half` or
`pending` to stdout and exits 0 when the state could be determined. The subcommand SHALL NOT
require database or cluster access, so that it is verifiable by its output.

The three states are defined as:

- `archived` — the target state is reached: the archive branch exists on origin, or
  `openspec/changes/archive/<date>-<slug>` exists on `origin/main`, or an archive PR for the
  branch is merged. This is the existing `_archive_already_done` disjunction.
- `half` — the change directory `openspec/changes/<slug>` is absent from the working tree while
  `openspec/changes/archive/<date>-<slug>` is present and uncommitted, and none of the `archived`
  signals holds. The move was performed but never committed.
- `pending` — `openspec/changes/<slug>` is present and none of the `archived` signals holds.

Where the state cannot be determined — a required query fails rather than answering negatively —
the subcommand SHALL exit non-zero and SHALL NOT print a state. A failed measurement is not a
verdict.

#### Scenario: Halb archivierter Zustand wird nicht als erledigt gelesen

- **GIVEN** ein Arbeitsbaum, in dem `openspec/changes/<slug>` fehlt und
  `openspec/changes/archive/<datum>-<slug>` uncommittet vorliegt
- **AND** weder der Archiv-Branch auf origin noch das Archivverzeichnis auf `origin/main`
  existiert
- **WHEN** `--archive-state <slug>` aufgerufen wird
- **THEN** schreibt es `half` auf stdout
- **AND** endet mit Exit-Code 0

#### Scenario: Erreichter Zielzustand wird als archived gemeldet

- **GIVEN** `openspec/changes/archive/<datum>-<slug>` liegt auf `origin/main`
- **WHEN** `--archive-state <slug>` aufgerufen wird
- **THEN** schreibt es `archived` auf stdout

#### Scenario: Unarchivierter Change wird als pending gemeldet

- **GIVEN** `openspec/changes/<slug>` liegt im Arbeitsbaum und kein `archived`-Signal greift
- **WHEN** `--archive-state <slug>` aufgerufen wird
- **THEN** schreibt es `pending` auf stdout

### Requirement: Schritt 8 nimmt eine unterbrochene Archivierung wieder auf

Where the archive state is `half`, `scripts/devflow-post-merge-finalize.sh` SHALL resume the
interrupted archival instead of re-running it: it SHALL commit the already-performed move, push
the archive branch and open the archive PR. It SHALL NOT invoke `scripts/openspec.sh archive`
again for that slug — the change directory no longer exists and the archive destination is
already populated, so a second invocation fails closed rather than repairing anything.

Where the archive state is `half`, the script SHALL NOT report the step as skipped. Reporting a
half-finished archival as skipped is the defect this requirement removes.

#### Scenario: Folgelauf schließt die unterbrochene Archivierung ab

- **GIVEN** ein Lauf wurde zwischen `openspec.sh archive` und `git commit` abgebrochen und
  hinterließ den Zustand `half`
- **WHEN** das Finalize-Skript für dasselbe Ticket erneut läuft
- **THEN** meldet Schritt 8 nicht `[skip]`
- **AND** wird die vorhandene Verschiebung committet, statt erneut archiviert zu werden

#### Scenario: Fehlender Change-Ordner allein rechtfertigt keinen Skip

- **GIVEN** `openspec/changes/<slug>` fehlt im Arbeitsbaum
- **AND** kein `archived`-Signal greift
- **WHEN** Schritt 8 den Zustand bestimmt
- **THEN** ist das Ergebnis `half` und nicht „bereits archiviert"

### Requirement: Schritt 8 belegt seinen Abschluss am Positiv-Signal

After the archive section, `scripts/devflow-post-merge-finalize.sh` SHALL verify that the archive
branch exists on origin **and** that a pull request for that branch exists, before reporting the
step as done. The verification SHALL test for the presence of both signals; it SHALL NOT infer
success from the absence of an error.

Where either signal is missing or its query fails, the script SHALL report the step as an error
and exit non-zero. It SHALL NOT report a missing completion as skipped.

#### Scenario: Abschluss ohne Beleg ist ein Fehler

- **GIVEN** die Archiv-Sektion lief, aber der Archiv-Branch steht nicht auf origin
- **WHEN** Schritt 8 seinen Abschluss prüft
- **THEN** meldet das Skript einen Fehler
- **AND** endet mit einem Exit-Code ungleich 0

#### Scenario: Belegter Abschluss meldet Erfolg

- **GIVEN** der Archiv-Branch steht auf origin und ein PR auf diesen Branch existiert
- **WHEN** Schritt 8 seinen Abschluss prüft
- **THEN** meldet das Skript Schritt 8 als erledigt
