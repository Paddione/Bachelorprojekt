## ADDED Requirements

### Requirement: Dev envsubst list includes STUDIO_IMAGE

The dev `envsubst` variable list in `Taskfile.yml` (`workspace:deploy` task) SHALL include
`$STUDIO_IMAGE` so that the `studio-server` Deployment manifest renders with a valid image
reference instead of the literal `${STUDIO_IMAGE}` placeholder.

#### Scenario: dev deploy renders studio-server image

- **GIVEN** the `workspace:deploy` task runs with `ENV=dev`
- **WHEN** `kustomize build k3d/` is processed through `envsubst`
- **THEN** the `studio-server` container image is rendered as `studio-server:latest` (or the configured value)
- **AND** no literal `${STUDIO_IMAGE}` remains in the rendered manifest

#### Scenario: prod deploy unchanged

- **GIVEN** the `workspace:deploy` task runs with a prod ENV
- **WHEN** the `ENVSUBST_VARS` list is evaluated
- **THEN** `$STUDIO_IMAGE` is already present (no change required for prod)
