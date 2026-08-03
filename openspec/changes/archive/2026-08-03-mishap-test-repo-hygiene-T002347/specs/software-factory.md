## ADDED Requirements

### Requirement: BATS-Tests legen Fixtures außerhalb des Arbeitsbaums an

BATS tests SHALL create fixture files under `$BATS_TEST_TMPDIR` rather than in the working
tree, and SHALL NOT rely on an in-body `rm -rf` to clean them up. A cleanup statement inside
the test body does not run when the test is killed by SIGTERM or a timeout — precisely the
situation in which leftover files matter. `$BATS_TEST_TMPDIR` is removed by the framework
regardless of how the test ends.

This is not a tidiness concern. A half-created `openspec/changes/<slug>/` directory containing
only `tasks.md` is indistinguishable from a real, broken change: any concurrently running
validation of the openspec tree fails against it, and the failure appears in an unrelated test.

#### Scenario: stage-plan-Test erzeugt seinen Plan im Temp-Verzeichnis

- **GIVEN** ein Test prüft `ticket.sh stage-plan` und braucht dafür eine Plan-Datei
- **WHEN** der Test die Datei anlegt
- **THEN** entsteht sie unter `$BATS_TEST_TMPDIR` und wird per absolutem Pfad an `--plan`
  übergeben — `stage-plan` akzeptiert laut Vorbedingung neben `git cat-file` auch eine Datei
  auf der Platte, ein `cd` oder `git init` im Sandbox-Verzeichnis ist also nicht nötig
- **AND** im Arbeitsbaum entsteht kein `openspec/changes/`-Eintrag, auch nicht vorübergehend

#### Scenario: Abgebrochener Test hinterlässt keine ungetrackten Dateien

- **GIVEN** ein Test wird durch SIGTERM oder einen Timeout beendet, bevor sein Rumpf durchläuft
- **WHEN** danach `git status --porcelain` im Arbeitsbaum ausgeführt wird
- **THEN** meldet es keine vom Test erzeugten Dateien
