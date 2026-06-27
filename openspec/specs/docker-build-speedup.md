# docker-build-speedup


<!-- merged from change delta docker-build-speedup.md on 2026-06-27 -->

### Requirement: Layer-Caching für alle CI-gebauten Docker-Images

The system SHALL build every CI-built Docker image with reusable layer caching: each affected
Dockerfile SHALL declare `# syntax=docker/dockerfile:1` as its first line and SHALL mount a
BuildKit cache (`--mount=type=cache`) on its dependency-install layer (npm → `/root/.npm`,
pnpm → `/root/.local/share/pnpm/store`, pip → `/root/.cache/pip`), and each affected workflow
SHALL build via `docker/build-push-action@v6` with `cache-from: type=gha` and
`cache-to: type=gha`, using `mode=max` only for heavy images (website, videovault, transcriber)
and `mode=min` for light images (docs, collabora, brett, mediaviewer-widget, mentolder-web).

#### Scenario: Dependency-Layer trägt einen Cache-Mount

- **GIVEN** ein CI-gebautes Dockerfile mit einem npm/pnpm/pip-Dependency-Install-Schritt
- **WHEN** die erste Zeile und der Install-`RUN` geprüft werden
- **THEN** ist die erste Zeile `# syntax=docker/dockerfile:1` und der Install-`RUN` trägt einen
  zum Paketmanager passenden `--mount=type=cache`-Eintrag

#### Scenario: Workflow nutzt GHA-Layer-Cache mit budgetbewusstem Modus

- **GIVEN** ein CI-Workflow, der ein Docker-Image baut und pusht
- **WHEN** der Build-Step geprüft wird
- **THEN** verwendet er `docker/build-push-action@v6` mit `cache-from: type=gha` und
  `cache-to: type=gha`, wobei `mode=max` ausschließlich für die schweren Images
  (website, videovault, transcriber) und `mode=min` für die leichten gesetzt ist

#### Scenario: Interface-Kontrakt bleibt beim Build-Mechanismus-Wechsel erhalten

- **GIVEN** ein von Shell-`docker build` auf `build-push-action` umgestellter Workflow
- **WHEN** Image-Name, Tags, `build-args` und die `GITHUB_ENV`-Outputs `IMAGE`/`SHA_TAG` mit dem
  vorherigen Zustand verglichen werden
- **THEN** sind sie unverändert, und alle nachgelagerten Deploy-/Rollout-Steps funktionieren
  unverändert

### Requirement: Kein `--no-cache` in Build-Workflows

The system SHALL NOT pass `--no-cache` to any Docker build in the CI build workflows, so that
layer caching is never hard-disabled.

#### Scenario: Build-Workflows enthalten kein `--no-cache`

- **GIVEN** die CI-Build-Workflows unter `.github/workflows/build-*.yml`
- **WHEN** sie nach `--no-cache` durchsucht werden
- **THEN** findet sich kein Vorkommen

### Requirement: Schlankes Website-Runtime-Image

The system SHALL produce the website runtime image without devDependencies by running
`npm prune --omit=dev` in the build stage before the runtime stage copies `node_modules`, while
intentionally retaining Chromium, kubectl and the `tests/` directory for the in-cluster test
runner. The pruned image SHALL boot via `node ./dist/server/entry.mjs` and serve HTTP 200 on `/`.

#### Scenario: devDependencies sind aus dem Runtime-Image entfernt

- **GIVEN** der `website/Dockerfile`-Build-Stage
- **WHEN** der Schritt nach `npm run build` geprüft wird
- **THEN** läuft `npm prune --omit=dev`, bevor der Runtime-Stage `node_modules` kopiert

#### Scenario: Geprüntes Runtime-Image bootet und antwortet

- **GIVEN** das lokal gebaute schlanke Website-Image
- **WHEN** es gestartet wird und `/` per HTTP abgefragt wird
- **THEN** bootet der Server und antwortet mit HTTP 200; fehlt ein runtime-nötiges Paket, wird es
  in `website/package.json` von `devDependencies` nach `dependencies` verschoben statt den Prune
  zurückzunehmen

### Requirement: Ein geteiltes Website-Image für beide Brands

The system SHALL build the website exactly once into a single shared image
(`ghcr.io/paddione/website`) and deploy that same SHA-tagged image to both brand namespaces,
because the image is brand-neutral (brand differentiation happens at runtime via `process.env`,
not at build time). There SHALL NOT be a second workflow that rebuilds a byte-identical
per-brand website image.

#### Scenario: Beide Brands ziehen dasselbe geteilte Image

- **GIVEN** ein Push, der die Website-Build-Pipeline auslöst
- **WHEN** die Deployments in `website` und `website-korczewski` nach dem Rollout geprüft werden
- **THEN** zeigen beide auf denselben `ghcr.io/paddione/website:<sha>`-Tag, und es existiert kein
  separater `build-website-korczewski.yml`-Build/Push mehr

#### Scenario: Konsolidierung nur bei build-time-neutralem Brand-Verhalten

- **GIVEN** der `website/src`-Quellbaum
- **WHEN** auf brand-differenzierende, zur Build-Zeit gesetzte `import.meta.env`-Konstanten geprüft
  wird
- **THEN** existiert keine solche Konstante (alle Brand-Reads fallen zur Runtime auf
  `process.env` zurück), womit die Konsolidierung zu einem geteilten Image sicher ist

### Requirement: amd64-only Builds für die Multi-Arch-Workflows

The system SHALL build the transcriber and collabora images for `linux/amd64` only and SHALL NOT
build a `linux/arm64` variant via QEMU emulation, because the fleet cluster is amd64-only.

#### Scenario: Multi-Arch-Workflows bauen nur amd64

- **GIVEN** `build-transcriber.yml` und `build-collabora.yml`
- **WHEN** das `platforms`-Feld des Build-Steps geprüft wird
- **THEN** steht dort `linux/amd64` (kein `linux/arm64`), und es existiert kein
  `docker/setup-qemu-action`-Step mehr

#### Scenario: amd64-only ist durch ein Pre-flight abgesichert

- **GIVEN** der fleet-Cluster vor dem Entfernen von arm64
- **WHEN** `kubectl --context fleet get nodes -o wide` ausgeführt wird
- **THEN** ist die Architektur aller Nodes `amd64`, womit der arm64-Build nachweislich ungenutzt ist
