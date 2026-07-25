## ADDED Requirements

### Requirement: Cross-namespace OIDC discovery URL

The system SHALL resolve `POCKET_ID_URL` to a fully-qualified cluster DNS name
(`<service>.<namespace>.svc.cluster.local`) in every deploy path, including every
fallback default.

The website Deployment runs in namespace `website` while Pocket ID runs in `workspace`
(`workspace-korczewski` for the korczewski brand). A bare service short name such as
`http://pocket-id:1411` only resolves from inside Pocket ID's own namespace; from the
website pod it fails DNS resolution, so the server-side OIDC token exchange never
reaches the identity provider.

#### Scenario: Deploy without a resolved environment falls back to an FQDN

- **GIVEN** a deploy path where `POCKET_ID_URL` is not set because the environment was
  not resolved via `scripts/env-resolve.sh`
- **WHEN** the deploy renders the website manifests
- **THEN** the fallback value SHALL be a fully-qualified name ending in
  `.svc.cluster.local`
- **AND** it SHALL NOT contain an empty namespace segment (`pocket-id..svc`) even when
  `WORKSPACE_NAMESPACE` is unset

#### Scenario: Token exchange reaches the identity provider

- **GIVEN** a user who has completed the passkey challenge at the Pocket ID authorize
  endpoint
- **WHEN** the website handles the OIDC callback and exchanges the authorization code
- **THEN** the request SHALL reach Pocket ID's token endpoint and be answered with
  `POST /api/oidc/token` 200
- **AND** the callback SHALL NOT fail with a connection-level error such as
  `TypeError: fetch failed`

### Requirement: Configuration changes trigger a pod rollout

The system SHALL annotate the website pod template with a content hash of the rendered
configuration, computed after variable substitution, so that a changed configuration
value forces a new rollout.

`website-config` is consumed via `envFrom: configMapRef`. Those values are copied into
the process environment at container start and do not propagate when the ConfigMap is
updated — unlike a mounted ConfigMap volume. Without a checksum annotation a corrected
ConfigMap leaves running pods on the stale value indefinitely.

The hash MUST be computed after `envsubst`. A Kustomize `configMapGenerator` name-suffix
hash is not sufficient: the deploy pipeline renders with `kustomize build | envsubst`,
so Kustomize only ever sees the unsubstituted placeholder and produces an identical
suffix for both a correct and an incorrect value.

#### Scenario: Changed configuration value produces a different checksum

- **GIVEN** two deploys of the same manifests that differ only in the value substituted
  for `POCKET_ID_URL`
- **WHEN** each deploy computes the `checksum/config` annotation from its rendered
  output
- **THEN** the two annotation values SHALL differ
- **AND** applying the second manifest SHALL cause the Deployment to roll out new pods

#### Scenario: Every render path sets the annotation

- **GIVEN** the website is deployed through any supported path — the Taskfile dev
  branch, the Taskfile production overlay branch, or either brand job of the
  build-website workflow
- **WHEN** that path applies the website manifests
- **THEN** it SHALL set the `checksum/config` annotation from its own rendered output
- **AND** no path SHALL apply the manifests leaving the annotation placeholder
  unsubstituted
