## ADDED Requirements

### Requirement: POCKET_ID_TERMINAL_SECRET in schema and secrets

The `POCKET_ID_TERMINAL_SECRET` key SHALL be present in `environments/schema.yaml` with
`generate: true` so that `env:seal` can generate and seal it into `workspace-secrets`. A
dev placeholder SHALL exist in `k3d/secrets.yaml` so the dev cluster deploy succeeds.
The `pocket-id-client-seed` Job and the `oauth2-proxy-terminal` Deployment both reference
this key via `secretKeyRef`.

#### Scenario: schema declares POCKET_ID_TERMINAL_SECRET

- **GIVEN** `environments/schema.yaml` is read by `env:seal`
- **WHEN** the schema entry for `POCKET_ID_TERMINAL_SECRET` is evaluated
- **THEN** it has `generate: true`, `required: false`, and `length: 40`

#### Scenario: dev secret contains placeholder

- **GIVEN** `k3d/secrets.yaml` is rendered for the dev cluster
- **WHEN** the `workspace-secrets` Secret is created
- **THEN** it contains a `POCKET_ID_TERMINAL_SECRET` key with a valid placeholder value

#### Scenario: oauth2-proxy-terminal pod starts successfully

- **GIVEN** the `oauth2-proxy-terminal` Deployment references `POCKET_ID_TERMINAL_SECRET` as a `secretKeyRef`
- **WHEN** the pod is created in the `workspace` namespace
- **THEN** the container starts without `CreateContainerConfigError`
