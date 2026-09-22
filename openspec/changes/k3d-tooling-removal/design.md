---
title: "k3d-tooling-removal — Design"
ticket_id: T900310
status: active
---

# k3d-tooling-removal — Design

_Ticket: T900310_

## Kontext

k3d ist seit T900120/T900145 abgebaut, der lokale Stack läuft auf dem k3s-Cluster `devmesh`
(ADR-008, `environments/dev.yaml` → `context: devmesh`). Im Repo steht trotzdem noch die
Werkzeugkette für einen lokalen k3d-Cluster: `k3d-config.yaml` im Root, die Tasks
`cluster:create|delete|start|stop|status`, Wrapper, die sie aufrufen, und `k3d image import`
in mehreren Build-Tasks. Das k3d-Binary ist auf keinem Zielhost mehr vorhanden, jeder dieser
Pfade schlägt heute fehl. Nach außen wirkt `k3d-config.yaml` im Root wie aktive Konfiguration.

Das Verzeichnis `k3d/` bleibt. Es enthält die Kustomize-Basis der Produktion, nur der Name ist
historisch.

## Entscheidungen

**D1 — Umfang: Kern plus lokale Image-Imports (User-Entscheidung).** Entfernt werden die
lokale Cluster-Werkzeugkette und alle `k3d image import`-Aufrufe in `Taskfile.yml`. Nicht
entfernt wird `taskfiles/Taskfile.staging.yml`.

**D2 — Aufrufer werden gelöscht, nicht umgebogen (User-Entscheidung).** `up`, `down` und
`workspace:up` existieren nur, um `cluster:create`/`cluster:delete` zu umschließen.
`workspace:setup` deckt den Deploy auf einem bestehenden Cluster bereits ab.

**D3 — Build-Tasks bauen im Dev-Zweig nur noch lokal.** `brett:build`, `studio:build`, `docs:build:import` und
`workspace:transcriber-build` verlieren den Import-Schritt und melden „Image gebaut". Die Tasks
`website:build:import` und `einvoice-sidecar:import` entfallen ganz. `website:deploy ENV=dev`
ruft den Import nicht mehr auf und deployt das Image aus der Registry. `website:redeploy ENV=dev`,
`brett:deploy ENV=dev` und `studio:deploy ENV=dev` brechen mit einer Meldung ab, die auf
Registry-Images (CI-Build nach ghcr.io) und den passenden Folge-Task verweist, weil ein lokaler
Rebuild ohne Import dort nichts bewirkt — vorher rollten diese beiden Deploy-Tasks im Dev-Zweig
lokal gebaute Images aus, die devmesh nie erreichten, und meldeten trotzdem Erfolg.

**D4 — Hinweistexte werden umgeschrieben.** Meldungen, die `task cluster:create` empfehlen
(`website:deploy`, `workspace:admin-users-setup`, `scripts/pre-deploy-checks-lib.sh`,
`tests/lib/k3d.sh`, `tests/runner.sh`, `tests/README.md`), verweisen danach auf den
erreichbaren kube-Context bzw. devmesh.

**D5 — `tests/lib/k3d.sh` bleibt unter seinem Namen.** Die Datei ist ein allgemeiner
Test-Helper, den rund 20 Testskripte `source`n. Ein Umbenennen gehört nicht in diesen Change;
geändert wird nur der Hinweistext in `k3d_wait`.

**D6 — `Taskfile.dev-stack.yml`: nur der Legacy-Block.** `cluster:create_legacy`,
`cluster:delete`, `cluster:status` und `cluster:autostart` entfallen, zusammen mit
`scripts/dev-cluster-autostart.sh`. `build:website`, `build:brett` und `apply` importieren per
SSH in den entfernten k3d-in-k3s-Stack auf `$DEV_NODE`. Dessen Abbau ist ein eigenes Thema
(Folgeticket), diese Tasks bleiben unverändert.

**D7 — Devmesh-Abbauwerkzeuge bleiben.** `scripts/devmesh/k3d-teardown.sh`,
`scripts/devmesh/migrate-from-k3d.sh` und ihre Tests sowie die Abwesenheits-Guards
(`tests/spec/sdlc-isolation/sdlc-up-command.bats`) werden nicht angefasst.

**D8 — Guard statt Einzelprüfung.** Ein neuer BATS-Test unter
`tests/spec/local-dev-mesh/k3d-tooling-removed.bats` hält das Ergebnis fest. Er liest die
Task-Liste über `task --list-all` (Command-Output) mit Positiv-Anker `workspace:deploy` und
prüft die Abwesenheit der entfernten Dateien. Die Aussage „kein `k3d image import` in
`Taskfile.yml`" ist eine Querschnittsprüfung am Quelltext, der Testkopf dokumentiert den
Prüfmodus.

## Spec-Deltas

| SSOT | Art | Inhalt |
|---|---|---|
| `local-dev-mesh` | ADDED | „The repository ships no local k3d cluster tooling" |
| `software-factory` | MODIFIED | AK-04 ohne das Szenario „k3d-Konfiguration im Repo vorhanden" |
| `website-core` | REMOVED | „Dev-Cluster startet automatisch nach Host-Reboot (T000290)" |
| `workspace-deploy` | REMOVED | „Dev-Cluster-Autostart-Unit startet Cluster, erstellt ihn nie neu" |

## Betroffene Dateien

Löschen: `k3d-config.yaml`, `k3d/create-cluster.sh`, `k3d/teardown.sh`, `scripts/dev-reset.sh`,
`scripts/dev-cluster-autostart.sh`, `tests/unit/dev-cluster-autostart.bats`,
`tests/unit/scripts/dev-reset.test.sh`.

Ändern: `Taskfile.yml`, `taskfiles/Taskfile.dev-stack.yml`, `.claude/settings.json`,
`dotfiles/agy/settings.json`, `scripts/pre-deploy-checks-lib.sh`, `tests/lib/k3d.sh`,
`tests/runner.sh`, `tests/README.md`, `tests/spec/workspace-deploy.bats` (Test T001853 zum
`hostPort` entfällt).

Neu: `tests/spec/local-dev-mesh/k3d-tooling-removed.bats`.

## Risiken

- **R1:** Ein Task ruft einen entfernten Task auf und Task bricht beim Auflösen ab. Abhilfe: der
  Guard führt `task --list-all` aus, das bei unauflösbaren Referenzen nicht scheitert. Deshalb
  prüft der Verify-Schritt zusätzlich `task --dry workspace:setup ENV=dev` und
  `task --dry website:deploy ENV=dev`.
- **R2:** `CLUSTER_NAME` wird nach dem Entfernen in `Taskfile.yml` nicht mehr gelesen. Die
  Variable bleibt stehen, falls ein inkludiertes Taskfile sie erbt (`Taskfile.dev-stack.yml`
  setzt einen eigenen Default). Entfernen gehört in das Folgeticket zu D6.
