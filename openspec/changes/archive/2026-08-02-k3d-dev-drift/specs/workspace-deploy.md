## ADDED Requirements

### Requirement: k3d base is single-node-neutral

The `k3d/` base manifests SHALL contain no host-specific scheduling constraints
(nodeAffinity on `kubernetes.io/hostname` values) and no cross-namespace service
literals, so that `task workspace:deploy ENV=dev` converges on any single-node
cluster (local k3d, remote dev) without imperative follow-up work. Environment-
specific pinning SHALL live exclusively in overlays or deploy-time patches
(`WEBSITE_NODE_AFFINITY`).

#### Scenario: Fresh local k3d cluster deploys without manual patches

- **GIVEN** a freshly created k3d cluster (`task cluster:create`) as the current kubectl context
- **WHEN** `task workspace:deploy ENV=dev` runs
- **THEN** no workload remains unschedulable due to nodeAffinity on production or remote-dev hostnames
- **AND** CronJobs reach the website service via `website.${WEBSITE_NAMESPACE}.svc`, not a hardcoded `website.website.svc`

#### Scenario: Dev secrets cover all referenced keys

- **GIVEN** the dev secret sources `k3d/secrets.yaml` and `k3d/website-dev-secrets.yaml`
- **WHEN** the website and workspace Deployments resolve their `secretKeyRef`s
- **THEN** every referenced key exists (including `SESSIONS_CRON_TOKEN`, `STUDIO_DB_URL`, `INTERNAL_API_TOKEN`, SEPA and LLM keys)
- **AND** `website-secrets` lands in `${WEBSITE_NAMESPACE}`, not a hardcoded `website` namespace

### Requirement: Dev-only apiserver egress policy

The base SHALL ship a dev-only NetworkPolicy `allow-apiserver-egress-k3d`
(TCP 6443 to `172.16.0.0/12`) so in-cluster jobs can reach the k3d API-server
endpoint post-DNAT; the `prod/` overlay SHALL strip this resource via
`$patch: delete` so production keeps the tight fleet-wg-only egress.

#### Scenario: Seed job writes secrets back on k3d

- **GIVEN** the `pocket-id-client-seed` job runs on a local k3d cluster
- **WHEN** it PATCHes generated client secrets to `kubernetes.default.svc`
- **THEN** the connection succeeds (endpoint in the Docker network is allowed by the dev-only policy)

#### Scenario: Prod output contains no dev policy

- **GIVEN** the `prod-fleet/<brand>` overlay
- **WHEN** `kustomize build` renders the production manifests
- **THEN** `allow-apiserver-egress-k3d` is absent from the output

### Requirement: Pocket-ID bootstrap is self-contained

The `pocket-id-db-init` job SHALL idempotently seed a bootstrap admin user and a
`seed-deploy` API key (`sha256` of `workspace-secrets.POCKET_ID_API_KEY`) using
`ON CONFLICT DO NOTHING`, so `pocket-id-client-seed` can authenticate on a fresh
cluster without manual DB inserts, while existing rows on production remain
untouched.

#### Scenario: Fresh cluster seeds OIDC clients unattended

- **GIVEN** a fresh cluster with empty `pocket_id.users` and `pocket_id.api_keys`
- **WHEN** `pocket-id-db-init` and then `pocket-id-client-seed` run
- **THEN** the seed job authenticates via `X-API-KEY` and provisions all OIDC clients

#### Scenario: Existing production data is untouched

- **GIVEN** a cluster whose `pocket_id` database already contains users and API keys
- **WHEN** `pocket-id-db-init` re-runs
- **THEN** no existing row is modified or duplicated

### Requirement: ENV=dev targets the current kubectl context

All deploy tasks' dev branches (`workspace:deploy`, `website:deploy`) SHALL
operate on the current kubectl context and SHALL NOT pass
`--context=${ENV_CONTEXT}`; the k3d cluster config SHALL pin `kubeAPI.hostPort`
so the kubeconfig survives cluster restarts.

#### Scenario: website:deploy dev applies manifests and image to the same cluster

- **GIVEN** the current kubectl context is the local k3d cluster
- **WHEN** `task website:deploy ENV=dev` runs
- **THEN** the image import and the manifest apply both target the local cluster
