## MODIFIED Requirements

### Requirement: Image-Pinning-Regeln für Core-Services

The system SHALL ensure that no core service container image uses the `:latest` tag, that
all images carry either an explicit version tag or a digest, and that MCP sidecar images,
internal build images (`paddione/bachelorprojekt`, `workspace-brett`, `videovault`,
`mediaviewer-widget`, `mentolder-web`) are exempt from the `:latest` prohibition.

#### Scenario: Core-Images ohne :latest

- **GIVEN** die gerenderten Manifests aus `kubectl kustomize k3d/`
- **WHEN** alle `image:`-Felder ausgelesen werden
- **THEN** enthält kein Core-Service-Image das Tag `:latest`
- **AND** jedes Image-Feld enthält entweder `:` (Versions-Tag) oder `@` (Digest)

#### Scenario: :latest bei internen Build-Images erlaubt

- **GIVEN** `k3d/website.yaml`, `k3d/brett.yaml`, `k3d/videovault.yaml`,
  `k3d/mediaviewer-widget.yaml`, `k3d/mentolder-web.yaml` u.a. nutzen `:latest`
  für intern gebaute Images (`paddione/bachelorprojekt*`, `workspace-brett`,
  `videovault`, `mediaviewer-widget`, `mentolder-web`, etc.)
- **WHEN** der Image-Pinning-Check ausgeführt wird
- **THEN** werden diese Images von der `:latest`-Prüfung ausgenommen
- **AND** der Check schlägt nur fehl, wenn ein Drittanbieter-Core-Image `:latest` trägt

### Requirement: ENV= immer explizit angeben

The system SHALL require an explicit `ENV=<name>` parameter for all environment-sensitive tasks (`workspace:deploy`, `workspace:office:deploy`, `workspace:post-setup`, `workspace:talk-setup`), and SHALL default silently to `ENV=dev` when the parameter is omitted — this silent default means an omitted `ENV=` with a non-dev active kubectl context will deploy to whatever cluster is currently active without any warning.

#### Scenario: Fehlender ENV= mit falschem kubectl-Kontext

- **GIVEN** der aktive kubectl-Kontext ist `fleet` (Produktionscluster) und `ENV=` wird nicht gesetzt
- **WHEN** `task workspace:deploy` ohne ENV-Parameter aufgerufen wird
- **THEN** läuft der Task mit `ENV=dev` und baut den `k3d/`-Basis-Build
- **AND** der kubectl-Kontext-Mismatch-Check greift nicht (er prüft nur wenn `ENV != dev`), sodass der dev-Build auf dem Prod-Cluster angewendet wird

## REMOVED Requirements

### Requirement: Collabora Discovery-Endpoint und Docs-Site nach Deploy erreichbar

Split: the Collabora scenario continues standalone (see ADDED); the docs scenario is obsolete with the sites.

## ADDED Requirements

### Requirement: Collabora Discovery-Endpoint nach Deploy erreichbar

The system SHALL ensure that after `task workspace:office:deploy` the Collabora discovery endpoint responds with a WOPI discovery XML.

#### Scenario: Collabora WOPI Discovery antwortet *(E2E)*

- **GIVEN** `task workspace:office:deploy ENV=mentolder` wurde nach `workspace:deploy` ausgeführt
- **WHEN** GET `https://office.<PROD_DOMAIN>/hosting/discovery` gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 200 und der Body enthält `wopi-discovery`
