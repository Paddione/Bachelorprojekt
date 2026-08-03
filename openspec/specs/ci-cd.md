# ci-cd

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Dieses Dokument beschreibt die CI/CD-Pipeline des Bachelorprojekt-Repositories auf Basis von GitHub Actions.
Es umfasst die PR-Gate-Checks, automatisches Deployment von Build-Artifacts, Post-Merge-Automatisierung,
Nightly-E2E, Freshness-Regenerierung, Dependency-Updates (Renovate) und Squash-Auto-Merge.

---

## Requirements

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

### Requirement: PR-Gate — Vitest (website) mit `--changed` Smart-Selection

The system SHALL run Vitest unit tests on every non-draft PR against `main` using
`pnpm vitest run --changed --coverage` (mirrors the local `task test:changed` smart
selection) and SHALL keep the `Vitest line coverage gate (>= 60% on src/lib)` as a
required check that reports green on chore / config-only PRs even when no `website/`
files were touched.

The `vitest-website` job SHALL stay present and required on every PR (no job-level
path filter) so branch protection's `Vitest (website)` check always reports — the
smart selection happens inside the `pnpm vitest run` command, not at the workflow
level.

#### Scenario: Chore-PR ohne website-Änderungen besteht Vitest-Gate

- **GIVEN** ein PR ändert nur `openspec/` und `AGENTS.md` (keine Datei unter `website/`)
- **WHEN** der `vitest-website`-Job `pnpm exec vitest run --changed --coverage` ausführt
- **THEN** beendet Vitest mit Exit-Code 0 (keine Tests, da keine `website/`-Diffs seit `origin/main`)
- **THEN** schreibt `coverage/coverage-summary.json` mit `pct: "Unknown"` (kein Source-Coverage-Sample)
- **THEN** der Coverage-Gate-Schritt erkennt `pct: "Unknown"`, gibt `::notice::Coverage pct: Unknown (--changed found no website/ changes) — skipping gate` aus und beendet sich mit Exit-Code 0

#### Scenario: Website-Feature-PR läuft nur betroffene Tests

- **GIVEN** ein PR ändert `website/src/lib/auth/magic-link.ts` und `website/src/lib/auth/magic-link.test.ts`
- **WHEN** der `vitest-website`-Job `pnpm exec vitest run --changed --coverage` ausführt
- **THEN** läuft nur `magic-link.test.ts` (und ggf. transitiv abhängige Tests), nicht die vollen ~243 Vitest-Dateien
- **THEN** schreibt `coverage/coverage-summary.json` einen realen `pct`-Wert für `src/lib/auth/magic-link.ts`
- **THEN** der Coverage-Gate-Schritt wertet diesen Wert aus und blockt den Merge bei `< 60 %`

#### Scenario: Vitest-Befehl bleibt required Check auf jedem PR

- **GIVEN** der `Vitest (website)`-Check ist als required Check in der Branch-Protection konfiguriert
- **WHEN** ein chore-PR geöffnet wird, der keine `website/`-Dateien berührt
- **THEN** läuft der `vitest-website`-Job trotzdem und reported grün — der Check ist nicht "skipped" / "missing"

---

### Requirement: PR-Gate — E2E PR mit Changed-Spec-Selection

The system SHALL run Playwright E2E on a PR only when E2E-relevant files (`website/`,
`tests/e2e/`, `.github/workflows/e2e-pr.yml`) changed, and WHEN running, SHALL also
include any spec files changed in `tests/e2e/specs/*.spec.ts` as positional arguments
to `npx playwright test` in addition to the tag-based grep filter.

#### Scenario: Chore-PR ohne E2E-relevante Änderungen überspringt E2E

- **GIVEN** ein PR ändert nur `openspec/` und `scripts/` (keine Datei unter `website/`, `tests/e2e/`, oder `.github/workflows/e2e-pr.yml`)
- **WHEN** der `e2e-pr`-Job den `Check if E2E-relevant files changed`-Schritt ausführt
- **THEN** setzt er `run_e2e=false` und alle nachfolgenden Schritte (Install, Playwright, Upload, Kommentar) werden mit `if: steps.filter.outputs.run_e2e == 'true'` übersprungen

#### Scenario: Website-Feature-PR läuft Tag-gefilterte E2E-Suite

- **GIVEN** ein PR mit Branch `feature/content-hub-foo` ändert `website/src/pages/coaching.astro` (keine Spec-Datei)
- **WHEN** der `e2e-pr`-Job den `Leite Feature-Tag aus Branch-Name ab`-Schritt ausführt
- **THEN** leitet er `TAG=content-hub` und `GREP_PATTERN=@content-hub|@smoke` ab
- **THEN** ruft `npx playwright test --grep "@content-hub|@smoke"` auf (keine zusätzlichen positional args, da `CHANGED_SPECS` leer ist)

#### Scenario: PR mit geänderter Spec-Datei läuft Tag-Grep + die geänderte Spec

- **GIVEN** ein PR ändert `tests/e2e/specs/fa-30-cockpit.spec.ts` und `website/src/pages/cockpit.astro`
- **WHEN** der `e2e-pr`-Job den `Detect changed E2E spec files`-Schritt ausführt
- **THEN** setzt er `changed_specs=specs/fa-30-cockpit.spec.ts` (Prefix `tests/e2e/` gestrippt, damit es zum `testDir: ./specs` der Config passt)
- **THEN** ruft der Playwright-Schritt `npx playwright test --grep "<tag-pattern>" specs/fa-30-cockpit.spec.ts` auf — die geänderte Spec läuft zusätzlich zur Tag-gefilterten Suite

#### Scenario: PR mit nur Spec-Änderungen läuft die Spec + Smoke

- **GIVEN** ein PR ändert nur `tests/e2e/specs/fa-12-mcp.spec.ts` (kein `website/`-Code)
- **WHEN** der `e2e-pr`-Job den `Check if E2E-relevant files changed`-Schritt ausführt
- **THEN** triggert der Match auf `tests/e2e/` und setzt `run_e2e=true`
- **THEN** läuft Playwright mit dem Smoke-Grep (kein Feature-Tag ableitbar) + die geänderte Spec

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

#### Scenario: Post-Run-Purge läuft auch nach Timeout/Crash des Playwright-Steps

- **GIVEN** der `e2e`-Workflow ruft `npx playwright test` direkt auf (nicht über
  `task test:e2e`, das einen eigenen Pre-/Post-Run-curl-Purge als
  Defense-in-Depth hat) und der Job hat ein `timeout-minutes`-Limit
- **WHEN** der Playwright-Step durch den Job-Timeout gekillt wird oder anderweitig
  abstürzt, bevor sein in-process `globalTeardown`-Hook feuert
- **THEN** läuft danach trotzdem ein `if: always()`-Schritt, der
  `POST /api/admin/systemtest/purge-all-test-data` mit `X-Cron-Secret: $CRON_SECRET`
  gegen die Matrix-`website_url` aufruft, sodass `is_test_data=true`-Zeilen aus
  einem abgebrochenen Lauf nicht in Prod liegen bleiben (G-E2E02, T002096)

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

### Requirement: Website-Deploy via kubectl set image mit dynamischem SHA_TAG

The system SHALL repoint the `website` Deployment to the freshly built image using
`kubectl set image deployment/website website=<IMAGE>:<SHA_TAG>` — never via `rollout restart` —
so that an immutable `@sha256`-pinned Deployment is guaranteed to receive the new code.

#### Scenario: Deploy repoints Deployment via set image mit SHA_TAG-Variable

- **GIVEN** der `build-website`-Workflow baut ein Image und exportiert `IMAGE` und `SHA_TAG` nach `$GITHUB_ENV`
- **WHEN** der Deploy-Schritt ausgeführt wird
- **THEN** enthält der Workflow-Schritt `kubectl set image deployment/website website=` mit einem Verweis auf `${SHA_TAG}` oder `${IMAGE}` (keine statische Referenz)
- **AND** `rollout restart` darf NICHT als einziger Deployment-Trigger verwendet werden

#### Scenario: Rollout-Status-Wait folgt dem set image (Regression-Guard)

- **GIVEN** `kubectl set image` wurde für den `website`-Deployment ausgeführt (sowohl mentolder als auch korczewski Workflow)
- **WHEN** der nachfolgende Schritt ausgeführt wird
- **THEN** ruft jeder der beiden Workflows `kubectl rollout status deployment/website` auf, um auf erfolgreichen Abschluss zu warten

---

### Requirement: Website-Namespace domain-config-Overlay-Vollständigkeit

The system SHALL provide a shared `domain-config` ConfigMap overlay for the `website` namespace
that carries every key referenced via `configMapKeyRef` in `k3d/website.yaml`, carries no
hardcoded `namespace`, and is referenced in both brand overlays (mentolder and korczewski).

#### Scenario: Geteilte domain-config ConfigMap ist vollständig und namespace-frei

- **GIVEN** `k3d/website.yaml` referenziert Keys aus der `domain-config` ConfigMap via `configMapKeyRef`
- **WHEN** `prod-fleet/website-common/domain-config.yaml` geprüft wird
- **THEN** enthält die Datei jeden dieser Keys, trägt den Namen `domain-config` (passend zum `configMapKeyRef`), und enthält kein `namespace:`-Feld auf Metadaten-Ebene

#### Scenario: Beide Brand-Overlays referenzieren die geteilte domain-config

- **GIVEN** die brand-spezifischen Kustomize-Overlays `prod-fleet/website-mentolder/` und `prod-fleet/website-korczewski/`
- **WHEN** deren `kustomization.yaml` geprüft wird
- **THEN** verweisen beide auf `../website-common/domain-config.yaml` als Resource

---

### Requirement: MEDIAVIEWER_HOST-Parität zwischen website-common und prod-Overlay

The system SHALL ensure that the `MEDIAVIEWER_HOST` expression in the shared website
`domain-config` ConfigMap matches exactly the expression in `prod/configmap-domains.yaml`
and SHALL derive the value from `${PROD_DOMAIN}` without any hardcoded brand domain.

#### Scenario: MEDIAVIEWER_HOST stimmt mit prod-ConfigMap überein

- **GIVEN** `prod-fleet/website-common/domain-config.yaml` und `prod/configmap-domains.yaml` sind beide vorhanden
- **WHEN** der `MEDIAVIEWER_HOST`-Wert aus beiden Dateien verglichen wird
- **THEN** sind die Werte identisch — kein Drift zwischen website-ns-Pfad und workspace-ns-Pfad

#### Scenario: MEDIAVIEWER_HOST verwendet ${PROD_DOMAIN}-Variable, keine hardcodierten Domains

- **GIVEN** `prod-fleet/website-common/domain-config.yaml` definiert den `MEDIAVIEWER_HOST`-Key
- **WHEN** der Wert des Keys geprüft wird
- **THEN** hat er die Form `"mediaviewer.${PROD_DOMAIN}"` — kein hardcodierter Brand-Name und kein S3-Hostname

---

### Requirement: Lazy npm ci Guard in Test-Tasks vor Node-Skript-Aufrufen

The system SHALL ensure that every Taskfile task invoking a third-party-importing Node.js
script includes a lazy dependency install guard (`[ -d node_modules ] || npm ci`) that
executes before any `node` call, so that the offline test suite succeeds on fresh worktrees
without a prior `npm ci`.

#### Scenario: test:agent-guide installiert Node-Deps vor dem node-Aufruf

- **GIVEN** ein frischer Worktree ohne `node_modules/` (z.B. via `scripts/worktree-create.sh`)
- **WHEN** `task test:agent-guide` aufgerufen wird
- **THEN** führt der Task zuerst `[ -d node_modules ] || npm ci` aus — und erst danach den `node`-Aufruf — sodass fehlende Packages nicht zu `ERR_MODULE_NOT_FOUND` führen

#### Scenario: test:docs-gen enthält ebenfalls den Lazy-Install-Guard

- **GIVEN** `Taskfile.yml` enthält den Task `test:docs-gen` der einen `node`-Aufruf enthält
- **WHEN** der Task-Block analysiert wird
- **THEN** steht der `[ -d node_modules ] || npm ci`-Guard auf einer früheren Zeile als der erste `node`-Aufruf im selben Task-Block

---

### Requirement: Docs-Content-Linting auf veraltete und verbotene Inhalte

The system SHALL lint the documentation source in `k3d/docs-content/` and reject any
references to decommissioned services (Mattermost, InvoiceNinja, Stripe) or stale
cluster-topology wording, and SHALL enforce sidebar link integrity.

#### Scenario: Verbotene Service-Referenzen im Docs-Content werden erkannt

- **GIVEN** eine Markdown-Datei unter `k3d/docs-content/` enthält den Text `Mattermost`, `InvoiceNinja` oder `Stripe` (außer in `decisions.md`)
- **WHEN** der `test-docs-content`-BATS-Test läuft
- **THEN** schlägt der entsprechende Test fehl und gibt den Dateinamen mit dem verbotenen Verweis aus

#### Scenario: Veraltete Cluster-Topologie-Bezeichnungen werden abgewiesen

- **GIVEN** eine Docs-Datei (außer `decisions.md`) enthält `korczewski-Cluster`, `separater Cluster` oder `separates Cluster`
- **WHEN** der Lint-Test ausgeführt wird
- **THEN** schlägt der Test fehl — die Begriffe sind seit der Fleet-Konsolidierung veraltet und dürfen nicht mehr erscheinen

---

### Requirement: Docs-Sidebar-Integrität und Brand-Switch-Shell

The system SHALL ensure that every link in `k3d/docs-content/_sidebar.md` resolves to an
existing Markdown file, that the sidebar starts with a Quickstarts group containing all three
required links, and that the docs shell HTML sets `data-brand` from the hostname for both brands.

#### Scenario: Jeder Sidebar-Link hat eine backing Markdown-Datei

- **GIVEN** `k3d/docs-content/_sidebar.md` enthält Links der Form `](page-name)`
- **WHEN** für jeden extrahierten Zieldateinamen `k3d/docs-content/<name>.md` geprüft wird
- **THEN** existiert jede referenzierte Datei — kein toter Link in der Sidebar

#### Scenario: Docs-Shell setzt data-brand dynamisch für beide Brands

- **GIVEN** `docs-site/index.html` ist die Shell-HTML-Datei des Docs-Deployments
- **WHEN** der Inhalt der Datei geprüft wird
- **THEN** enthält die Datei `data-brand`, setzt CSS-Token-Blöcke für `data-brand="mentolder"` und `data-brand="korczewski"`, und referenziert `hostname`-basierte Logik für das Brand-Switching

---

### Requirement: Docs-Content-Vollständigkeit — Mermaid-Diagramme und Glossar

The system SHALL ensure that every service page in the docs carries at least one Mermaid
architecture diagram, and that `glossary.md` and `decisions.md` both exist and contain
more than 30 lines of substantive content.

#### Scenario: Jede Service-Seite enthält mindestens einen Mermaid-Block

- **GIVEN** die Docs-Seiten `keycloak.md`, `nextcloud.md`, `collabora.md`, `talk-hpb.md`, `livestream.md`, `einvoice.md`, `claude-code.md`, `vaultwarden.md`, `website.md`, `whiteboard.md`, `mailpit.md`, `monitoring.md`, `shared-db.md`
- **WHEN** jede Datei auf das Vorhandensein von ` ```mermaid` geprüft wird
- **THEN** enthält jede Seite mindestens einen Mermaid-Block — fehlt er, schlägt der Test fehl mit dem Dateinamen

#### Scenario: Glossar und Decisions sind nicht-trivial befüllt

- **GIVEN** `k3d/docs-content/glossary.md` und `k3d/docs-content/decisions.md` existieren
- **WHEN** Größe und Zeilenanzahl beider Dateien geprüft werden
- **THEN** sind beide Dateien nicht-leer und enthalten jeweils mehr als 30 Zeilen Inhalt

---

### Requirement: Art-Library-Manifest-Validierung

The system SHALL validate every art-library set's `manifest.json` against the JSON Schema
and SHALL ensure every referenced SVG asset file exists on disk, and each brand set
contains at least one asset of each required kind (character, prop, terrain, logo).

#### Scenario: Art-Library-Validator läuft fehlerfrei durch

- **GIVEN** alle `manifest.json`-Dateien unter `art-library/sets/` sind vorhanden
- **WHEN** `node art-library/_tooling/validate-manifest.mjs` ausgeführt wird
- **THEN** beendet sich das Skript mit Exit-Code 0 — alle Manifeste sind schema-konform und jede referenzierte SVG-Datei existiert auf dem Dateisystem

#### Scenario: Korczewski-Set enthält alle Pflicht-Asset-Arten

- **GIVEN** `art-library/sets/korczewski/manifest.json` ist die Manifest-Datei des Korczewski-Brand-Sets
- **WHEN** die Assets nach `kind` gefiltert werden
- **THEN** enthält das Set mindestens je ein Asset der Arten `character`, `prop`, `terrain` und `logo`

---

### Requirement: Kubernetes-Abhängigkeitsgraph-Generierung (build-graph.mjs)

The system SHALL generate a valid dependency graph of all Kubernetes services via
`node scripts/build-graph.mjs` that produces `docs/generated/graph.json` with at least
20 nodes, 60 edges, and a `generatedAt` timestamp.

#### Scenario: build-graph.mjs erzeugt vollständigen graph.json

- **GIVEN** das Skript `scripts/build-graph.mjs` ist vorhanden
- **WHEN** `node scripts/build-graph.mjs` ausgeführt wird
- **THEN** beendet es sich mit Exit-Code 0, schreibt `docs/generated/graph.json` mit mindestens 20 Nodes (inkl. `shared-db` und `keycloak`) und mindestens 60 Kanten, und setzt ein nicht-leeres `generatedAt`-Feld

#### Scenario: graph.json enthält edges-Array (auch wenn leer)

- **GIVEN** `build-graph.mjs` ist ausgeführt worden
- **WHEN** `docs/generated/graph.json` mit `jq` abgefragt wird
- **THEN** existiert das Feld `.edges` als Array (Länge ≥ 0) — das Feld darf nicht fehlen

---

### Requirement: Freshness-Gate für generierte Graph-Artefakte

The system SHALL enforce that the committed `docs/generated/graph.json` and
`docs/generated/api-map.json` match the freshly generated output (same node/endpoint count),
and SHALL require `api-map.json` to contain at least 15 API endpoints.

#### Scenario: Committed graph.json hat dieselbe Node-Anzahl wie frisch generierter Output

- **GIVEN** `docs/generated/graph.json` ist in `HEAD` committed
- **WHEN** `build-graph.mjs` erneut ausgeführt und die Node-Anzahl verglichen wird
- **THEN** stimmt die Node-Anzahl des committed Artefakts mit der des frisch generierten überein — andernfalls schlägt der Freshness-Check fehl

#### Scenario: api-map.json enthält ausreichend Endpoints und gültigen Timestamp

- **GIVEN** `scripts/build-api-map.mjs` ist ausgeführt worden
- **WHEN** `docs/generated/api-map.json` mit `jq` ausgewertet wird
- **THEN** enthält `.endpoints` mindestens 15 Einträge und `.generatedAt` ist ein nicht-leerer, nicht-`null`-Wert

---

### Requirement: CONFLICTING PR Status unterdrückt alle CI-Runs

The system SHALL NOT create any `pull_request` workflow runs when a PR is in `CONFLICTING`
merge state, because GitHub cannot build a merge ref for a conflicting PR — what appears as
"CI hasn't started yet" is a conflict blocker, not a pipeline delay.

#### Scenario: CONFLICTING-Status verhindert Workflow-Erstellung

- **GIVEN** ein PR hat `mergeStateStatus: CONFLICTING` (verifizierbar via `gh pr view <N> --json mergeStateStatus`)
- **WHEN** ein neuer Push auf den PR-Branch erfolgt
- **THEN** erstellt GitHub keinen `pull_request`-Workflow-Run — CI erscheint nie als "in progress" oder "queued"
- **AND** der Konflikt muss lokal mit `git fetch origin main && git rebase origin/main` aufgelöst und gepusht werden, bevor CI startet

#### Scenario: Nach Konfliktauflösung startet CI automatisch

- **GIVEN** ein PR war in `CONFLICTING`-Status und hatte keine CI-Runs
- **WHEN** der Entwickler den Konflikt behebt (`git rebase origin/main`) und den Branch pusht
- **THEN** erstellt GitHub einen neuen `pull_request`-Workflow-Run und CI startet normal

---

### Requirement: Generierte Artefakte sind Konflikt-Magnete — Auflösung via git checkout --ours

The system SHALL resolve merge conflicts on auto-regenerated artifacts (`docs/generated/**`,
`docs/code-quality/repo-index.json`, `k3d/docs-content-built/architecture/index.html`) by
running `git checkout --ours <file>` for each conflicting file during rebase, because these
files are regenerated by `freshness-regen.yml` after every main push and the PR-branch version
is always stale relative to main.

The `merge=ours` attribute SHALL be understood as a **local-only** resolution. GitHub does not
execute custom merge drivers server-side, so the same artifacts that resolve silently during a
local rebase still surface as a conflicting merge state on the PR. A locally clean merge tree
therefore does NOT disprove a conflict reported by GitHub, and the two observations MUST NOT be
treated as contradictory evidence.

#### Scenario: Freshness-Regen erzeugt Rebase-Konflikt auf generiertem Artefakt

- **GIVEN** ein PR committed `docs/generated/graph.json` neu und `freshness-regen.yml` hat nach dem letzten main-Push dieselbe Datei automatisch neu committet
- **WHEN** der Entwickler `git rebase origin/main` auf dem PR-Branch ausführt
- **THEN** entsteht ein Merge-Konflikt in `docs/generated/graph.json`
- **AND** die korrekte Auflösung ist `git checkout --ours docs/generated/graph.json && git add docs/generated/graph.json` — nicht manuelles Mergen

#### Scenario: .gitattributes merge=ours-Driver automatisiert die Auflösung

- **GIVEN** `task secrets:install-hooks` wurde ausgeführt und hat `git config merge.ours.driver true` gesetzt
- **WHEN** `git rebase origin/main` auf einem Branch läuft, der mit einem Freshness-Regen-Commit konfligiert
- **THEN** wendet Git den `merge=ours`-Driver aus `.gitattributes` automatisch an und löst den Konflikt zugunsten des PR-Branch auf — kein manueller `git checkout --ours` nötig

#### Scenario: Derselbe Driver wirkt auf GitHub nicht — Phantom-Konflikt

- **GIVEN** ein PR berührt eines der 21 in `.gitattributes` mit `merge=ours` markierten Artefakte,
  und dasselbe Artefakt wurde auf `main` ebenfalls regeneriert
- **WHEN** `git merge origin/main` lokal ohne Konflikt durchläuft, `gh pr view <N> --json mergeStateStatus`
  aber `DIRTY` oder `CONFLICTING` meldet
- **THEN** ist das kein Widerspruch und kein Fehler in `.gitattributes`: GitHub führt serverseitig
  keine Custom-Merge-Driver aus und sieht einen gewöhnlichen Inhaltskonflikt
- **AND** die Auflösung ist, den Branch auf `main` nachzuziehen und die Artefakte danach mit
  `task freshness:regenerate` gegen den neuen Stand neu zu erzeugen

#### Scenario: gh pr update-branch ist nicht in jeder CLI-Version vorhanden

- **GIVEN** das Runbook nennt `gh pr update-branch <N>` als Weg, den PR-Branch nachzuziehen
- **WHEN** eine `gh`-Version ohne dieses Subkommando aufgerufen wird (verifiziert mit 2.45.0)
- **THEN** gibt der Aufruf die generische `gh pr`-Hilfe aus, ohne den Branch zu aktualisieren,
  und muss durch den REST-Aufruf `PUT repos/{owner}/{repo}/pulls/{n}/update-branch` mit
  `expected_head_sha` ersetzt werden
- **AND** `expected_head_sha` stammt aus `gh pr view <N> --json headRefOid`, nicht aus einem
  lokalen `git rev-parse HEAD` — der lokale Branch kann veraltet sein

### Requirement: E2E PR ist kein Required Check — Auto-Merge wird nicht blockiert

The system SHALL NOT block auto-merge on the `E2E PR` workflow result; the E2E workflow
(`e2e-pr.yml`) runs informatively on every PR and reports its status as a warning annotation,
but is NOT listed as a required branch-protection check for `main`.

#### Scenario: Fehlgeschlagener E2E PR-Check blockiert Auto-Merge nicht

- **GIVEN** der `E2E PR`-Workflow schlägt auf einem PR fehl (roter Check)
- **WHEN** alle anderen required Checks bestehen (`Offline Tests`, `Security Scan`, `Brett TypeScript`, `Vitest`, `Conventional Commits`)
- **THEN** startet Auto-Merge und der PR wird gemergt — trotz rotem E2E-Check

#### Scenario: E2E kann als required Check notfallmäßig wiederhergestellt werden

- **GIVEN** die Produktionsstabilität erfordert, E2E wieder als required Check zu aktivieren
- **WHEN** `task gh:branch-protection:emergency-add-e2e` ausgeführt oder die GitHub Settings UI (`Settings → Branches → main`) aufgerufen wird
- **THEN** ist `E2E PR` wieder ein required Check und blockiert Auto-Merge bei Fehlschlag

---

### Requirement: Kein yamllint/shellcheck/kubeconform in CI — nur task test:all

The system SHALL NOT run yamllint, shellcheck, or kubeconform as part of the CI pipeline;
the current `ci.yml` runs only `task test:all`. Developers who want YAML or shell lint
feedback SHALL run these tools locally before pushing, as they are not enforced by CI.

#### Scenario: PR ohne YAML-Lint-Fehler geht durch CI — unabhängig von yamllint

- **GIVEN** ein PR enthält YAML-Dateien mit yamllint-Warnungen (z.B. trailing spaces, fehlende Newline)
- **WHEN** der `ci.yml`-Workflow auf dem PR läuft
- **THEN** schlägt kein CI-Job wegen yamllint fehl — `task test:all` prüft keine YAML-Stilkonventionen

#### Scenario: Shellcheck-Fehler in Skripten werden lokal erkannt, nicht durch CI

- **GIVEN** ein PR enthält ein `scripts/`-Bash-Skript mit Shellcheck-Befunden (z.B. unquoted variables)
- **WHEN** `task test:all` im CI-Job läuft
- **THEN** läuft kein Shellcheck-Schritt — der PR geht durch CI ohne Shellcheck-Fehlschlag
- **AND** Shellcheck-Feedback ist nur lokal verfügbar (`shellcheck scripts/foo.sh`)

---

### Requirement: Post-merge Freshness-Regenerierung ohne externe GPG-Action

The system SHALL regenerate stale artifacts after every push to `main` and commit them using
the native `github-actions[bot]` identity — WITHOUT any external GPG-signing action
(`crazy-max/ghaction-import-gpg` or equivalent). GPG-signing SHALL NOT be configured in
`freshness-regen.yml`; the bot commit uses unsigned commits via the standard git user.name/email config.

#### Scenario: G-CI01-A: freshness-regen.yml enthält keinen GPG-Action-Verweis *(BATS)*

- **GIVEN** `.github/workflows/freshness-regen.yml` ist vorhanden
- **WHEN** die Datei auf `ghaction-import-gpg` durchsucht wird
- **THEN** enthält die Datei keinen solchen Verweis — der GPG-Schritt ist vollständig entfernt

---

### Requirement: Website Dockerfile verwendet pnpm als Package-Manager

The system SHALL build the website Docker image using pnpm@10 (`pnpm install --frozen-lockfile`)
instead of npm ci, referencing `pnpm-lock.yaml` for reproducible installs. The build SHALL use
`pnpm build` and `pnpm prune --prod` instead of their npm equivalents.
`website/package-lock.json` SHALL NOT exist; `website/pnpm-lock.yaml` SHALL exist.

#### Scenario: G-CI01-B: Dockerfile COPY-Zeile referenziert pnpm-lock.yaml *(BATS)*

- **GIVEN** `website/Dockerfile` ist vorhanden
- **WHEN** die COPY-Zeile für das Lockfile geprüft wird
- **THEN** referenziert sie `pnpm-lock.yaml` — kein `package-lock.json`

#### Scenario: G-CI01-C: Dockerfile nutzt pnpm install --frozen-lockfile *(BATS)*

- **GIVEN** `website/Dockerfile` ist vorhanden
- **WHEN** die Datei auf den Install-Befehl geprüft wird
- **THEN** enthält sie `pnpm install --frozen-lockfile` — kein `npm ci`

#### Scenario: G-CI01-D: pnpm-lock.yaml existiert; package-lock.json existiert nicht *(BATS)*

- **GIVEN** das `website/`-Verzeichnis ist ausgecheckt
- **WHEN** die Lockfile-Dateien geprüft werden
- **THEN** existiert `website/pnpm-lock.yaml` und `website/package-lock.json` existiert NICHT

---

### Requirement: website ESLint fail-closed gate stays enforced

The `website/` ESLint flat config (`website/eslint.config.js`) SHALL set
`@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` to `error`
severity, and `website/package.json`'s `lint`/`lint:fix` scripts SHALL invoke ESLint with
`--max-warnings 0`, so that any future warning regression fails the PR-gate ESLint CI step
("Run ESLint (--max-warnings 0 fail-closed gate)" in the `vitest-website` job) instead of
being silently downgraded to a non-blocking warning.

#### Scenario: lint script enforces zero warnings

- **GIVEN** `website/package.json` is checked out
- **WHEN** the `scripts.lint` entry is read
- **THEN** it invokes `eslint . --max-warnings 0`

#### Scenario: no-explicit-any and no-unused-vars are errors, not warnings

- **GIVEN** `website/eslint.config.js` is checked out
- **WHEN** the `rules` block is read
- **THEN** `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` are both
  set to `'error'` (the latter with `argsIgnorePattern: '^_'` / `varsIgnorePattern: '^_'`)

#### Scenario: ESLint runs clean

- **GIVEN** `website/` dependencies are installed (`pnpm install`)
- **WHEN** `pnpm --prefix website lint` runs
- **THEN** it exits 0 with zero errors and zero warnings

### Requirement: validate-commit-message-before-push

The system SHALL validate every commit message against conventional-commit rules (type(scope): subject) before allowing a push to any remote branch.

#### Scenario: Push with non-conventional commit is rejected

- **GIVEN** a local commit with a non-conventional subject line (e.g. "Betreff: Test")
- **WHEN** the user runs `git push`
- **THEN** the pre-push hook runs `scripts/validate-commit-msg.sh` and rejects the push with exit code 1

#### Scenario: Push with conventional commits succeeds

- **GIVEN** a local commit with a valid conventional-commit message (e.g. "fix(ops): correct commit-lint scope [T001356]")
- **WHEN** the user runs `git push`
- **THEN** the pre-push hook passes and the push proceeds

### Requirement: ci-commit-message-validation

The system SHALL validate all commit messages in a PR (range `origin/main..HEAD`) as part of the CI `commit-lint` job when the event is `pull_request`.

#### Scenario: PR with non-conventional commits fails CI

- **GIVEN** a PR containing a commit with subject "Betreff: irgendwas"
- **WHEN** CI runs the `commit-lint` job
- **THEN** the job fails and reports which commit messages are invalid

### Requirement: commit-vs-diff-consistency-guard

The system SHALL reject any commit whose subject uses an implementation type (`fix`, `feat`, `refactor`, `perf`, including the breaking-change marker `!`) but whose staged diff contains only test/spec/plan artifacts (no production-code change). The guard is implemented as `scripts/check-commit-vs-diff.sh` wired into the `.githooks/commit-msg` hook (blockierend) and mirrored into the CI `commit-lint` job (catches bypasses).

**Background (T001434-mishap, 2026-07-02):** a dev-flow-plan stage commit used
`fix(infra): chain loggingMiddleware in middleware.ts via sequence() [T001434]` as its
title, but the diff only contained the RED integration test plus plan artifacts. The
next implementer (dev-flow-execute) trusted the title and skipped the actual fix; the
bug landed in a follow-up commit instead of the same PR. The dev-flow-plan SKILL.md
now mandates `chore(plans):` for plan-stage commits; this guard is the belt-and-suspenders
backstop for any future SKILL-deviation or human bypass.

#### Scenario: Plan-stage commit with implementation-type subject is blocked

- **GIVEN** a developer runs `git add openspec/changes/<slug>/ website/src/middleware.test.ts`
- **AND** the commit message is `fix(infra): chain loggingMiddleware in middleware.ts via sequence() [T001434]`
- **WHEN** `git commit` is invoked
- **THEN** the `commit-msg` hook runs `scripts/check-commit-vs-diff.sh`
- **AND** the hook rejects the commit with exit code 1
- **AND** the error message references the T001434 mishap pattern
- **AND** the error message suggests `test(red):` or `chore(plan):` as the correct prefixes

#### Scenario: Implementation commit with real production code passes

- **GIVEN** a developer runs `git add website/src/middleware.ts website/src/middleware.test.ts`
- **AND** the commit message is `fix(infra): chain loggingMiddleware in middleware.ts via sequence() [T001434]`
- **WHEN** `git commit` is invoked
- **THEN** the `commit-msg` hook runs `scripts/check-commit-vs-diff.sh`
- **AND** the hook accepts the commit with exit code 0

#### Scenario: Plan-stage commit with chore(plans): prefix passes

- **GIVEN** a developer runs `git add openspec/changes/<slug>/`
- **AND** the commit message is `chore(plans): stage <slug> for execution [T-...]`
- **WHEN** `git commit` is invoked
- **THEN** the `commit-msg` hook accepts the commit (no implementation-type claim)

#### Scenario: Bypass for emergency

- **GIVEN** a developer runs `SKIP_COMMIT_VS_DIFF=1 git commit ...` with an otherwise-blocked subject/diff pair
- **WHEN** the `commit-msg` hook runs
- **THEN** the hook prints a `⚠  SKIP_COMMIT_VS_DIFF=1` warning but exits 0

### Requirement: Advisory OpenSpec Drift Gate

The CI pipeline SHALL run an advisory spec-drift check on every `pull_request`
event that warns when a feature or fix PR changes files mapped to an SSOT spec
without touching that spec or a corresponding delta spec. In Phase 1 the check
SHALL be advisory: it MUST exit 0 (non-blocking) when drift is detected, MUST
reserve exit code 1 for the opt-in `DRIFT_CHECK_ENFORCE=1` enforcement mode, and
MUST use exit code 2 or higher only for script-level failures that fail the CI
step. File-to-spec mapping SHALL reuse the longest-prefix semantics of
`openspec/component-map.yaml`. The check SHALL be skippable via the
`SKIP_SPEC_DRIFT=1` environment variable and SHALL run against non-`feat`/`fix`
PRs as a no-op.

#### Scenario: Feature PR changes mapped code without touching its spec

- **GIVEN** a PR whose title starts with `feat:` or `fix:` (or, locally, a `feature/*` or `fix/*` branch)
- **AND** the diff against `origin/main` changes a file whose prefix maps to an SSOT spec in `openspec/component-map.yaml`
- **AND** neither `openspec/specs/<slug>.md` nor a delta spec `openspec/changes/*/specs/<slug>.md` for that slug is in the diff
- **WHEN** `scripts/openspec-drift-check.sh` runs
- **THEN** it prints a greppable `DRIFT: <slug> <- <file>` line, a `::warning::` annotation, and a `$GITHUB_STEP_SUMMARY` entry, and exits 0

#### Scenario: Delta spec in the diff suppresses the warning

- **GIVEN** a `feat:`/`fix:` PR that changes mapped code
- **AND** the diff also contains a delta spec `openspec/changes/<change>/specs/<slug>.md` for the mapped slug
- **WHEN** the drift check runs
- **THEN** it emits no `DRIFT:` line for that slug and exits 0

#### Scenario: Chore PRs and explicit bypass are skipped

- **GIVEN** a PR whose title does not start with `feat:` or `fix:` (for example `chore:`), or the environment variable `SKIP_SPEC_DRIFT=1` is set
- **WHEN** the drift check runs
- **THEN** it prints a skip message and exits 0 without evaluating drift

#### Scenario: Enforcement mode turns drift into a failure

- **GIVEN** `DRIFT_CHECK_ENFORCE=1` is set and mapped code changed without a spec touch
- **WHEN** the drift check runs
- **THEN** it exits 1, while the CI step itself never sets this variable in Phase 1

#### Scenario: Self-test validates the gate logic

- **GIVEN** a maintainer runs `scripts/openspec-drift-check.sh --self-test`
- **WHEN** the synthetic cases (drift, delta-spec suppression, chore skip, bypass) execute in a throwaway git repository
- **THEN** all cases pass and the command exits 0

### Requirement: Renovate-Lauf ohne verarbeitetes Repository gilt als Fehlschlag

The system SHALL treat a Renovate run that aborts with `result=repository-changed` as a
failure and SHALL retry the run up to three times before failing the job with a non-zero
exit code. The workflow SHALL NOT report success for a run in which no repository was
processed.

#### Scenario: Base-Branch-Drift löst einen Wiederholungsversuch aus

- **GIVEN** ein Renovate-Lauf bricht mit `"result": "repository-changed"` ab, weil auf `main`
  während der 157-sekündigen Laufzeit ein Commit gelandet ist
- **WHEN** der Workflow das Lauf-Ergebnis auswertet
- **THEN** startet er einen weiteren Renovate-Lauf, ohne auf einen Backoff zu warten
- **AND** der Folgeversuch nutzt den bereits aufgewärmten Repository-Cache

#### Scenario: Drei erfolglose Versuche färben den Job rot

- **GIVEN** alle drei Versuche brechen mit `repository-changed` ab
- **WHEN** der letzte Versuch ausgewertet ist
- **THEN** beendet sich der Job mit Exit-Code ≠ 0
- **AND** der Fehlschlag ist in der GitHub-Actions-Übersicht als `failure` sichtbar — nicht
  wie zuvor als `success` mit leerem Ergebnis

#### Scenario: Erfolgreicher Lauf beendet die Schleife sofort

- **GIVEN** ein Renovate-Lauf verarbeitet das Repository ohne `repository-changed`
- **WHEN** der Workflow das Ergebnis auswertet
- **THEN** bricht er die Retry-Schleife ab und beendet den Job grün, ohne weitere Versuche

---

### Requirement: Renovate-Repository-Cache über Läufe hinweg persistiert

The system SHALL run Renovate with `RENOVATE_REPOSITORY_CACHE=enabled` and a defined
`RENOVATE_CACHE_DIR`, and SHALL persist that directory between workflow runs so the
datasource lookup phase is shortened and the base-branch-drift window narrowed.

#### Scenario: Cache wird zwischen zwei Läufen wiederverwendet

- **GIVEN** ein vorheriger Renovate-Lauf hat seinen Repository-Cache abgelegt
- **WHEN** ein neuer Lauf startet
- **THEN** stellt ein `actions/cache`-Step das Cache-Verzeichnis wieder her, bevor Renovate startet

#### Scenario: Cache-Dateien bleiben für den Runner beschreibbar

- **GIVEN** der Renovate-Container hat Dateien in das gemountete Cache-Verzeichnis geschrieben
- **WHEN** der `actions/cache`-Post-Step den Cache als Benutzer `runner` packt
- **THEN** sind die Dateibesitzrechte so gesetzt, dass das Packen nicht an fehlenden
  Schreibrechten scheitert

---

### Requirement: Renovate-Image digest-gepinnt

The system SHALL invoke the Renovate container image pinned by both tag and `sha256` digest,
because the container receives the GitHub App installation token and is therefore subject to
the same supply-chain pinning rule as the secret-bearing Actions in the same workflow.

#### Scenario: Image-Referenz trägt Tag und Digest

- **GIVEN** der Workflow ruft `ghcr.io/renovatebot/renovate` auf
- **WHEN** die Image-Referenz geprüft wird
- **THEN** enthält sie sowohl einen Tag als auch einen `@sha256:`-Digest
- **AND** Renovates eigener `docker`-Manager kann den Pin dadurch selbst aktualisieren

### Requirement: Automated conflict healing for generated artifacts

The system SHALL provide a `pr:refresh` task that rebases a conflicting pull request
branch onto `origin/main`, regenerates the freshness artifacts, and force-pushes the
result, so that conflicts confined to generated artifacts no longer require manual work.

The `.gitattributes` file already declares `merge=ours` for the generated artifacts and the
local merge driver is configured, so a local rebase resolves them without conflict markers.
GitHub ignores `.gitattributes` merge drivers entirely when computing mergeability, which is
why such pull requests remain `CONFLICTING` despite being trivially resolvable locally.

#### Scenario: Conflict limited to generated artifacts is healed

- **GIVEN** a pull request whose only merge conflicts are in files marked
  `linguist-generated=true` in `.gitattributes`
- **WHEN** `task pr:refresh -- <number>` runs
- **THEN** the branch is rebased onto `origin/main`, the freshness artifacts are
  regenerated and committed, and the branch is force-pushed with `--force-with-lease`
- **AND** the pull request reports `mergeable=MERGEABLE` afterwards

#### Scenario: Conflict in a non-generated file aborts the run

- **GIVEN** a pull request with a merge conflict in a file that is NOT marked
  `linguist-generated=true`
- **WHEN** `task pr:refresh -- <number>` runs
- **THEN** the rebase is aborted, the branch is left untouched, and the command exits
  non-zero naming the conflicting file
- **AND** no force-push occurs

#### Scenario: Branch owned by a live session is refused

- **GIVEN** a pull request whose head branch is listed as `live` by `agent-lock.sh list`
- **WHEN** `task pr:refresh -- <number>` runs
- **THEN** the command exits non-zero without touching the branch, naming the owning
  session
- **AND** no force-push occurs

#### Scenario: Pull request of another author is refused

- **GIVEN** a pull request authored by an account other than the authenticated user
- **WHEN** `task pr:refresh -- <number>` runs
- **THEN** the command exits non-zero and performs no force-push

#### Scenario: Already mergeable pull request is skipped

- **GIVEN** a pull request reporting `mergeable=MERGEABLE`
- **WHEN** `task pr:refresh -- <number>` runs
- **THEN** the command reports that no action is needed and exits zero without rebasing

#### Scenario: Dry run performs no mutation

- **GIVEN** any pull request in any state
- **WHEN** `task pr:refresh -- --dry-run <number>` runs
- **THEN** the command reports the actions it would take and exits zero
- **AND** no rebase, commit, or push occurs

### Requirement: Test-Inventar erfasst jede Shell-Testdatei

The test inventory generator SHALL emit at least one entry for every shell test file it
discovers under `tests/local/`, `tests/prod/` and `tests/spec/`, regardless of whether the file
carries a structured requirement ID.

Files whose requirement reference is expressed through the directory convention introduced by
T002416 (`tests/spec/<ssot-spec-slug>/<short-slug>.bats`) SHALL derive their `category` from the
directory name, so that the entry maps onto the corresponding SSOT spec under `openspec/specs/`.

Files that already yield structured IDs — either from the filename pattern or from uppercase IDs
in their `@test` titles — SHALL keep those entries unchanged. The path-derived fallback applies
only where both existing mechanisms produce nothing.

The emitted JSON schema SHALL remain `{id, file, category, kind}`, so that existing consumers
require no change.

#### Scenario: File under the directory convention is captured

- **GIVEN** the file `tests/spec/openspec-workflow/half-archive-guard.bats`, whose name carries
  no requirement ID and whose `@test` titles contain no uppercase structured ID
- **WHEN** the inventory is regenerated
- **THEN** the inventory contains at least one entry with `file` equal to that path
- **AND** that entry's `category` is `openspec-workflow`

#### Scenario: Legacy top-level file without an ID is captured

- **GIVEN** the file `tests/spec/ci-cd.bats`, which carries no requirement ID in its name
- **WHEN** the inventory is regenerated
- **THEN** the inventory contains at least one entry with `file` equal to that path

#### Scenario: Structured IDs survive the fallback

- **GIVEN** the file `tests/spec/software-factory.bats`, whose `@test` titles carry the
  structured IDs `FA-SF-01` through `FA-SF-74`
- **WHEN** the inventory is regenerated
- **THEN** the inventory still contains exactly 54 entries for that file
- **AND** none of them is a single path-derived entry replacing them

### Requirement: Inventar-Erzeuger bricht bei unerfasster Testdatei ab

The test inventory generator SHALL fail with a non-zero exit status and name the offending paths
when a discovered shell test file produces no entry.

This guard is deliberate regression protection for future changes to the discovery logic. Given
the path-derived fallback above, no file can currently trigger it. It is therefore intentionally
not covered by a test of its own: such a test could only pass vacuously, which is the very defect
class this change removes.

#### Scenario: Every discovered file yields an entry

- **GIVEN** the current test suite
- **WHEN** the inventory is regenerated
- **THEN** the generator exits zero
- **AND** every discovered shell test file appears at least once in the inventory

### Requirement: Ausgabepfad des Inventar-Erzeugers ist umlenkbar

The test inventory generator SHALL write to the path given in the `TEST_INVENTORY_OUT`
environment variable when it is set, and to `website/src/data/test-inventory.json` otherwise.

This exists so that tests can execute the generator and assert on its result without mutating the
committed inventory.

#### Scenario: Generator honours the redirected output path

- **GIVEN** `TEST_INVENTORY_OUT` set to a path outside the repository working tree
- **WHEN** the generator runs
- **THEN** the given path contains the generated inventory
- **AND** `website/src/data/test-inventory.json` is left untouched

### Requirement: Post-Merge Reaping of Orphaned Remote Branches

After a merge to `main`, the system SHALL delete remote branches that carry the merge commit's
ticket ID and are provably obsolete, and SHALL preserve every branch that is not.

A branch counts as obsolete only when ALL of the following hold:

1. its name contains the merge commit's ticket ID (case-insensitive),
2. no open pull request exists for it,
3. its ticket status is `done` or `archived`,
4. every file whose blob hash differs from `origin/main` matches the allowlist of plan and
   generated paths (`openspec/changes/**`, `docs/code-quality/**`, `website/src/data/**`,
   `.release-please-manifest.json`, `website/CHANGELOG.md`, `website/package.json`).

Before deleting a branch, the system SHALL push its tip SHA to `refs/tags/reaped/<branch>` on
`origin`, so the commit remains recoverable after the branch ref is gone.

The reaping step SHALL NOT block the deploy path: it runs independently of manifest detection and
is non-fatal.

#### Scenario: Branch with only plan artifacts is reaped

- **GIVEN** a remote branch whose name carries the merge commit's ticket ID
- **AND** the ticket status is `done`
- **AND** no open pull request exists for the branch
- **AND** every file differing from `origin/main` lies under `openspec/changes/`
- **WHEN** the post-merge reaper runs
- **THEN** the branch tip is pushed to `refs/tags/reaped/<branch>` on `origin`
- **AND** the remote branch is deleted

#### Scenario: Branch carrying an unmerged source file is preserved

- **GIVEN** a remote branch whose ticket status is `done` and which has no open pull request
- **AND** a file outside the allowlist differs from `origin/main`
- **WHEN** the post-merge reaper runs
- **THEN** the branch is NOT deleted
- **AND** the report names the branch and the differing file as the reason

#### Scenario: Branch with an open pull request is preserved

- **GIVEN** a remote branch that carries the merge commit's ticket ID
- **AND** an open pull request exists for that branch
- **WHEN** the post-merge reaper runs
- **THEN** the branch is NOT deleted

#### Scenario: Branch whose ticket is still open is preserved

- **GIVEN** a remote branch that carries the merge commit's ticket ID
- **AND** the ticket status is neither `done` nor `archived`
- **WHEN** the post-merge reaper runs
- **THEN** the branch is NOT deleted

#### Scenario: Merge commit without a ticket ID reaps nothing

- **GIVEN** a merge commit whose message contains no `T######` identifier
- **WHEN** the post-merge reaper runs
- **THEN** no branch is deleted
- **AND** the job exits successfully

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

### Requirement: Branch commits SHALL NOT carry CI skip markers

Commits created on a feature, fix or chore branch SHALL NOT contain any of
GitHub's workflow skip markers in their commit message: `[skip ci]`,
`[ci skip]`, `[no ci]`, `[skip actions]` or `[actions skip]`.

Rationale: a squash merge folds the subjects of all branch commits into the
body of the resulting `main` commit. GitHub evaluates skip markers against the
entire message of the head commit, so a marker originating on a branch
suppresses every push-triggered workflow on `main` — silently, with no failed
run to observe.

This requirement does not apply to bot commits pushed directly to `main`
without a pull request, which use the marker deliberately as loop protection.

#### Scenario: Worktree anchor commit carries no skip marker

- **GIVEN** a repository in which `scripts/worktree-create.sh` creates a new
  branch
- **WHEN** the helper writes its empty anchor commit
- **THEN** the anchor commit exists on the new branch
- **AND** its commit message contains no CI skip marker

#### Scenario: The guard rejects a branch commit carrying a skip marker

- **GIVEN** a branch whose commits ahead of `main` include one whose message
  contains `[skip ci]`
- **WHEN** `scripts/check-skip-ci-marker.sh` runs against that range
- **THEN** it exits non-zero
- **AND** it names the offending commit

#### Scenario: The guard accepts a branch without skip markers

- **GIVEN** a branch whose commits ahead of `main` contain no skip marker
- **WHEN** `scripts/check-skip-ci-marker.sh` runs against that range
- **THEN** it exits zero

#### Scenario: The pull request pipeline invokes the guard

- **GIVEN** the `ci.yml` workflow
- **WHEN** it runs for a `pull_request` event
- **THEN** it invokes `scripts/check-skip-ci-marker.sh`, so the check fails
  before the merge rather than after it

### Requirement: Nightly-E2E Post-Run-Purge-Fallback

The `e2e` workflow SHALL run an `if: always()` post-run test-data purge step
after the Playwright suite step, posting to
`/api/admin/systemtest/purge-all-test-data` with the `X-Cron-Secret` header
against the matrix `website_url`, so that `is_test_data=true` rows created
during a run that crashes or is killed before Playwright's own
`globalTeardown` hook fires (e.g. the job's `timeout-minutes` limit) do not
remain in production (G-E2E02, T002096).

#### Scenario: Post-Run-Purge läuft auch nach Timeout/Crash des Playwright-Steps

- **GIVEN** der `e2e`-Workflow ruft `npx playwright test` direkt auf (nicht über
  `task test:e2e`, das einen eigenen Pre-/Post-Run-curl-Purge als
  Defense-in-Depth hat) und der Job hat ein `timeout-minutes`-Limit
- **WHEN** der Playwright-Step durch den Job-Timeout gekillt wird oder anderweitig
  abstürzt, bevor sein in-process `globalTeardown`-Hook feuert
- **THEN** läuft danach trotzdem ein `if: always()`-Schritt, der
  `POST /api/admin/systemtest/purge-all-test-data` mit
  `X-Cron-Secret: ${{ secrets.CRON_SECRET }}` gegen die Matrix-`website_url`
  aufruft, sodass `is_test_data=true`-Zeilen aus einem abgebrochenen Lauf nicht
  in Prod liegen bleiben

### Requirement: CI rendert und pusht das Fleet-OCI-Artefakt statt push-based apply

The system SHALL, on merge to `main`, render the fleet components into an OCI
artifact and push it to the private registry
(`oci://ghcr.io/paddione/fleet-manifests`) via `flux push artifact` with a
git-derived `--source` and `--revision`, instead of applying manifests to the
cluster with `kubectl apply`. After a successful push, CI SHALL ping the Flux
`Receiver` webhook so the cluster reconciles immediately rather than waiting for the
polling interval. The `fleet-manifests` package SHALL be private (rendered manifests
expose internal topology).

#### Scenario: Merge löst Render+Push+Ping aus

- **GIVEN** a pull request is merged to `main`
- **WHEN** the post-merge CI job runs
- **THEN** the fleet components are rendered and pushed as an OCI artifact with a
  `--revision` derived from the merge commit SHA
- **AND** the Flux Receiver webhook is pinged to trigger an immediate reconcile
- **AND** no `kubectl apply` of the rendered manifests runs in the job

#### Scenario: Build-Workflows triggern Re-Render statt set image

- **GIVEN** a component image (e.g. website, brett) is rebuilt with a new SHA tag
- **WHEN** its build workflow completes
- **THEN** the workflow triggers an artifact re-render passing the SHA tag as the
  image input
- **AND** it does NOT run `kubectl set image` or `kubectl rollout restart`

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

### Requirement: Batch processing of multiple pull requests in one run

`scripts/pr-refresh.sh` SHALL process every pull request number given on the command line. A refusal SHALL skip only the affected pull request and SHALL NOT terminate the run. The run SHALL end with a balance line reporting how many pull requests were healed, skipped and refused. The exit code SHALL be non-zero if at least one pull request was refused, so automation still observes the refusal.

Rationale: refusals are the normal case, not the exception. When the batch entry point was first used for real, three of four CONFLICTING pull requests were held by checked-out worktrees. With a terminating guard, the documented invocation `task pr:refresh -- 3448 3446 3442` never got past the first number.

#### Scenario: A refused pull request does not end the run

- **GIVEN** two pull request numbers, the first of which a guard refuses
- **WHEN** `pr-refresh.sh <first> <second>` runs
- **THEN** the refusal of the first is reported
- **AND** the second pull request is still evaluated
- **AND** the exit code is non-zero

#### Scenario: The run reports a balance

- **GIVEN** three pull requests — one already mergeable, one refused, one healable
- **WHEN** the batch run finishes
- **THEN** a balance line reports one healed, one skipped and one refused

#### Scenario: A run without refusals exits zero

- **GIVEN** pull request numbers that are all skipped or healed
- **WHEN** the batch run finishes
- **THEN** the exit code is zero

#### Scenario: An unreachable pull request skips only itself

- **GIVEN** a pull request number that cannot be fetched
- **WHEN** it is followed by a further number in the same run
- **THEN** the fetch failure is reported for that number only
- **AND** the following pull request is still evaluated

#### Scenario: A failed rebase leaves no worktree behind

- **GIVEN** a pull request whose `rebase --continue` fails
- **WHEN** the run continues with the remaining numbers
- **THEN** the temporary worktree is removed
- **AND** the branch is no longer checked out, so a later retry is not refused by the checkout guard

### Requirement: Repohealth-Dashboard-Datenquelle triggert den Website-Build

Health-Goal-Werte erreichen `/admin/repohealth` ausschliesslich ueber ein neu gebautes
Website-Image, weil `website/src/lib/goals-data.generated.json` per statischem ESM-Import in
`website/src/lib/goals-data.ts` ins Astro-Bundle gebacken wird. `.claude/lib/goals.md` ist der
SSOT dieses Artefakts.

The system SHALL trigger `build-website.yml` on changes to `.claude/lib/goals.md`, so that a
goals-only commit produces a fresh website image. The workflow's existing
`Regenerate freshness artifacts before build` step SHALL remain the transformation path —
no separate emit step is required.

#### Scenario: T002158-A: build-website triggert auf die Repohealth-Datenquelle *(BATS)*

- **GIVEN** `.github/workflows/build-website.yml` ist vorhanden
- **WHEN** die `paths`-Liste des `push`-Triggers geprueft wird
- **THEN** enthaelt sie `.claude/lib/goals.md`
- **AND** eine Aenderung, die nur die Health-Goals fortschreibt, loest einen Website-Build aus

---

### Requirement: Freshness-Bot-Commit unterdrueckt keinen Website-Build

`freshness-regen.yml` ist der einzige Ort, an dem generierte `website/**`-Artefakte
*ausserhalb* eines Pull Requests fortgeschrieben werden. Ein unbedingtes `[skip ci]` im
Commit-Titel unterdrueckt dort genau den Pfad, der `build-website.yml` ausloesen wuerde, und
friert damit den ausgelieferten Dashboard-Stand ein.

The system SHALL append `[skip ci]` to the freshness bot commit ONLY when the regenerated diff
contains no `website/**` paths. When a `website/**` artifact changed, the bot SHALL produce a
normal commit so the target workflows react through their own `paths` filters. The check SHALL
inspect the staged diff (`git diff --cached --name-only`) with a start-of-line anchored match
on `website/`, evaluated between `git add` and `git commit`.

The workflow SHALL continue to contain the literal `[skip ci]` for the non-website case,
preserving the existing G-CI01-E requirement.

#### Scenario: T002158-B: [skip ci] ist nicht unbedingt im Commit-Titel *(BATS)*

- **GIVEN** `.github/workflows/freshness-regen.yml` ist vorhanden
- **WHEN** die `git commit -m`-Zeile des Commit-Steps geprueft wird
- **THEN** enthaelt sie kein hart eingebautes `[skip ci]`, sondern eine Variable
- **AND** der Regen-Commit eines `website/**`-Artefakts loest `build-website.yml` aus

#### Scenario: T002158-B: Regen-Diff wird auf website/-Pfade geprueft *(BATS)*

- **GIVEN** `.github/workflows/freshness-regen.yml` ist vorhanden
- **WHEN** der Commit-Step geprueft wird
- **THEN** enthaelt er einen am Zeilenanfang verankerten `^website/`-Match auf den
  Staged-Diff, der steuert, ob `[skip ci]` angehaengt wird
- **AND** ein Pfad wie `docs/website-notes.md` zaehlt dadurch NICHT als Website-Artefakt

### Requirement: PR-Gate — Full tests/spec/*.bats Suite is Required, Not a Subset

The system SHALL run the entire `tests/spec/*.bats` glob (all files, not an
enumerated subset) inside the `test-factory` job, which is already a
required status check (`Factory + OpenSpec + Guards`) on `main`. A regression
that silently narrows the invocation back to a hand-picked list of files
SHALL be caught by a BATS assertion before merge.

#### Scenario: CI invokes the full spec glob, not a hardcoded file list

- **GIVEN** `.github/workflows/ci.yml` defines the `test-factory` job
- **WHEN** the guard assertion inspects the job's steps
- **THEN** it finds an invocation that resolves to every file under
  `tests/spec/*.bats` (e.g. via `task test:spec` or an equivalent glob) and
  fails if the invocation only lists specific `.bats` filenames

#### Scenario: A regression in a previously-ungated spec file now blocks merge

- **GIVEN** a PR introduces a regression in any `tests/spec/*.bats` file that
  was not one of the four previously cherry-picked files
  (`software-factory.bats`, `agent-library.bats`, `mcp-tooling.bats`,
  `ci-cd.bats`)
- **WHEN** the `test-factory` job runs
- **THEN** the job fails and blocks auto-merge, because the file is now part
  of the executed glob

#### Scenario: mcp-task-runner binary is available on a fresh CI runner

- **GIVEN** `tests/spec/mcp-task-runner.bats` requires the compiled
  `/usr/local/bin/mcp-task-runner` binary and has no skip-guard for its
  absence
- **WHEN** the `test-factory` job runs on a fresh GitHub Actions runner with
  no pre-installed binary
- **THEN** a Go toolchain is available in the job so `task
  test:spec:build-mcp-runner` can build and install the binary before the
  spec suite runs

### Requirement: CI-Watch ist fail-closed bei null vorhandenen Checks

`scripts/devflow-ci-watch.sh` SHALL die Anzahl der Check-Runs für den beobachteten Commit
ermitteln, bevor es Erfolg meldet. Existieren **null** Check-Runs, SHALL das Skript mit
Exit-Code 5 abbrechen statt mit Exit-Code 0 Erfolg zu signalisieren. Ein Zustand ohne Checks
bedeutet „CI wurde nie gestartet oder läuft noch" — nicht „CI ist grün". Die Erfolgsmeldung
SHALL die tatsächliche Anzahl geprüfter Checks nennen, damit ein Null- oder Teilzustand für
Menschen wie für Automaten sichtbar ist.

Hintergrund: Beobachtet bei T002162/T002174 — ein PR mit `mergeStateStatus=CONFLICTING` hatte
über ~35 Minuten null Check-Runs, und das Skript meldete durchgehend „Alle CI-Checks grün"
mit Exit-Code 0. Das ist ein falsch-grünes Gate: die Merge-Pipeline hält einen ungeprüften
Stand für verifiziert.

#### Scenario: Null Check-Runs führen zu Exit-Code 5 statt zu falschem Grün

- **GIVEN** für den beobachteten Commit meldet `gh api …/check-runs` `total_count = 0`
- **WHEN** `devflow-ci-watch.sh` seine Auswertung erreicht
- **THEN** bricht es mit Exit-Code 5 und der Meldung „Keine CI-Checks gefunden
  (total_count=0) — CI wurde nie gestartet oder läuft noch." ab
- **AND** meldet unter keinen Umständen Erfolg

#### Scenario: Die Erfolgsmeldung nennt die Anzahl der geprüften Checks

- **GIVEN** für den beobachteten Commit existieren N > 0 Check-Runs und alle sind grün
- **WHEN** `devflow-ci-watch.sh` Erfolg meldet
- **THEN** enthält die Meldung die konkrete Zahl N („N CI-Checks, alle grün") statt der
  pauschalen Formulierung „Alle CI-Checks grün"

#### Scenario: Ein konfliktbehafteter PR wird vor der Poll-Schleife abgefangen

- **GIVEN** ein PR steht auf `mergeStateStatus=CONFLICTING`
- **WHEN** `devflow-ci-watch.sh` startet
- **THEN** bricht der Preflight mit Exit-Code 4 ab, bevor die Poll-Schleife betreten wird

### Requirement: Spec-Tests spiegeln die umformulierte Doku-Prosa

The system SHALL keep the spec-test assertions in sync with the rewritten prose of
`SKILL.md`/`AGENTS.md`, so that documentation assertions do not assert stale wording. Where a
requirement is structurally checkable (frontmatter key present, task exists), the test SHALL
use the structural form instead of a brittle wording assertion.

#### Scenario: Doku-Assertion folgt der umformulierten Prosa

- **GIVEN** die Prosa in `SKILL.md`/`AGENTS.md` wurde umgeschrieben
- **WHEN** die zugehörige Spec-Test-Assertion geprüft wird
- **THEN** prüft sie den neuen Wortlaut
- **AND** sie behauptet keinen veralteten Text

#### Scenario: Strukturell prüfbare Anforderung nutzt strukturelle Form

- **GIVEN** eine Anforderung ist strukturell prüfbar (Frontmatter-Key, Task-Existenz)
- **WHEN** der Test formuliert wird
- **THEN** nutzt er die strukturelle Assertion
- **AND** nicht eine spröde Wortlaut-Assertion

### Requirement: Spec-Tests ziehen die absichtlich veränderte Realität nach

The system SHALL update spec tests that assert states which were intentionally changed, so
that the tests reflect the current reality. This includes removing references to dead LLM
configuration, updating the delegation-fallback behavior, and aligning with the Flux
OCIRepository-based sync.

#### Scenario: Tote LLM-Konfiguration ist aus den Tests entfernt

- **GIVEN** die alte LLM-Gateway-Konfiguration wurde entfernt
- **WHEN** die Spec-Tests geprüft werden
- **THEN** referenzieren sie keinen toten Dienst und keine toten Variablen
  (`LLM_LMSTUDIO_URL`, `LLM_CHAT_MODEL`, `LLM_CODING_MODEL`, `LLM_EMBED_MODEL_NOMIC`)

#### Scenario: Delegation-Fallback-Verhalten ist abgebildet

- **GIVEN** die Delegation nutzt einen Fallback
- **WHEN** die Spec-Tests geprüft werden
- **THEN** bilden sie `fallbackFor`/`fallbackTriggered` und den `qwen35-hq`-Fallback ab
- **AND** `qwen35-hq` ist in `agent-models.jsonc` registriert

#### Scenario: Flux-Sync nutzt die OCIRepository-Quelle

- **GIVEN** Flux synchronisiert aus einem OCIRepository
- **WHEN** die Spec-Tests geprüft werden
- **THEN** bilden sie die OCIRepository-Quelle und die Kustomization-`dependsOn`-Kette ab

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Changed-Manifests-Erkennung
<!-- bats: changed-manifests.bats -->

The system SHALL detect manifest-relevant file changes in `k3d/`, `prod/`, `prod-fleet/`, `prod-mentolder/`, `prod-korczewski/`, and `environments/` directories and SHALL return exit code 0 with the changed file list; for non-manifest changes it SHALL return exit code 1 with "no manifest changes".

#### Scenario: Manifest-Änderung in k3d/ wird erkannt *(BATS)*
- **GIVEN** ein Git-Repo mit einem Base-Commit und anschließendem Commit, der `k3d/foo.yaml` hinzufügt
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` ausgeführt wird
- **THEN** liefert das Skript Exit-Code 0 und gibt `k3d/foo.yaml` aus

#### Scenario: Manifest-Änderung in prod-fleet/ wird erkannt *(BATS)*
- **GIVEN** ein Commit fügt `prod-fleet/mentolder/kustomization.yaml` hinzu
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` ausgeführt wird
- **THEN** liefert das Skript Exit-Code 0 und gibt den Pfad der Datei aus

#### Scenario: Manifest-Änderung in environments/ wird erkannt *(BATS)*
- **GIVEN** ein Commit fügt `environments/mentolder.yaml` hinzu
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` ausgeführt wird
- **THEN** liefert das Skript Exit-Code 0 und gibt `environments/mentolder.yaml` aus

#### Scenario: Nur Docs-Änderung — kein Manifest-Treffer *(BATS)*
- **GIVEN** ein Commit ändert ausschließlich `docs/x.md`
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` ausgeführt wird
- **THEN** liefert das Skript Exit-Code 1

#### Scenario: Nur Website-Änderung — kein Manifest-Treffer *(BATS)*
- **GIVEN** ein Commit ändert ausschließlich `website/src/pages/index.astro`
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` ausgeführt wird
- **THEN** liefert das Skript Exit-Code 1 und gibt "no manifest changes" aus

#### Scenario: Leerer Diff — kein Manifest-Treffer *(BATS)*
- **GIVEN** ein einzelner Commit ohne Dateiänderungen
- **WHEN** `scripts/changed-manifests.sh HEAD HEAD` ausgeführt wird
- **THEN** liefert das Skript Exit-Code 1 und gibt "no manifest changes" aus

#### Scenario: Manifest in prod-mentolder/ wird erkannt *(BATS)*
- **GIVEN** ein Commit fügt `prod-mentolder/config.yaml` hinzu
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` ausgeführt wird
- **THEN** liefert das Skript Exit-Code 0 und gibt `prod-mentolder/config.yaml` aus

#### Scenario: Manifest in prod-korczewski/ wird erkannt *(BATS)*
- **GIVEN** ein Commit fügt `prod-korczewski/config.yaml` hinzu
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` ausgeführt wird
- **THEN** liefert das Skript Exit-Code 0 und gibt `prod-korczewski/config.yaml` aus

#### Scenario: Manifest in prod/ wird erkannt *(BATS)*
- **GIVEN** ein Commit fügt `prod/config.yaml` hinzu
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` ausgeführt wird
- **THEN** liefert das Skript Exit-Code 0 und gibt `prod/config.yaml` aus

#### Scenario: Gemischter Commit (Manifest + Non-Manifest) — Exit 0 *(BATS)*
- **GIVEN** ein Commit ändert sowohl `k3d/foo.yaml` als auch `docs/x.md` und `website/src/index.astro`
- **WHEN** `scripts/changed-manifests.sh HEAD~1 HEAD` ausgeführt wird
- **THEN** liefert das Skript Exit-Code 0 und gibt `k3d/foo.yaml` in der Ausgabe aus

#### Scenario: Ohne Argumente werden HEAD~1 und HEAD als Defaults verwendet *(BATS)*
- **GIVEN** ein Commit fügt `k3d/bar.yaml` hinzu
- **WHEN** `scripts/changed-manifests.sh` ohne Argumente ausgeführt wird
- **THEN** liefert das Skript Exit-Code 0 und gibt `k3d/bar.yaml` aus

---

### Requirement: Dev-Build-Safety — OOM-Schutz für Astro-Build
<!-- bats: dev-build-safety.bats -->

The system SHALL configure the website Dockerfile to set an explicit Node.js heap cap (`NODE_OPTIONS` with `--max-old-space-size`) of at least 2048 MB in the build stage only, and the dev-stack build task SHALL kill stale docker build processes before starting a new build.

#### Scenario: Dockerfile setzt NODE_OPTIONS mit max-old-space-size *(BATS)*
- **GIVEN** `website/Dockerfile` ist vorhanden
- **WHEN** die Datei auf `NODE_OPTIONS.*max-old-space-size` durchsucht wird
- **THEN** findet `grep` die Zeile — kein implizites Node.js-Heap-Limit im Build-Stage

#### Scenario: Heap-Limit ist mindestens 2048 MB *(BATS)*
- **GIVEN** `website/Dockerfile` enthält einen `--max-old-space-size=<N>`-Eintrag
- **WHEN** der numerische Wert extrahiert wird
- **THEN** ist der Wert ≥ 2048 — kleiner Wert würde auf dem speicherbeschränkten Dev-Node zu SIGSEGV führen

#### Scenario: NODE_OPTIONS steht im Build-Stage vor dem Runtime-Stage *(BATS)*
- **GIVEN** `website/Dockerfile` hat einen Build-Stage-Marker und einen Runtime-Stage-Marker
- **WHEN** die Zeilennummern der Marker und der NODE_OPTIONS-Zeile verglichen werden
- **THEN** liegt `NODE_OPTIONS` vor dem Runtime-Stage — das Flag beeinflusst nur den Build, nicht den laufenden Container

#### Scenario: Taskfile.dev-stack.yml killt stale Docker-Builds vor dem Start *(BATS)*
- **GIVEN** `Taskfile.dev-stack.yml` enthält den Task `build:website`
- **WHEN** der Task-Block auf `pkill`/`killall`/`buildx prune`/`docker kill`-Muster geprüft wird
- **THEN** enthält der Block ein solches Muster — verhindert gleichzeitige OOM-erzeugende Builds bei SSH-Timeout

---

### Requirement: Freshness-Gate für generierte Graph-Artefakte (freshness-graph)
<!-- bats: freshness-graph.bats -->

The system SHALL ensure that `build-graph.mjs` and `build-api-map.mjs` run without errors, that the committed `graph.json` has the same node count as freshly generated output, and that both artifacts carry valid `generatedAt` timestamps.

#### Scenario: build-graph.mjs und build-api-map.mjs laufen ohne Fehler *(BATS)*
- **GIVEN** die Skripte `scripts/build-graph.mjs` und `scripts/build-api-map.mjs` sind vorhanden
- **WHEN** beide Skripte ausgeführt werden
- **THEN** beenden sie sich jeweils mit Exit-Code 0

#### Scenario: Committed graph.json hat dieselbe Node-Anzahl wie frisch generierter Output *(BATS)*
- **GIVEN** `docs/generated/graph.json` ist in HEAD committed und beide Build-Skripte laufen durch
- **WHEN** die Node-Anzahl des committed Artefakts mit der frisch generierten verglichen wird
- **THEN** stimmen beide Zählwerte überein — andernfalls schlägt der Freshness-Check fehl

#### Scenario: graph.json enthält mindestens 20 Nodes und 60 Kanten *(BATS)*
- **GIVEN** `scripts/build-graph.mjs` wurde ausgeführt
- **WHEN** `.nodes | length` und `.edges | length` aus `docs/generated/graph.json` gelesen werden
- **THEN** sind mindestens 20 Nodes und mindestens 60 Kanten vorhanden

#### Scenario: api-map.json enthält mindestens 15 Endpoints *(BATS)*
- **GIVEN** `scripts/build-api-map.mjs` wurde ausgeführt
- **WHEN** `.endpoints | length` aus `docs/generated/api-map.json` gelesen wird
- **THEN** enthält das Array mindestens 15 Einträge

#### Scenario: graph.json und api-map.json haben gültige generatedAt Felder *(BATS)*
- **GIVEN** beide Build-Skripte wurden ausgeführt
- **WHEN** `.generatedAt` aus beiden JSON-Artefakten gelesen wird
- **THEN** sind beide Felder nicht-leer und nicht `null`

---

### Requirement: Preflight-PR-Scope-Validierung
<!-- bats: preflight-pr-scope.bats -->

The system SHALL validate PR title scopes against the named-scope list in `commitlint.config.cjs` before `gh pr create` and SHALL exit 0 for valid scopes and exit non-zero with an allowlist hint for unknown scopes.

#### Scenario: Gültiger Scope besteht die Validierung *(BATS)*
- **GIVEN** ein PR-Titel `feat(website): add dashboard` und `commitlint.config.cjs` mit `website` in `namedScopes`
- **WHEN** `scripts/preflight-pr-scope.sh` mit dem Titel aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0

#### Scenario: Ungültiger Scope schlägt fehl mit Allowlist-Hinweis *(BATS)*
- **GIVEN** ein PR-Titel `feat(cockpit): add view` wobei `cockpit` nicht im Allowlist steht
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code ≠ 0 und gibt "NOT in the semantic-PR allowlist" sowie die erlaubten Scopes aus

#### Scenario: Scope-loser Titel wird akzeptiert *(BATS)*
- **GIVEN** ein PR-Titel `docs: update readme` ohne Scope-Klammer
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0 und gibt einen "no scope"-Hinweis aus

#### Scenario: Gültiger Scope mit Breaking-Change-Marker wird akzeptiert *(BATS)*
- **GIVEN** ein PR-Titel `feat(db)!: breaking schema` mit `!` nach dem Scope
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0 — der Breaking-Change-Marker beeinflusst die Scope-Validierung nicht

> **Entfallenes Szenario (T002328):** Das frühere Szenario „Fehlende Workflow-Datei liefert
> Exit-Code 2" ist mit diesem Change ersatzlos gestrichen. Den Exit-Code gab es nur, weil
> `scripts/preflight-pr-scope.sh` einen ci.yml-Pfad als zweites Argument entgegennahm. Der
> Parameter entfällt vollständig — die Allowlist kommt ausschließlich aus
> `commitlint.config.cjs`. Ein Parameter, der etwas annimmt und wegwirft, wäre genau die
> Halbwahrheit, aus der der ursprüngliche Drift entstand. Die Streichung steckt in der
> MODIFIED-Fassung oben (das Szenario fehlt dort); ein `## REMOVED Requirements`-Block wäre
> hier falsch, weil OpenSpec dort ganze Requirements erwartet, keine einzelnen Szenarien.

### Requirement: Konsolidierte Scope-Namen nennen ihr Ziel
<!-- bats: ci-cd.bats -->

The system SHALL reject a commit scope that was consolidated into another scope and SHALL name the target scope in the diagnostic, and SHALL report a scope whose subsystem was removed as retired rather than mapping it to a replacement.

#### Scenario: Konsolidierter Scope nennt sein Ziel *(BATS)*
- **GIVEN** ein Commit-Subject `feat(admin): add dashboard`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 1 und die Diagnose nennt `website` als Zielscope

#### Scenario: Entfallener Scope wird nicht gemappt *(BATS)*
- **GIVEN** ein Commit-Subject `feat(tracking): add import`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 1 und meldet den Scope als entfallen, ohne einen Ersatz-Scope zu nennen

#### Scenario: register-scope verweigert die Wiederanlage *(BATS)*
- **GIVEN** der konsolidierte Scope-Name `admin`
- **WHEN** `scripts/register-scope.sh admin` aufgerufen wird
- **THEN** liefert das Skript einen Exit-Code ungleich 0 und trägt den Namen nicht in `commitlint.config.cjs` ein

### Requirement: Website-CI-Deploy via kubectl set image
<!-- bats: website-ci-deploy.bats -->

The system SHALL deploy the website by repointing the Deployment to the freshly built image via `kubectl set image deployment/website website=<IMAGE>:<SHA_TAG>` in both per-brand deploy jobs of `build-website.yml`, and SHALL wait for rollout status after each set image command. The image tag SHALL be produced once by the shared `build-image` job and consumed by both deploy jobs via `needs.build-image.outputs.*`.

#### Scenario: Mentolder build-website.yml existiert *(BATS)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `$REPO_ROOT/.github/workflows/build-website.yml` geprüft wird
- **THEN** existiert die Datei

#### Scenario: Mentolder Deploy repoints via kubectl set image deployment/website *(BATS)*
- **GIVEN** `build-website.yml` ist vorhanden
- **WHEN** die Datei auf `kubectl set image deployment/website website=` durchsucht wird
- **THEN** enthält die Datei dieses Muster — kein reines `rollout restart`

#### Scenario: Mentolder set image verwendet SHA_TAG/IMAGE-Variable *(BATS)*
- **GIVEN** `build-website.yml` enthält `kubectl set image deployment/website`
- **WHEN** die entsprechende Zeile auf `${SHA_TAG}` oder `${IMAGE}` geprüft wird
- **THEN** enthält die Zeile eine dieser Variablen — keine statische Digest-Referenz

#### Scenario: Korczewski Deploy repoints via kubectl set image deployment/website *(BATS)*
- **GIVEN** `build-website.yml` ist vorhanden
- **WHEN** die Datei auf `kubectl set image deployment/website website=` durchsucht wird
- **THEN** enthält die Datei dieses Muster

#### Scenario: Korczewski set image verwendet SHA_TAG/IMAGE-Variable *(BATS)*
- **GIVEN** `build-website.yml` enthält `kubectl set image deployment/website`
- **WHEN** die entsprechende Zeile auf `${SHA_TAG}` oder `${IMAGE}` geprüft wird
- **THEN** enthält die Zeile eine dieser Variablen

#### Scenario: Beide Deploy-Jobs warten auf rollout status nach set image *(BATS)*
- **GIVEN** `build-website.yml` enthält die Jobs `deploy-mentolder` und `deploy-korczewski`
- **WHEN** beide Deploy-Jobs auf `kubectl rollout status deployment/website` geprüft werden
- **THEN** enthält jeder Deploy-Job dieses Muster — kein Deployment ohne Rollout-Wait

### Requirement: G-CD01 Brand-Parity im Website-Deploy
<!-- bats: ci-cd.bats -->

The system SHALL deploy the korczewski brand in a CI job that is structurally independent of the mentolder deploy job, so that a mentolder deploy failure does not skip or block the korczewski deploy. `build-website.yml` SHALL define a shared `build-image` job (exporting `image` + `sha_tag` outputs) and two deploy jobs `deploy-mentolder` and `deploy-korczewski`, each with `needs: [build-image]` and neither depending on the other.

#### Scenario: build-image exportiert image + sha_tag als Job-Outputs *(BATS)*
- **GIVEN** `build-website.yml` ist vorhanden
- **WHEN** der `build-image`-Job geprüft wird
- **THEN** definiert er die Outputs `image` und `sha_tag`

#### Scenario: korczewski Deploy ist unabhängig vom mentolder Deploy *(BATS)*
- **GIVEN** `build-website.yml` definiert `deploy-mentolder` und `deploy-korczewski`
- **WHEN** die `needs:`-Felder beider Deploy-Jobs geprüft werden
- **THEN** referenziert jeder Deploy-Job `build-image`, und `deploy-korczewski` listet `deploy-mentolder` NICHT in seinem `needs:`

---

### Requirement: Release-Notes-Generierung (vda release-notes)
<!-- bats: vda-release-notes-smoke.bats -->

The system SHALL provide a `release-notes` subcommand via `scripts/vda/release-notes.sh` that generates grouped Markdown release notes from PR data or falls back to `git log` when `gh` is unavailable, and SHALL publish notes to a GitHub Release or prepend them to `CHANGELOG.md`.

#### Scenario: release-notes help zeigt Subcommands und beendet mit Exit-Code 0 *(BATS)*
- **GIVEN** `scripts/vda/release-notes.sh` ist vorhanden
- **WHEN** `bash release-notes.sh help` ausgeführt wird
- **THEN** liefert das Skript Exit-Code 0 und listet `generate`, `publish-github` und `publish-changelog` auf

#### Scenario: Aufruf ohne Argumente zeigt Usage und beendet mit Exit-Code 0 *(BATS)*
- **GIVEN** `scripts/vda/release-notes.sh` ist vorhanden
- **WHEN** das Skript ohne Argumente ausgeführt wird
- **THEN** liefert Exit-Code 0 und gibt "Usage" in der Ausgabe aus

#### Scenario: Unbekannter Subcommand liefert Exit-Code 2 *(BATS)*
- **GIVEN** `scripts/vda/release-notes.sh` ist vorhanden
- **WHEN** `bash release-notes.sh nonexistent` ausgeführt wird
- **THEN** liefert Exit-Code 2 und gibt "Unknown subcommand" aus

#### Scenario: vda.sh help listet release-notes auf *(BATS)*
- **GIVEN** `scripts/vda.sh` ist vorhanden
- **WHEN** `bash vda.sh help` ausgeführt wird
- **THEN** enthält die Ausgabe "release-notes"

#### Scenario: generate ohne gh fällt deterministisch auf git log zurück *(BATS)*
- **GIVEN** `gh` ist nicht im PATH
- **WHEN** `bash release-notes.sh generate` ausgeführt wird
- **THEN** liefert Exit-Code 0 und produziert Markdown mit dem Header `# Release Notes` aus dem git-log-Fallback

#### Scenario: generate mit stubbed gh gruppiert PRs in Markdown *(BATS)*
- **GIVEN** ein `gh`-Stub liefert zwei PRs (dark mode, login redirect loop)
- **WHEN** `bash release-notes.sh generate --since v1.0.0` ausgeführt wird
- **THEN** enthält die Ausgabe `# Release Notes`, "dark mode" und "login redirect"

#### Scenario: generate --out schreibt Ausgabe in Datei *(BATS)*
- **GIVEN** ein `gh`-Stub ist aktiv und ein Ausgabepfad ist angegeben
- **WHEN** `bash release-notes.sh generate --since v1.0.0 --out <datei>` ausgeführt wird
- **THEN** liefert Exit-Code 0 und die Ausgabedatei existiert mit Inhalt "dark mode"

#### Scenario: publish-github --dry-run zeigt Befehl an *(BATS)*
- **GIVEN** ein `gh`-Stub ist aktiv und eine Notes-Datei existiert
- **WHEN** `bash release-notes.sh publish-github --tag v1.0.0 --notes-file <datei> --dry-run` ausgeführt wird
- **THEN** liefert Exit-Code 0 und die Ausgabe enthält "DRY_RUN" und "gh release edit"

#### Scenario: publish-github ohne --notes-file liefert Exit-Code 2 *(BATS)*
- **GIVEN** kein `--notes-file`-Flag wird übergeben
- **WHEN** `bash release-notes.sh publish-github --tag v1.0.0` ausgeführt wird
- **THEN** liefert Exit-Code 2 und die Ausgabe enthält "--notes-file is required"

#### Scenario: publish-changelog --dry-run zeigt Vorschau *(BATS)*
- **GIVEN** eine Notes-Datei existiert
- **WHEN** `bash release-notes.sh publish-changelog --notes-file <datei> --dry-run` ausgeführt wird
- **THEN** liefert Exit-Code 0 und die Ausgabe enthält "DRY_RUN"

#### Scenario: publish-changelog mit fehlender Datei liefert Exit-Code 2 *(BATS)*
- **GIVEN** der angegebene Datei-Pfad existiert nicht
- **WHEN** `bash release-notes.sh publish-changelog --notes-file /nonexistent/file.md` ausgeführt wird
- **THEN** liefert Exit-Code 2 und die Ausgabe enthält "Notes file not found"

#### Scenario: generate mit leerem gh-Output fällt auf git log zurück *(BATS)*
- **GIVEN** ein `gh`-Stub liefert ein leeres Array `[]`
- **WHEN** `bash release-notes.sh generate --since HEAD~10` ausgeführt wird
- **THEN** liefert Exit-Code 0 und produziert Markdown mit `# Release Notes`

---

### Requirement: Kubernetes-Abhängigkeitsgraph-Generierung (build-graph)
<!-- bats: build-graph.bats -->

The system SHALL generate `docs/generated/graph.json` via `node scripts/build-graph.mjs` with at least 5 nodes (including `shared-db` and `keycloak`), a non-null `generatedAt` timestamp, and an `edges` array.

#### Scenario: build-graph.mjs beendet sich sauber mit Exit-Code 0 *(BATS)*
- **GIVEN** `scripts/build-graph.mjs` ist vorhanden und der Repo-Root ist das Arbeitsverzeichnis
- **WHEN** `node scripts/build-graph.mjs` ausgeführt wird
- **THEN** beendet sich das Skript mit Exit-Code 0

#### Scenario: graph.json enthält mindestens 5 Nodes *(BATS)*
- **GIVEN** `scripts/build-graph.mjs` wurde erfolgreich ausgeführt
- **WHEN** `.nodes | length` aus `docs/generated/graph.json` abgefragt wird
- **THEN** ist der Wert ≥ 5

#### Scenario: graph.json enthält shared-db Node *(BATS)*
- **GIVEN** `scripts/build-graph.mjs` wurde ausgeführt
- **WHEN** `docs/generated/graph.json` auf "shared-db" durchsucht wird
- **THEN** enthält die Datei den String "shared-db"

#### Scenario: graph.json enthält keycloak Node *(BATS)*

> **Kategorie 4 (T002179):** Dieser Node ist real und der Test grün. `scripts/build-graph.mjs`
> leitet ihn aus lebenden Manifesten ab: `docs/generated/graph.json` führt
> `{"id":"keycloak","type":"Service"}` mit zwei Env-Kanten (`claude-code-mcp-monolith` via
> `KC_URL`, `studio-server` via `KEYCLOAK_ISSUER_MENTOLDER`). Der Graph enthält daneben
> einen eigenen `pocket-id`-Node. Der Spec-Text zitiert `tests/unit/build-graph.bats:25`
> korrekt und bleibt unverändert — zu bereinigen sind die Manifest-Reste (T002205), nicht
> die Spec.
- **GIVEN** `scripts/build-graph.mjs` wurde ausgeführt
- **WHEN** `docs/generated/graph.json` auf "keycloak" durchsucht wird
- **THEN** enthält die Datei den String "keycloak"

#### Scenario: graph.json hat gültigen generatedAt Timestamp *(BATS)*
- **GIVEN** `scripts/build-graph.mjs` wurde ausgeführt
- **WHEN** `.generatedAt` aus `docs/generated/graph.json` gelesen wird
- **THEN** ist der Wert nicht-leer und nicht `null`

#### Scenario: graph.json enthält edges-Array *(BATS)*
- **GIVEN** `scripts/build-graph.mjs` wurde ausgeführt
- **WHEN** `.edges | length` aus `docs/generated/graph.json` abgefragt wird
- **THEN** existiert das Feld als Array mit Länge ≥ 0

---

### Requirement: Dependency-Versions-Erkennung (discover-versions)

The system SHALL discover current versions of k3s, sealed-secrets-chart,
cert-manager, and longhorn-chart from the GitHub API and Helm repos, SHALL print
them in dry-run mode without writing a file, and SHALL write a `versions.yaml` with
all four required keys when `--update` is passed. Because the fleet cluster now runs
a pull-based GitOps controller (Flux Operator), the prior clause "Flux SHALL NOT be
tracked" is REMOVED: the system MAY additionally track a Flux/flux-operator version
key, and MUST NOT fail when that key is absent (the four core keys remain
mandatory).

#### Scenario: Dry-Run gibt alle Pflicht-Versionen aus *(BATS)*

- **GIVEN** `curl` and `helm` are replaced by stubs (k3s: v1.99.0+k3s1,
  sealed-secrets: 9.1.0, cert-manager: v9.2.0, longhorn: 9.3.0)
- **WHEN** `bash scripts/discover-versions.sh` runs without flags
- **THEN** exit code is 0 and the output contains all four versions

#### Scenario: Dry-Run schreibt keine Datei *(BATS)*

- **GIVEN** stubs for `curl` and `helm` are active
- **WHEN** `bash scripts/discover-versions.sh` runs without `--update`
- **THEN** exit code is 0 and no `versions.yaml` file is created

#### Scenario: --update schreibt versions.yaml mit allen Pflicht-Keys *(BATS)*

- **GIVEN** stubs for `curl` and `helm` are active
- **WHEN** `bash scripts/discover-versions.sh --update --versions-file <path>` runs
- **THEN** exit code is 0 and the file contains `k3s:`, `sealed_secrets_chart:`,
  `cert_manager:`, and `longhorn_chart:`
- **AND** an optional `flux:` key, whether present or absent, does not cause a
  non-zero exit

### Requirement: Produktions-Deployment-Struktur (NFA-08)
<!-- e2e: nfa-08-production-deploy.spec.ts -->

The system SHALL maintain the expected directory and file structure for production deployments: `prod/`, `prod-mentolder/`, `prod-korczewski/`, and `k3d/` directories with YAML manifests, and cert-manager tasks in `Taskfile.yml`.

#### Scenario: prod/-Verzeichnis existiert *(E2E)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `fs.existsSync(repoRoot + '/prod')` geprüft wird
- **THEN** gibt die Prüfung `true` zurück

#### Scenario: YAML-Dateien in prod/ sind vorhanden *(E2E)*
- **GIVEN** das `prod/`-Verzeichnis existiert
- **WHEN** die Dateien nach `.yaml` und `.yml` Endungen gefiltert werden
- **THEN** ist die Anzahl der YAML-Dateien größer als 0

#### Scenario: cert-manager Tasks in Taskfile.yml vorhanden *(E2E)*
- **GIVEN** `Taskfile.yml` existiert im Repo-Root
- **WHEN** der Inhalt auf den String `cert:` geprüft wird
- **THEN** enthält die Datei diesen String

#### Scenario: prod-mentolder/-Overlay existiert *(E2E)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `fs.existsSync(repoRoot + '/prod-mentolder')` geprüft wird
- **THEN** gibt die Prüfung `true` zurück

#### Scenario: prod-korczewski/-Overlay existiert *(E2E)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `fs.existsSync(repoRoot + '/prod-korczewski')` geprüft wird
- **THEN** gibt die Prüfung `true` zurück

#### Scenario: k3d/-Basis-Manifest-Verzeichnis mit YAML-Dateien existiert *(E2E)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `k3d/` auf Existenz und YAML-Dateien geprüft wird
- **THEN** existiert das Verzeichnis und enthält mindestens eine YAML-Datei

<!-- merged from change delta ci-cd.md on 2026-06-28 -->

### Requirement: Website-Auto-Deploy bei main-Push

The system SHALL automatically build a Docker image and deploy it to the fleet cluster
for both brands (mentolder, korczewski) whenever `website/**` changes reach `main`,
using three independent CI jobs: one shared build job and two parallel, independent brand deploy jobs.

#### Scenario: Website-Änderung löst Build und parallele Rollouts aus

- **GIVEN** ein Commit auf `main` ändert `website/src/pages/index.astro`
- **WHEN** der `build-website`-Workflow getriggert wird
- **THEN** startet zuerst der `build-image`-Job (baut Image mit `SHA_TAG` + `:latest`, pusht nach GHCR, exportiert `image` + `sha_tag` als Job-Outputs), danach laufen `deploy-mentolder` und `deploy-korczewski` parallel — je mit `kubectl set image` + `rollout status --timeout=120s`

#### Scenario: Deployment schlägt back bei Rollout-Timeout fehl

- **GIVEN** das neue Website-Image startet nicht innerhalb von 120 Sekunden in einem der Namespaces
- **WHEN** `kubectl rollout status deployment/website --timeout=120s` im betroffenen Deploy-Job läuft
- **THEN** gibt kubectl Exit-Code 1 zurück und nur der betroffene Deploy-Job schlägt fehl — der andere Brand-Deploy-Job ist davon nicht betroffen

#### Scenario: korczewski Deploy bleibt unabhängig von mentolder Fehler

- **GIVEN** der `deploy-mentolder`-Job schlägt fehl (z.B. Rollout-Timeout, Secret-Check-Fail)
- **WHEN** der Workflow-Status ermittelt wird
- **THEN** läuft der `deploy-korczewski`-Job weiter und berichtet seinen eigenen Status — er wird NICHT übersprungen

### Requirement: build-website-korczewski.yml Deploy-Coverage

**Reason:** `build-website-korczewski.yml` wurde durch T001229 gelöscht und in `build-website.yml` konsolidiert. Die korczewski Deploy-Scenarios in dieser Requirement bezogen sich auf die standalone Workflow-Datei, die nicht mehr existiert. Die Abdeckung ist jetzt in "Website-Auto-Deploy bei main-Push" und "korczewski-deploy-parity" enthalten.

**Migration:** Tests in `tests/unit/website-ci-deploy.bats` wurden auf `build-website.yml` umgezeigt (T001229). Keine weitere Migration nötig.

#### Scenario: Standalone korczewski workflow stays removed

- **GIVEN** the repository working tree
- **WHEN** listing `.github/workflows/`
- **THEN** `build-website-korczewski.yml` does not exist
- **AND** `build-website.yml` contains the korczewski deploy job that replaced it

<!-- merged from change delta ci-cd.md on 2026-06-28 -->

### Requirement: PR-Gate — Offline Tests (bestehend)

_Modification:_ Die vormalige LOC-Budget-Gate (S6, `task loc:check` als Teil
von `task test:code-quality`) wurde entfernt. `docs/code-quality/loc-budget.json`
und `scripts/check-loc-budget.mjs` wurden gelöscht; `task test:code-quality`
läuft wieder nur mit den S1-S4-Gates aus `task quality:check`.

#### Scenario: LOC budget gate stays removed from the offline test suite

- **GIVEN** the repository working tree
- **WHEN** inspecting `task test:code-quality` and the files `docs/code-quality/loc-budget.json` / `scripts/check-loc-budget.mjs`
- **THEN** neither file exists
- **AND** `task test:code-quality` runs only the S1-S4 gates from `task quality:check` (no `task loc:check` step)

<!-- merged from change delta ci-cd.md on 2026-06-30 -->

<!-- merged from change delta ci-cd.md on 2026-07-01 -->

<!-- merged from change delta ci-cd.md (7f483188c829) -->

<!-- merged from change delta ci-cd.md (f45c51b682b5) -->

<!-- merged from change delta ci-cd.md (8eaacfc8ebd8) -->

<!-- merged from change delta ci-cd.md (0b3b1136c4d9) -->

<!-- merged from change delta ci-cd.md (1dc42084c9ce) -->

<!-- merged from change delta ci-cd.md (fdfd0bdbb191) -->

<!-- merged from change delta ci-cd.md (09f88a1a461c) -->

<!-- merged from change delta ci-cd.md (676e3b2c8ba6) -->

<!-- merged from change delta ci-cd.md (df050d9283fb) -->

<!-- merged from change delta ci-cd.md (c5497ce75162) -->

<!-- merged from change delta ci-cd.md (06492af19066) -->

<!-- merged from change delta ci-cd.md (1129413b838e) -->

<!-- merged from change delta ci-cd.md (6bb051e0d77c) -->

<!-- merged from change delta ci-cd.md (b330e967471c) -->

<!-- merged from change delta ci-cd.md (6a5728424c67) -->

<!-- merged from change delta ci-cd.md (f20a97e73854) -->

<!-- merged from change delta ci-cd.md (bac1c7e638d2) -->

<!-- merged from change delta ci-cd.md (fb1e7338c8d4) -->

<!-- merged from change delta ci-cd.md (3dd5aa51846e) -->