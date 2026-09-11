## MODIFIED Requirements

### Requirement: Squash-Auto-Merge

The system SHALL automatically enable squash-auto-merge on every non-draft PR against `main`
that does **not** carry the `dependencies` label, as soon as it is opened or made ready for
review, so that the PR merges itself once all required checks and at least one approving
pull-request review satisfy branch protection. PRs carrying the `dependencies` label are
excluded because Renovate manages their auto-merge itself via `platformAutomerge`, gated by the
staged policy in `renovate.json5` (`patch` and `devDependencies` only). Without this exclusion
the blanket auto-merge would override that policy — a `major` or production `minor` bump could
merge without Renovate's intended review gate and reach both production brands through Flux
reconciliation.

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

#### Scenario: Auto-merge waits for an approval

- **GIVEN** an eligible non-draft PR has auto-merge enabled and all required
  status checks pass
- **AND** branch protection requires one approving review
- **WHEN** the PR has no approval
- **THEN** GitHub SHALL keep the PR open
- **WHEN** one approving review is submitted
- **THEN** GitHub SHALL squash-merge the PR without another manual merge action
