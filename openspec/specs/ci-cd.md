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

---

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

#### Scenario: Freshness-Regen erzeugt Rebase-Konflikt auf generiertem Artefakt

- **GIVEN** ein PR committed `docs/generated/graph.json` neu und `freshness-regen.yml` hat nach dem letzten main-Push dieselbe Datei automatisch neu committet
- **WHEN** der Entwickler `git rebase origin/main` auf dem PR-Branch ausführt
- **THEN** entsteht ein Merge-Konflikt in `docs/generated/graph.json`
- **AND** die korrekte Auflösung ist `git checkout --ours docs/generated/graph.json && git add docs/generated/graph.json` — nicht manuelles Mergen

#### Scenario: .gitattributes merge=ours-Driver automatisiert die Auflösung

- **GIVEN** `task secrets:install-hooks` wurde ausgeführt und hat `git config merge.ours.driver true` gesetzt
- **WHEN** `git rebase origin/main` auf einem Branch läuft, der mit einem Freshness-Regen-Commit konfligiert
- **THEN** wendet Git den `merge=ours`-Driver aus `.gitattributes` automatisch an und löst den Konflikt zugunsten des PR-Branch auf — kein manueller `git checkout --ours` nötig

---

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

The system SHALL validate PR title scopes against the semantic-PR allowlist from `ci.yml` before `gh pr create` and SHALL exit 0 for valid scopes, exit non-zero with an allowlist hint for unknown scopes, and exit 2 if the workflow file is missing.

#### Scenario: Gültiger Scope besteht die Validierung *(BATS)*
- **GIVEN** ein PR-Titel `feat(admin): add dashboard` und eine `ci.yml` mit `admin` im Scope-Allowlist
- **WHEN** `scripts/preflight-pr-scope.sh` mit Titel und Workflow-Pfad aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0

#### Scenario: Ungültiger Scope schlägt fehl mit Allowlist-Hinweis *(BATS)*
- **GIVEN** ein PR-Titel `feat(cockpit): add view` wobei `cockpit` nicht im Allowlist steht
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code ≠ 0 und gibt "NOT in the semantic-PR allowlist" sowie die erlaubten Scopes aus

#### Scenario: Scope-loser Titel wird akzeptiert *(BATS)*
- **GIVEN** ein PR-Titel `docs: update readme` ohne Scope-Klammer
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0 und gibt einen "no scope"-Hinweis aus

#### Scenario: Fehlende Workflow-Datei liefert Exit-Code 2 *(BATS)*
- **GIVEN** der angegebene Workflow-Pfad `/nonexistent/ci.yml` existiert nicht
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code 2

#### Scenario: Gültiger Scope mit Breaking-Change-Marker wird akzeptiert *(BATS)*
- **GIVEN** ein PR-Titel `feat(db)!: breaking schema` mit `!` nach dem Scope
- **WHEN** `scripts/preflight-pr-scope.sh` aufgerufen wird
- **THEN** liefert das Skript Exit-Code 0 — der Breaking-Change-Marker beeinflusst die Scope-Validierung nicht

---

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
<!-- bats: discover-versions.bats -->

The system SHALL discover current versions of k3s, sealed-secrets-chart, cert-manager, and longhorn-chart from GitHub API and Helm repos, SHALL print them in dry-run mode without writing a file, and SHALL write a `versions.yaml` with all required keys when `--update` is passed; Flux SHALL NOT be tracked (fleet is push-based, no GitOps controller).

#### Scenario: Dry-Run gibt alle erkannten Versionen aus *(BATS)*
- **GIVEN** `curl` und `helm` sind durch Stubs ersetzt (k3s: v1.99.0+k3s1, sealed-secrets: 9.1.0, cert-manager: v9.2.0, longhorn: 9.3.0)
- **WHEN** `bash scripts/discover-versions.sh` ohne Flags ausgeführt wird
- **THEN** liefert Exit-Code 0 und die Ausgabe enthält alle vier Versionen — kein `flux:`-Eintrag

#### Scenario: Dry-Run schreibt keine Datei *(BATS)*
- **GIVEN** Stubs für `curl` und `helm` sind aktiv
- **WHEN** `bash scripts/discover-versions.sh` ohne `--update` ausgeführt wird
- **THEN** liefert Exit-Code 0 und keine `versions.yaml`-Datei wird erstellt

#### Scenario: --update schreibt versions.yaml mit allen Pflicht-Keys *(BATS)*
- **GIVEN** Stubs für `curl` und `helm` sind aktiv
- **WHEN** `bash scripts/discover-versions.sh --update --versions-file <pfad>` ausgeführt wird
- **THEN** liefert Exit-Code 0, die Datei enthält `k3s:`, `sealed_secrets_chart:`, `cert_manager:`, `longhorn_chart:` — aber keinen `flux:`-Key

#### Scenario: --update schreibt korrekte Werte in versions.yaml *(BATS)*
- **GIVEN** Stubs liefern k3s v1.99.0+k3s1 und longhorn 9.3.0
- **WHEN** `bash scripts/discover-versions.sh --update --versions-file <pfad>` ausgeführt wird
- **THEN** enthält die Datei `k3s: v1.99.0+k3s1` und `longhorn_chart: 9.3.0`

#### Scenario: versions.yaml hat managed-by-Kommentar auf erster Zeile *(BATS)*
- **GIVEN** `--update` wurde ausgeführt
- **WHEN** die erste Zeile von `versions.yaml` gelesen wird
- **THEN** enthält sie "discover-versions.sh" — Maschinen-generiert, kein manuelles Editieren vorgesehen

#### Scenario: Leerer tag_name aus curl führt zu Exit-Code ≠ 0 mit ERROR *(BATS)*
- **GIVEN** `curl` gibt `{"tag_name":""}` zurück
- **WHEN** `bash scripts/discover-versions.sh` ausgeführt wird
- **THEN** liefert Exit-Code ≠ 0 und die Ausgabe enthält "ERROR"

---

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

<!-- merged from change delta ci-cd.md on 2026-06-28 -->

### Requirement: PR-Gate — Offline Tests (bestehend)

_Modification:_ Die vormalige LOC-Budget-Gate (S6, `task loc:check` als Teil
von `task test:code-quality`) wurde entfernt. `docs/code-quality/loc-budget.json`
und `scripts/check-loc-budget.mjs` wurden gelöscht; `task test:code-quality`
läuft wieder nur mit den S1-S4-Gates aus `task quality:check`.

<!-- merged from change delta ci-cd.md on 2026-06-30 -->

<!-- merged from change delta ci-cd.md on 2026-07-01 -->