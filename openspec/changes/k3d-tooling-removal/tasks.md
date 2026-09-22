---
title: "k3d-tooling-removal — Implementation Plan"
ticket_id: T900310
domains: [infra, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# k3d-tooling-removal — Implementation Plan

_Ticket: T900310_ · Design: `openspec/changes/k3d-tooling-removal/design.md`

## File Structure

```
DELETED:
k3d-config.yaml
k3d/create-cluster.sh
k3d/teardown.sh
scripts/dev-reset.sh
scripts/dev-cluster-autostart.sh
tests/unit/dev-cluster-autostart.bats
tests/unit/scripts/dev-reset.test.sh

CHANGED:
Taskfile.yml
taskfiles/Taskfile.dev-stack.yml
scripts/pre-deploy-checks-lib.sh
.claude/settings.json
dotfiles/agy/settings.json
tests/lib/k3d.sh
tests/runner.sh
tests/README.md
tests/spec/workspace-deploy.bats
components/website/src/data/test-inventory.json

NEW:
tests/spec/local-dev-mesh/k3d-tooling-removed.bats
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-taskfiles.md | implement | Taskfile.yml, taskfiles/Taskfile.dev-stack.yml | |
| p2 | tasks.d/p2-scripts-settings.md | implement | k3d-config.yaml, k3d/create-cluster.sh, k3d/teardown.sh, scripts/dev-reset.sh, scripts/dev-cluster-autostart.sh, scripts/pre-deploy-checks-lib.sh, .claude/settings.json, dotfiles/agy/settings.json | |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/local-dev-mesh/k3d-tooling-removed.bats, tests/spec/workspace-deploy.bats, tests/unit/dev-cluster-autostart.bats, tests/unit/scripts/dev-reset.test.sh, tests/lib/k3d.sh, tests/runner.sh, tests/README.md, components/website/src/data/test-inventory.json | |

Reihenfolge bei manueller Ausführung: zuerst der RED-Schritt aus p3 (Guard schreiben, rot sehen),
dann p1 und p2, dann der Rest von p3 (GREEN).

## Final Verification

- [x] Guard und betroffene Testdateien grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/k3d-tooling-removed.bats tests/spec/workspace-deploy.bats
```

- [x] Task-Graph löst sich weiter auf (Design R1):

```bash
task --list-all >/dev/null
task --dry workspace:setup ENV=dev
task --dry website:deploy ENV=dev
```

- [x] Keine Restreferenz auf entfernte Tasks oder Dateien außerhalb von Archiv, Doku und devmesh-Abbauwerkzeugen:

```bash
git grep -nE 'k3d-config\.yaml|cluster:(create|delete|start|stop|status)\b|dev-reset\.sh|dev-cluster-autostart|website:build:import|einvoice-sidecar:import|k3d image import' -- . ':!openspec/changes/archive' ':!openspec/changes/k3d-tooling-removal' ':!docs' ':!k3d/docs-content-built' ':!CHANGELOG.md' ':!scripts/devmesh' ':!tests/spec/local-dev-mesh' ':!tests/spec/sdlc-isolation/sdlc-up-command.bats' ':!taskfiles/Taskfile.staging.yml' ':!taskfiles/Taskfile.dev-stack.yml'
```

  Verbleibende Treffer sind ausschließlich `openspec/specs/*.md` (bestehender SSOT-Inhalt,
  wird beim Archivieren via Delta-Spec aktualisiert) und ein bereits vor diesem Change
  fehlerhafter Kommentar in `environments/.secrets/.ssh/config` (referenziert einen nie
  existierenden Task `dev:cluster:create`) — beide außerhalb des File-Structure-Scopes dieses
  Plans, siehe Report.

- [x] Mandatory CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

  `task test:changed` zeigt einen einzelnen, vorbestehenden und unabhängigen Fehlschlag
  (`T003825: unveraenderte Binary erzeugt keinen Drift-Befund`,
  `tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats`) — verifiziert per
  `git diff origin/main..HEAD -- scripts/runtime-drift-check.sh
  tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats` (leer, keine Änderung
  in diesem Branch) und 3/3 identischer Fehlschlag bei isoliertem Lauf. `freshness:regenerate`
  + `freshness:check` beide grün nach Commit der Artefakte.
