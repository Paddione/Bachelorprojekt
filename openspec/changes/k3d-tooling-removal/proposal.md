# Proposal: k3d-tooling-removal

## Why

k3d ist seit T900120/T900145 abgebaut, der lokale Stack läuft auf devmesh (ADR-008). Das Repo
enthält trotzdem noch die Werkzeugkette für einen lokalen k3d-Cluster: `k3d-config.yaml` im
Root, die `cluster:*`-Tasks samt Wrappern (`up`, `down`, `workspace:up`, `dev:reset`), ein
systemd-Autostart-Skript und `k3d image import` in mehreren Build-Tasks. Keiner dieser Pfade
funktioniert noch, weil das k3d-Binary auf keinem Zielhost mehr existiert. Die Dateien führen
Leser in die Irre, auch externe Leser des Repos.

## What

- Lokale k3d-Werkzeugkette entfernen: `k3d-config.yaml`, `k3d/create-cluster.sh`,
  `k3d/teardown.sh`, `scripts/dev-reset.sh`, `scripts/dev-cluster-autostart.sh`, die
  `cluster:*`-Tasks in `Taskfile.yml` und den Legacy-Block in `taskfiles/Taskfile.dev-stack.yml`.
- Aufrufer löschen: `up`, `down`, `workspace:up`, `dev:reset`, `website:build:import`,
  `einvoice-sidecar:import`.
- `k3d image import` aus `brett:build`, `studio:build`, `workspace:transcriber-build` und
  `website:deploy` entfernen, `website:redeploy ENV=dev` bricht mit Hinweis ab.
- Hinweistexte auf `task cluster:create` umschreiben, veraltete Tests und Permission-Einträge
  entfernen.
- Neuer Guard `tests/spec/local-dev-mesh/k3d-tooling-removed.bats`.
- Spec-Deltas: ADDED in `local-dev-mesh`, MODIFIED AK-04 in `software-factory`, REMOVED je ein
  Autostart-Requirement in `website-core` und `workspace-deploy`.

Nicht im Umfang: das Verzeichnis `k3d/` (Produktionsbasis), `taskfiles/Taskfile.staging.yml`,
die SSH-Import-Tasks des entfernten Dev-Stacks in `Taskfile.dev-stack.yml` und die
devmesh-Abbauwerkzeuge unter `scripts/devmesh/`. Details: `design.md`.

_Ticket: T900310_
