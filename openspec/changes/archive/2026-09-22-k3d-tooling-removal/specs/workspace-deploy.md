## MODIFIED Requirements

### Requirement: k3d base is single-node-neutral

The `k3d/` base manifests SHALL contain no host-specific scheduling constraints
(nodeAffinity on `kubernetes.io/hostname` values) and no cross-namespace service
literals, so that `task workspace:deploy ENV=dev` converges on any single-node
cluster (local devmesh, remote dev) without imperative follow-up work. Environment-
specific pinning SHALL live exclusively in overlays or deploy-time patches
(`WEBSITE_NODE_AFFINITY`).

#### Scenario: Fresh single-node cluster deploys without manual patches

- **GIVEN** the current kubectl context is a freshly reachable single-node cluster (devmesh, ADR-008)
- **WHEN** `task workspace:deploy ENV=dev` runs
- **THEN** no workload remains unschedulable due to nodeAffinity on production or remote-dev hostnames
- **AND** CronJobs reach the website service via `website.${WEBSITE_NAMESPACE}.svc`, not a hardcoded `website.website.svc`

#### Scenario: Dev secrets cover all referenced keys

- **GIVEN** the dev secret sources `k3d/secrets.yaml` and `k3d/website-dev-secrets.yaml`
- **WHEN** the website and workspace Deployments resolve their `secretKeyRef`s
- **THEN** every referenced key exists (including `SESSIONS_CRON_TOKEN`, `STUDIO_DB_URL`, `INTERNAL_API_TOKEN`, SEPA and LLM keys)
- **AND** `website-secrets` lands in `${WEBSITE_NAMESPACE}`, not a hardcoded `website` namespace

### Requirement: ENV=dev targets the current kubectl context

All deploy tasks' dev branches (`workspace:deploy`, `website:deploy`) SHALL
operate on the current kubectl context and SHALL NOT pass
`--context=${ENV_CONTEXT}`.

#### Scenario: website:deploy dev applies manifests to the current context

- **GIVEN** the current kubectl context is devmesh (ADR-008, ENV=dev)
- **WHEN** `task website:deploy ENV=dev` runs
- **THEN** the manifest apply targets that context, using the image already published to the registry (no local image import step, T900310)

## REMOVED Requirements

### Requirement: Dev-Cluster-Autostart-Unit startet Cluster, erstellt ihn nie neu

**Reason:** Das Requirement beschreibt `scripts/dev-cluster-autostart.sh`, das eine Unit mit
`k3d cluster start` installiert. Der k3d-Cluster ist abgebaut (T900120, T900145), Skript und Unit
entfallen mit T900310.

**Migration:** Keine. devmesh-Knoten starten k3s als systemd-Dienst selbst (ADR-008).
