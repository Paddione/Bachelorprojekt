## ADDED Requirements

### Requirement: PR-Gate — actionlint über alle GitHub-Actions-Workflows

The system SHALL lint every file under `.github/workflows/` with a version-pinned
`actionlint` on every CI run of the `BATS Unit + Quality Gates` job, and the job SHALL
fail when actionlint reports any finding.

The lint SHALL be driven by a single entry point `scripts/lint-workflows.sh`, reachable
via the Taskfile target `lint:workflows`, so that the local and the CI invocation are the
same command with the same rule set. The actionlint binary SHALL be pinned to an explicit
version and fetched from the upstream release archive — never via `apt` and never as a
floating `latest` — for the same reason as gitleaks (T002506/T002554): local and CI must
evaluate the identical rule set.

The bundled `shellcheck` and `pyflakes` sub-linters SHALL be disabled. The existing
requirement *"Kein yamllint/shellcheck/kubeconform in CI — nur task test:all"* stays in
force; this gate targets workflow **correctness** (expression contexts, action inputs,
runner labels), not shell or YAML **style**.

Custom self-hosted runner labels SHALL be declared in `.github/actionlint.yaml` rather
than by silencing the `runner-label` rule.

#### Scenario: `secrets`-Kontext in einem step-level `if` blockiert den Merge

- **GIVEN** ein Workflow enthält `if: steps.detect.outputs.count != '0' && secrets.FOO != ''`
- **WHEN** `bash scripts/lint-workflows.sh` läuft
- **THEN** endet der Befehl mit Exit-Code ungleich 0
- **AND** die Ausgabe nennt den unzulässigen Kontext `secrets`
- **AND** der CI-Job `BATS Unit + Quality Gates` schlägt fehl

#### Scenario: Ein Workflow ohne Befund läuft durch

- **GIVEN** ein Workflow verwendet ausschließlich in `steps.*.if` zulässige Kontexte
- **WHEN** `bash scripts/lint-workflows.sh` läuft
- **THEN** endet der Befehl mit Exit-Code 0 und meldet keinen Befund

#### Scenario: Das self-hosted-Label `fleet-gpu` erzeugt keinen Befund

- **GIVEN** ein Job deklariert `runs-on: [self-hosted, fleet-gpu]`
- **WHEN** der Lint läuft
- **THEN** meldet er keinen `runner-label`-Befund, weil `.github/actionlint.yaml` das Label deklariert
- **AND** die `runner-label`-Regel ist NICHT global abgeschaltet

#### Scenario: shellcheck bleibt aus dem CI-Pfad heraus

- **GIVEN** ein Workflow enthält ein `run:`-Skript mit einem SC2086-Befund (unquoted variable)
- **WHEN** `bash scripts/lint-workflows.sh` läuft
- **THEN** endet der Befehl mit Exit-Code 0 — der gebündelte shellcheck-Sub-Linter ist abgeschaltet
- **AND** die bestehende Anforderung „Kein yamllint/shellcheck/kubeconform in CI" bleibt unverletzt

#### Scenario: Die actionlint-Version ist in CI festgeschrieben

- **GIVEN** `.github/workflows/ci.yml` richtet actionlint für den Lint-Schritt ein
- **WHEN** die Einrichtungszeile gelesen wird
- **THEN** enthält sie eine explizite Versionsnummer der Form `x.y.z`
- **AND** sie verwendet weder `apt` noch einen unversionierten `latest`-Bezug

#### Scenario: Eine reine Workflow-Änderung wählt den Lint in `task test:changed` aus

- **GIVEN** ein Change ändert ausschließlich Dateien unter `.github/workflows/`
- **WHEN** `task test:changed` läuft
- **THEN** führt es `task lint:workflows` aus, statt die Änderung ungeprüft passieren zu lassen

#### Scenario: Fehlendes Binary bricht laut ab statt still zu überspringen

- **GIVEN** `actionlint` liegt nicht im `PATH` und `ACTIONLINT_AUTO_INSTALL` ist nicht gesetzt
- **WHEN** `bash scripts/lint-workflows.sh` läuft
- **THEN** endet der Befehl mit Exit-Code ungleich 0
- **AND** die Ausgabe nennt den vollständigen Installationsbefehl für die gepinnte Version
- **AND** der Lauf gilt NICHT als bestanden — kein fail-open wie beim gitleaks-Hook vor T002554
