# ci-cd — Delta (renovate-repositories, T002165)

## MODIFIED Requirements

### Requirement: Dependency-Update via Renovate (selbstgehostet)

The system SHALL run self-hosted Renovate weekly (montags 07:00 UTC) to open PRs for outdated
dependencies, authenticating via a **per-run minted GitHub App installation token** — never
`GITHUB_TOKEN`, and never a statically stored installation token. Because a GitHub App
installation token expires after one hour, the workflow SHALL mint a fresh token on every run
using a SHA-pinned `actions/create-github-app-token` step whose `app-id` and `private-key`
inputs read the long-lived secrets `RENOVATE_APP_ID` and `RENOVATE_APP_PRIVATE_KEY`. The App
installation SHALL carry the `Workflows: write` permission in addition to Contents and
Pull requests, because the `github-actions` manager with `pinDigests: true` modifies files under
`.github/workflows/`, and SHALL carry no permissions beyond those four (least privilege — the
private key grants everything the App can do).

The workflow SHALL additionally pass an explicit repository work list via
`RENOVATE_REPOSITORIES: ${{ github.repository }}`. Self-hosted Renovate processes no repository
without one: the run exits **successfully** while logging
`WARN: No repositories found - did you want to run with flag --autodiscover?`, producing neither
PRs nor a Dependency Dashboard issue. `renovatebot/github-action` does not forward
`github.repository` on its own. An explicit list is REQUIRED over `RENOVATE_AUTODISCOVER` so the
run stays deterministic regardless of how widely the GitHub App is installed.

`renovate.json5` SHALL NOT use the deprecated `matchPackagePatterns` option; package matching
SHALL use `matchPackageNames` with slash-wrapped regexes. It SHALL NOT carry rules for
components the platform no longer runs — notably no Keycloak rule, since authentication migrated
to Pocket ID and no `quay.io/keycloak` image remains in any manifest.

#### Scenario: Renovate öffnet Dependency-Update-PR

- **GIVEN** eine neue Version von `actions/checkout` ist verfügbar
- **WHEN** Renovate montags um 07:00 UTC läuft
- **THEN** öffnet Renovate einen PR mit dem gepinnten SHA-Digest-Update gemäß `renovate.json5`

#### Scenario: Token wird pro Run frisch geprägt

- **GIVEN** der Renovate-Workflow startet (per Cron oder `workflow_dispatch`)
- **WHEN** die Steps ausgeführt werden
- **THEN** läuft ein SHA-gepinnter `actions/create-github-app-token`-Step vor dem Renovate-Step
- **AND** `renovatebot/github-action` erhält den Token als `steps.<id>.outputs.token`
- **AND** kein statisch hinterlegtes `secrets.RENOVATE_TOKEN` wird referenziert

#### Scenario: Renovate bekommt eine explizite Repo-Arbeitsliste

- **GIVEN** der Renovate-Step wird ausgeführt
- **WHEN** seine `env`-Sektion ausgewertet wird
- **THEN** enthält sie `RENOVATE_REPOSITORIES` mit `github.repository`
- **AND** das Log enthält KEINE `No repositories found`-Warnung

#### Scenario: Grüner Lauf ohne Arbeit gilt als Fehlschlag

- **GIVEN** ein Renovate-Run endet mit `conclusion=success`
- **WHEN** er dabei `WARN: No repositories found` geloggt hat
- **THEN** ist die Abnahme NICHT erfüllt — ein grüner Exit-Code ist kein Nachweis, dass Renovate
  gearbeitet hat; der Nachweis sind Update-PRs bzw. das Dependency-Dashboard-Issue

#### Scenario: Config nutzt keine deprecated Matcher

- **GIVEN** `renovate.json5`
- **WHEN** Renovate sie einliest
- **THEN** erscheint keine `Config needs migrating`-Warnung
- **AND** die Datei enthält keinen `"matchPackagePatterns"`-Key und keine Keycloak-Regel

#### Scenario: Fehlende App-Secrets sind als Ausfallursache erkennbar

- **GIVEN** `RENOVATE_APP_ID` oder `RENOVATE_APP_PRIVATE_KEY` ist nicht gesetzt
- **WHEN** der Workflow läuft
- **THEN** schlägt der Token-Step fehl, bevor Renovate startet — der Fehler benennt das fehlende
  App-Credential statt eines undurchsichtigen `docker … exit code 1` aus dem Renovate-Container

#### Scenario: Kein paralleler Renovate-Lauf

- **GIVEN** ein Renovate-Run ist bereits aktiv
- **WHEN** ein manueller `workflow_dispatch` getriggert wird
- **THEN** verhindert `concurrency.cancel-in-progress: false` keinen Abbruch des laufenden Jobs —
  der neue Run wartet oder startet je nach concurrency-Gruppe-Semantik
