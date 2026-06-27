# fix-coaching-studio-prod-manifest

## Purpose

Der Coaching-Studio-Overlay in `prod-fleet/mentolder/kustomization.yaml` wird von einem eigenständigen Resource auf einen strategischen Patch umgestellt, der nur die Felder `spec.template.spec.nodeSelector`, `spec.template.spec.affinity` und `spec.template.spec.containers[0].image` des base-`studio-server`-Deployments überschreibt. Damit verschwindet die Drift-Anfälligkeit zwischen dem Studio-Deployment in der Base-Schicht und der prod-spezifischen Anpassung.

## Requirements

### Requirement: Studio-Overlay als Kustomize-Patch

The system SHALL replace the `- studio.yaml` resource entry in `prod-fleet/mentolder/kustomization.yaml` with a `patches:` entry that targets the base `studio-server` Deployment (`group: apps`, `version: v1`, `kind: Deployment`, `name: studio-server`, `path: studio.yaml`). The same patch SHALL be added to `prod-fleet/korczewski/kustomization.yaml` once the korczewski overlay exists.

#### Scenario: prod-fleet/mentolder Studio-Overlay ist ein Patch

- **GIVEN** `prod-fleet/mentolder/kustomization.yaml`
- **WHEN** nach `studio.yaml` und `patches:` gesucht wird
- **THEN** findet `grep` einen `patches:`-Block mit `target.name=studio-server` und `path=studio.yaml`
- **AND** `studio.yaml` ist NICHT mehr unter `resources:` aufgeführt

### Requirement: STUDIO_IMAGE_DIGEST in envsubst registriert

The system SHALL register `STUDIO_IMAGE_DIGEST` in `environments/schema.yaml` as a required `string` under the `studio:` section, and SHALL append `$STUDIO_IMAGE_DIGEST` to the `ENVSUBST_VARS` accumulator in every `workspace:deploy` and `fleet:deploy` Taskfile block that builds the prod manifest.

#### Scenario: envsubst-Validierung verlangt STUDIO_IMAGE_DIGEST

- **GIVEN** `STUDIO_IMAGE_DIGEST` ist nicht in `environments/.secrets/<env>.yaml` gesetzt
- **WHEN** `task env:validate ENV=mentolder` ausgeführt wird
- **THEN** meldet der Validator einen fehlenden required key `STUDIO_IMAGE_DIGEST` und exit 1

### Requirement: workspace:validate ist grün

The system SHALL pass `task workspace:validate` after the patch + envsubst registration, confirming the kustomize build resolves with the new STUDIO_IMAGE_DIGEST binding.

<!-- from archive/2026-06-21-fix-coaching-studio-prod-manifest/tasks.md lines 1-50 -->
