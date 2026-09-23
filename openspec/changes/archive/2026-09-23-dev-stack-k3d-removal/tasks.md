---
title: "dev-stack-k3d-removal — Implementation Plan"
ticket_id: T900332
domains: [infra, tests, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dev-stack-k3d-removal — Implementation Plan

_Ticket: T900332_ · Design: `openspec/changes/dev-stack-k3d-removal/design.md`

## File Structure

```
DELETED:
taskfiles/Taskfile.staging.yml
scripts/staging-id.sh
k3d/staging-stack/ingress-staging.yaml
k3d/staging-stack/kustomization.yaml
k3d/staging-stack/namespace.yaml
k3d/staging-stack/shared-db-staging.yaml
k3d/staging-stack/website-staging.yaml
k3d/dev-stack/cert-manager.yaml
k3d/dev-stack/traefik-tls.yaml
tests/unit/staging.bats

CHANGED:
Taskfile.yml
taskfiles/Taskfile.dev-stack.yml
k3d/dev-stack/website-dev.yaml
k3d/dev-stack/brett-dev.yaml
k3d/dev-stack/kustomization.yaml
k3d/dev-stack/sish.yaml
dev-local/cluster/tls.yaml
docs/dev-stack/README.md
.opencode/skills/references/deploy-routing.md
.opencode/skills/dev-flow-execute/SKILL.md
tests/spec/local-dev-mesh/k3d-tooling-removed.bats
tests/spec/security.bats
tests/unit/dev-build-safety.bats
components/website/src/data/test-inventory.json

NEW:
tests/spec/local-dev-mesh/dev-stack-tasks.bats
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-taskfiles-manifests.md | implement | Taskfile.yml, taskfiles/Taskfile.dev-stack.yml, taskfiles/Taskfile.staging.yml, scripts/staging-id.sh, k3d/staging-stack/ingress-staging.yaml, k3d/staging-stack/kustomization.yaml, k3d/staging-stack/namespace.yaml, k3d/staging-stack/shared-db-staging.yaml, k3d/staging-stack/website-staging.yaml, k3d/dev-stack/cert-manager.yaml, k3d/dev-stack/traefik-tls.yaml, k3d/dev-stack/website-dev.yaml, k3d/dev-stack/brett-dev.yaml, k3d/dev-stack/kustomization.yaml, k3d/dev-stack/sish.yaml, dev-local/cluster/tls.yaml | |
| p2 | tasks.d/p2-docs-skills.md | implement | docs/dev-stack/README.md, .opencode/skills/references/deploy-routing.md, .opencode/skills/dev-flow-execute/SKILL.md | |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/local-dev-mesh/k3d-tooling-removed.bats, tests/spec/local-dev-mesh/dev-stack-tasks.bats, tests/spec/security.bats, tests/unit/dev-build-safety.bats, tests/unit/staging.bats, components/website/src/data/test-inventory.json | |

Reihenfolge bei manueller Ausführung: zuerst die RED-Schritte aus p3, dann p1 und p2, dann der
Rest von p3 (GREEN).

## Final Verification

- [ ] Guards und betroffene Tests grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/ tests/spec/security.bats tests/unit/dev-build-safety.bats
```

- [ ] Task-Graph und Manifeste:

```bash
task --list-all >/dev/null
task --dry dev:redeploy:website
task --dry dev:secrets
kubectl kustomize k3d/dev-stack/ >/dev/null
kubectl kustomize prod-fleet/dev/ >/dev/null
task workspace:validate
```

- [ ] Keine Restreferenz auf entfernte Tasks oder Dateien:

```bash
git grep -nE 'dev:(apply|deploy|build:website|build:brett)\b|Taskfile\.staging|staging-id\.sh|k3d/staging-stack|dev-stack/(cert-manager|traefik-tls)\.yaml|k3d image import' -- . ':!openspec/changes/archive' ':!openspec/changes/dev-stack-k3d-removal' ':!docs/superpowers' ':!k3d/docs-content-built' ':!CHANGELOG.md' ':!scripts/devmesh' ':!tests/spec/local-dev-mesh' ':!tests/spec/sdlc-isolation'
```

- [ ] Mandatory CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
