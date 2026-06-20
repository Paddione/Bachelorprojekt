# ci-cd

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Dieses Dokument beschreibt die CI/CD-Pipeline des Bachelorprojekt-Repositories auf Basis von GitHub Actions.
Es umfasst die PR-Gate-Checks, automatisches Deployment von Build-Artifacts, Post-Merge-Automatisierung,
Nightly-E2E, Freshness-Regenerierung, Dependency-Updates (Renovate) und Squash-Auto-Merge.

---

### Requirement: PR-Gate — Offline Tests

The system SHALL run manifest validation, kustomize structure checks, BATS unit tests, API auth
regression, freshness artifact check, and Systembrett template validation on every non-draft PR
against `main` and SHALL block merge until all checks pass.

#### Scenario: PR mit veralteten generierten Artefakten schlägt fehl

- **GIVEN** ein PR ändert Code, regeneriert aber `docs/generated/api-map.json` nicht neu
- **WHEN** der `offline-tests`-Job `task freshness:check` ausführt
- **THEN** schlägt der Schritt fehl und der Merge ist blockiert — mit einer Meldung, die `task freshness:regenerate` vorschlägt

#### Scenario: API-Auth-Regression wird erkannt

- **GIVEN** ein Endpoint verliert sein Auth-Attribut im Vergleich zu `main`
- **WHEN** `node scripts/api-auth-check.mjs --regression` läuft
- **THEN** bricht der Schritt mit Exit-Code ≠ 0 ab und blockiert den Merge

#### Scenario: Nur geänderte Offline-Tests laufen

- **GIVEN** ein PR ändert nur `brett/`-Dateien, nicht `k3d/`-Manifeste
- **WHEN** `task test:changed` ausgeführt wird
- **THEN** laufen nur die Tests, die von den geänderten Dateien abhängen — nicht die gesamte Suite

---

### Requirement: PR-Gate — Security Scan

The system SHALL scan every PR for hardcoded passwords in `k3d/*.yaml`, unencrypted tracked
secret files, and advisory-report unpinned `:latest` image tags.

#### Scenario: Hardcodiertes Passwort wird erkannt

- **GIVEN** ein `k3d/*.yaml`-File enthält `password = geheim123` (kein `secretKeyRef`)
- **WHEN** der `security-scan`-Job den Secret-Check ausführt
- **THEN** bricht der Job mit Exit-Code 1 ab und verhindert den Merge

#### Scenario: Unverschlüsselte Secret-Datei blockiert Merge

- **GIVEN** eine Datei unter `environments/.secrets/` ist ohne git-crypt-Verschlüsselung eingecheckt
- **WHEN** `bash scripts/git-crypt-guard.sh check-tracked` läuft
- **THEN** schlägt der Schritt fehl — Merge ist blockiert

#### Scenario: :latest-Tags erzeugen nur Warnung

- **GIVEN** `k3d/website.yaml` enthält `:latest` (gewollt für auto-rollout)
- **WHEN** der Image-Pinning-Check läuft
- **THEN** gibt der Job eine `WARNING`-Zeile aus, setzt aber keinen Fehler-Exit-Code (advisory only)

---

### Requirement: PR-Gate — Conventional Commits und Ticket-Tag

The system SHALL enforce that every PR title follows the Conventional Commits format (`type(scope): subject`)
and SHALL advisory-warn if no ticket tag `[T000XXX]` is present.

#### Scenario: PR-Titel ohne gültigen Typ wird abgewiesen

- **GIVEN** ein PR hat den Titel `update readme`
- **WHEN** der `commit-lint`-Job via `action-semantic-pull-request` prüft
- **THEN** schlägt der Check fehl und der Merge ist blockiert

#### Scenario: PR-Titel ohne Ticket-Tag erzeugt nur Warnung

- **GIVEN** ein PR hat den Titel `feat(website): improve hero section`
- **WHEN** der Ticket-Tag-Check ausgeführt wird
- **THEN** gibt der Schritt eine `⚠️`-Meldung aus, bricht aber nicht ab

---

### Requirement: Squash-Auto-Merge

The system SHALL automatically enable squash-auto-merge on every non-draft PR against `main`
as soon as it is opened or made ready for review, so that the PR merges itself once all
required checks pass and branch protection is satisfied.

#### Scenario: Auto-Merge wird bei PR-Öffnung aktiviert

- **GIVEN** ein neuer nicht-Draft-PR gegen `main` wird geöffnet
- **WHEN** der `auto-enable-automerge`-Workflow ausgelöst wird
- **THEN** setzt `gh pr merge --auto --squash --delete-branch` das Auto-Merge-Flag via PAT (nicht GITHUB_TOKEN)

#### Scenario: Draft-PRs werden ausgenommen

- **GIVEN** ein PR wird als Draft geöffnet
- **WHEN** der `auto-enable-automerge`-Workflow prüft `github.event.pull_request.draft`
- **THEN** überspringt der Job den `enable-automerge`-Schritt — kein Auto-Merge-Flag gesetzt

---

### Requirement: Website-Auto-Deploy bei main-Push

The system SHALL automatically build a Docker image and deploy it to the fleet cluster
for both brands (mentolder, korczewski) whenever `website/**` changes reach `main`.

#### Scenario: Website-Änderung löst Build und Rollout aus

- **GIVEN** ein Commit auf `main` ändert `website/src/pages/index.astro`
- **WHEN** der `build-website`-Workflow getriggert wird
- **THEN** baut er das Image mit `SHA_TAG` (`sha-<datum>-<short-sha>`) und `:latest`,
  pusht beide Tags nach GHCR, und führt `kubectl set image` + `rollout status --timeout=120s` aus

#### Scenario: Deployment schlägt back bei Rollout-Timeout fehl

- **GIVEN** das neue Website-Image startet nicht innerhalb von 120 Sekunden
- **WHEN** `kubectl rollout status deployment/website -n website --timeout=120s` läuft
- **THEN** gibt kubectl Exit-Code 1 zurück und der Workflow-Job schlägt fehl

---

### Requirement: Post-Merge Ticket-Lifecycle und Manifest-Deploy

The system SHALL, after every push to `main`, transition the associated ticket to
`awaiting_deploy`, deploy changed Kubernetes manifests to both fleet brands, then
transition the ticket to `done` and run the scout-drift ratchet.

#### Scenario: Ticket wird nach Merge auf awaiting_deploy gesetzt

- **GIVEN** der Merge-Commit enthält `T000123` im Commit-Body
- **WHEN** der `post-merge`-Workflow `mark-awaiting` ausführt
- **THEN** ruft er `scripts/ticket.sh update-status --status awaiting_deploy` auf; Fehler sind non-fatal

#### Scenario: Manifest-Deploy läuft nur bei manifest-relevanten Änderungen

- **GIVEN** ein Push auf `main` ändert nur `website/src/`
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` läuft
- **THEN** setzt der Schritt `manifests_changed=false` — `task workspace:deploy` wird nicht ausgeführt

#### Scenario: Ticket wird nach erfolgreichem Deploy auf done gesetzt

- **GIVEN** beide Deploy-Jobs (`ENV=mentolder` und `ENV=korczewski`) laufen erfolgreich durch
- **WHEN** der `mark-ticket-done`-Schritt ausgeführt wird
- **THEN** ruft er `scripts/ticket.sh update-status --status done` auf und
  startet anschließend `scripts/factory/scout-drift.sh` für den Drift-Ratchet

---

### Requirement: Nightly E2E gegen Fleet-Produktion

The system SHALL run the full Playwright test suite against both production brands
(`web.mentolder.de` and `web.korczewski.de`) nightly at 03:00 UTC in a parallel
matrix, and SHALL ingest test results into the website's test-tracking API.

#### Scenario: Nightly-Run testet beide Brands parallel

- **GIVEN** es ist 03:00 UTC und der cron-Trigger feuert
- **WHEN** der `e2e`-Workflow mit `strategy.matrix` für `mentolder` und `korczewski` startet
- **THEN** laufen beide Matrix-Jobs gleichzeitig mit `fail-fast: false` — ein Fehler stoppt nicht den anderen

#### Scenario: Playwright-Ergebnisse werden in Website ingested

- **GIVEN** der Playwright-Lauf ist abgeschlossen (pass oder fail)
- **WHEN** der `Ingest`-Schritt mit `E2E_INGEST_TOKEN` läuft
- **THEN** sendet er ein POST-Request mit dem JSON-Report an `/api/admin/tests/ingest-e2e`
  und setzt nur eine `::warning::` bei HTTP ≠ 200 — der Workflow-Status bleibt unberührt

---

### Requirement: Freshness-Auto-Regenerierung nach main-Push

The system SHALL regenerate all stale generated artifacts (API-Map, repo-index, architecture HTML)
after every push to `main` and SHALL commit and push the regenerated files if any changed,
using a dedicated bot identity.

#### Scenario: Veraltete Artefakte werden automatisch committet

- **GIVEN** `task freshness:regenerate` produziert Änderungen in `docs/generated/`
- **WHEN** `git diff --quiet` zeigt `changed=true`
- **THEN** committet der Bot (`github-actions[bot]`) mit `chore: auto-regenerate freshness artifacts`
  und pusht direkt auf `main` via `GH_PAT`

#### Scenario: Keine Änderungen — kein leerer Commit

- **GIVEN** alle generierten Artefakte sind bereits aktuell
- **WHEN** `git diff --quiet` zeigt `changed=false`
- **THEN** überspringt der Workflow den Commit-Schritt — kein leerer Commit entsteht

---

### Requirement: Dependency-Update via Renovate (selbstgehostet)

The system SHALL run self-hosted Renovate weekly (montags 07:00 UTC) to open PRs
for outdated dependencies, using a dedicated GitHub App token — nie `GITHUB_TOKEN`.

#### Scenario: Renovate öffnet Dependency-Update-PR

- **GIVEN** eine neue Version von `actions/checkout` ist verfügbar
- **WHEN** Renovate montags um 07:00 UTC läuft
- **THEN** öffnet Renovate einen PR mit dem gepinnten SHA-Digest-Update gemäß `renovate.json5`

#### Scenario: Kein paralleler Renovate-Lauf

- **GIVEN** ein Renovate-Run ist bereits aktiv
- **WHEN** ein manueller `workflow_dispatch` getriggert wird
- **THEN** verhindert `concurrency.cancel-in-progress: false` keinen Abbruch des laufenden Jobs —
  der neue Run wartet oder startet je nach concurrency-Gruppe-Semantik
