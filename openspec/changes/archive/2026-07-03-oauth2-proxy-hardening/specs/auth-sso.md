# auth-sso — Delta (oauth2-proxy-hardening, T001579)

## ADDED Requirements

### Requirement: Prod oauth2-proxy gates MUST verify issuer TLS

All production oauth2-proxy deployments SHALL verify the TLS certificate of the OIDC issuer (`https://auth.${PROD_DOMAIN}`, Pocket-ID behind the Let's Encrypt wildcard certificate). The flag `--ssl-insecure-skip-verify` MUST NOT appear in any rendered production overlay. `--skip-oidc-discovery=true` with explicit `--login-url`/`--redeem-url`/`--oidc-jwks-url`/`--profile-url` endpoint flags remains the sanctioned configuration (decoupling pod start from issuer availability).

#### Scenario: Rendered prod overlay contains no TLS-skip flag

- **GIVEN** the production overlay `prod-fleet/mentolder` (or `prod-fleet/korczewski`)
- **WHEN** it is rendered with `kubectl kustomize --load-restrictor=LoadRestrictionsNone`
- **THEN** the rendered output contains no occurrence of `--ssl-insecure-skip-verify`

### Requirement: Gates MUST authorize via groups claim or explicit email allowlist

Every production oauth2-proxy gate SHALL use exactly one of two authorization methods: (a) Pocket-ID group membership via `--allowed-groups=workspace-users`, `--oidc-groups-claim=groups`, and `--scope=openid email profile groups`, or (b) an explicit email allowlist via `--authenticated-emails-file`. The wildcard authorization `--email-domain=*` MUST NOT appear in any production overlay.

#### Scenario: Group-based gates carry the groups-claim flags

- **GIVEN** the eight group-based gates (brain, brett, comfy, docs, downloads, mediaviewer, rustdesk-web, videovault) in the rendered `prod-fleet/mentolder` overlay
- **WHEN** their container args are inspected
- **THEN** each carries `--allowed-groups=workspace-users` and `--oidc-groups-claim=groups` and `--scope=openid email profile groups`, and none carries `--email-domain=*`

#### Scenario: Allowlist gates keep the email allowlist

- **GIVEN** the three allowlist gates (studio, traefik, mailpit) in the rendered `prod-fleet/mentolder` overlay
- **WHEN** their container args are inspected
- **THEN** each carries `--authenticated-emails-file` and none carries `--email-domain=*`

### Requirement: No insecure OIDC flags in prod overlays

Production oauth2-proxy gates SHALL enforce verified user emails. The flag `--insecure-oidc-allow-unverified-email` MUST NOT appear in any rendered production overlay. Before a production rollout of this enforcement, a staging (or live-token) verification MUST confirm that Pocket-ID issues `email_verified=true` for workspace users.

#### Scenario: Rendered prod overlay contains no unverified-email flag

- **GIVEN** the production overlay `prod-fleet/mentolder` (or `prod-fleet/korczewski`)
- **WHEN** it is rendered with `kubectl kustomize --load-restrictor=LoadRestrictionsNone`
- **THEN** the rendered output contains no occurrence of `--insecure-oidc-allow-unverified-email`

### Requirement: Seed job MUST provision the workspace-users group idempotently

The Pocket-ID client seed job (`k3d/pocket-id-client-seed.yaml`) SHALL idempotently ensure the user group `workspace-users` exists via the Pocket-ID Admin REST API (`X-API-KEY` auth, same pattern as client upsert). Group membership assignment is a documented one-time admin step, not automated by the seed job.

#### Scenario: Repeated seed runs converge

- **GIVEN** a Pocket-ID instance where the group `workspace-users` already exists
- **WHEN** the seed job runs again
- **THEN** the job does not create a duplicate group and exits successfully
