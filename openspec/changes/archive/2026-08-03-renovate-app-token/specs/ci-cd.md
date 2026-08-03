# ci-cd — Delta (renovate-app-token, T002161)

## MODIFIED Requirements

### Requirement: Dependency-Update via Renovate (selbstgehostet)

The system SHALL run self-hosted Renovate weekly (montags 07:00 UTC) to open PRs for outdated
dependencies, authenticating via a **per-run minted GitHub App installation token** — never
`GITHUB_TOKEN`, and never a statically stored installation token. Because a GitHub App
installation token expires after one hour, the workflow SHALL mint a fresh token on every run
using a SHA-pinned `actions/create-github-app-token` step whose `app-id` and `private-key`
inputs read the long-lived secrets `RENOVATE_APP_ID` and `RENOVATE_APP_PRIVATE_KEY`. The
App installation SHALL carry the `Workflows: write` permission in addition to Contents and
Pull requests, because the `github-actions` manager with `pinDigests: true` modifies files under
`.github/workflows/`.

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

### Requirement: Squash-Auto-Merge

The system SHALL automatically enable squash-auto-merge on every non-draft PR against `main`
that does **not** carry the `dependencies` label, as soon as it is opened or made ready for
review, so that the PR merges itself once all required checks pass and branch protection is
satisfied. PRs carrying the `dependencies` label are excluded because Renovate manages their
auto-merge itself via `platformAutomerge`, gated by the staged policy in `renovate.json5`
(`patch` and `devDependencies` only). Without this exclusion the blanket auto-merge would
override that policy — `main` requires no reviews, so a `major` or production `minor` bump would
merge unreviewed and reach both production brands through Flux reconciliation.

#### Scenario: Auto-Merge wird bei PR-Öffnung aktiviert

- **GIVEN** ein neuer nicht-Draft-PR gegen `main` ohne `dependencies`-Label wird geöffnet
- **WHEN** der `auto-enable-automerge`-Workflow ausgelöst wird
- **THEN** setzt `gh pr merge --auto --squash --delete-branch` das Auto-Merge-Flag via PAT (nicht GITHUB_TOKEN)

#### Scenario: Draft-PRs werden ausgenommen

- **GIVEN** ein PR wird als Draft geöffnet
- **WHEN** der `auto-enable-automerge`-Workflow prüft `github.event.pull_request.draft`
- **THEN** überspringt der Job den `enable-automerge`-Schritt — kein Auto-Merge-Flag gesetzt

#### Scenario: Renovate-PRs werden per Label ausgenommen

- **GIVEN** Renovate öffnet einen PR und labelt ihn gemäß `renovate.json5` mit `dependencies`
- **WHEN** der `auto-enable-automerge`-Workflow seine `if:`-Bedingung auswertet
- **THEN** überspringt der Job den `enable-automerge`-Schritt
- **AND** die Ausnahme greift label-basiert, nicht über `pull_request.user.login` — der App-Slug
  hängt am frei gewählten App-Namen und wäre eine stille Bruchstelle beim Umbenennen

#### Scenario: Renovate setzt Auto-Merge nur im Rahmen seiner Policy

- **GIVEN** `platformAutomerge: true` ist in `renovate.json5` gesetzt
- **WHEN** Renovate einen `patch`- oder `devDependencies`-PR öffnet
- **THEN** aktiviert Renovate selbst das Auto-Merge-Flag
- **AND** bei `major`, produktiven `minor`- oder kubernetes-`major`-Updates bleibt der PR als
  offener Review-PR ohne Auto-Merge stehen
