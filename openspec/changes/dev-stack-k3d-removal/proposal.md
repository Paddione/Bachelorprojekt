# Proposal: dev-stack-k3d-removal

## Why

T900310 hat die lokale k3d-Werkzeugkette entfernt und dabei zwei k3d-Reste bewusst stehen
lassen. `taskfiles/Taskfile.dev-stack.yml` baut Images lokal und importiert sie per SSH mit
`k3d image import` in einen k3d-in-k3s-Stack auf `$DEV_NODE`. Dieser Host (`dev-vm`) ist nicht
mehr erreichbar. Der Dev-Stack läuft heute als Flux-Kustomization `flux-dev` in `workspace-dev`
auf `fleet`, und CI veröffentlicht die `:dev`-Images nach ghcr.io. `taskfiles/Taskfile.staging.yml`
deployt On-demand-Staging in einen lokalen k3d-Cluster, hat keine Aufrufer und nennt sich selbst
abgelöst. `docs/dev-stack/README.md` beschreibt noch den Stack auf dem abgebauten `k3s-1`.

## What

- `dev:redeploy:website` und `dev:redeploy:brett` starten nur noch das Deployment in
  `workspace-dev` neu. `k3d/dev-stack/{website,brett}-dev.yaml` setzen `imagePullPolicy: Always`.
- Aus `Taskfile.dev-stack.yml` entfallen `build:website`, `build:brett`, `apply`, `deploy`
  und `_materialise-secrets`. Es bleiben `logs`, `psql`, `tunnel`, `firewall:open`, `db:refresh`
  und die beiden `redeploy:*`-Tasks.
- `taskfiles/Taskfile.staging.yml`, sein Include, `k3d/staging-stack/`, `scripts/staging-id.sh`
  und `tests/unit/staging.bats` entfallen, die Staging-Fälle in `tests/spec/security.bats`
  ebenso.
- Skills und Doku (`deploy-routing`, dev-flow-execute Schritt 4, `docs/dev-stack/README.md`)
  beschreiben den Flux-Stand.
- Spec-Deltas: MODIFIED/ADDED in `local-dev-mesh`, MODIFIED `Dev-Build-Safety` in `ci-cd`,
  REMOVED zwei Staging-Requirements in `workspace-deploy`.

Nicht im Umfang: die Variablen `DEV_NODE`, `DEV_SSH_USER`, `DEV_SSH_ALLOWLIST` (noch von
`workspace:deploy`, `prod-korczewski` und `Taskfile.brainstorm.yml` gelesen) und der
Flux-Staging-Stack `prod-fleet/staging`. Details: `design.md`.

_Ticket: T900332_
