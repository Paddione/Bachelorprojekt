# Delta Spec: fleet-operations (fix-penpot-public-uri)

## ADDED Requirements

### Requirement: Penpot kennt seine eigene öffentliche URL

Penpot MUSS seine öffentliche URI (`PENPOT_PUBLIC_URI`) aus der Env-Registry beziehen,
nicht als Literal im Manifest tragen. Die Variable ist in `environments/schema.yaml` mit
Dev-Default registriert und wird per envsubst in `k3d/penpot.yaml` eingesetzt — dasselbe
Muster wie `POCKET_ID_FRONTEND_URL` → `APP_URL` in `k3d/pocket-id.yaml`.

Die Variable MUSS in **beiden** `ENVSUBST_VARS`-Listen der `Taskfile.yml` stehen
(`workspace:deploy` und `flux:render`). Fehlt sie in einer davon, überlebt der Platzhalter
literal in das gerenderte Manifest — ein Fehlerbild, das schwerer zu erkennen ist als eine
falsche URL, weil es erst zur Laufzeit auffällt.

Jede Prod-Umgebung MUSS einen eigenen Wert setzen; ein stiller Rückfall auf den Dev-Default
ist genau der Zustand, den diese Requirement ausschließt.

#### Scenario: The dev environment resolves to the localhost URL

- **GIVEN** the dev environment (k3d) with no explicit `PENPOT_PUBLIC_URI` override
- **WHEN** `scripts/env-resolve.sh dev` exports the registry variables
- **THEN** `PENPOT_PUBLIC_URI` is `http://design.localhost`

#### Scenario: A production render carries the brand URL, not the dev URL

- **GIVEN** a fleet overlay for either brand
- **WHEN** the overlay is rendered through the `workspace:deploy` envsubst contract
- **THEN** every `PENPOT_PUBLIC_URI` entry equals `https://design.<PROD_DOMAIN>`
- **AND** no rendered entry contains `design.localhost`

#### Scenario: The placeholder never survives into a rendered manifest

- **GIVEN** the `${PENPOT_PUBLIC_URI}` placeholder in `k3d/penpot.yaml`
- **WHEN** either `workspace:deploy` or `flux:render` renders the manifest
- **THEN** the placeholder is substituted by both paths
- **AND** the literal string `${PENPOT_PUBLIC_URI}` appears in no rendered output
