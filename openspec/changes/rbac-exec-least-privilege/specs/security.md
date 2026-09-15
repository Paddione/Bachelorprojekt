## ADDED Requirements

### Requirement: Workload ServiceAccounts hold no clusterwide pods/exec
<!-- bats: security/workload-exec-rbac.bats -->

No ServiceAccount of an application workload SHALL be granted `pods/exec` through a ClusterRoleBinding.
Where a workload needs exec, it SHALL be granted through namespaced `Role`/`RoleBinding` objects limited to the
namespaces it actually targets. The website ServiceAccount SHALL hold `pods/exec` only in its own website
namespace (`website-self-exec`) and in the workspace namespace of its own brand (`website-test-runner-exec`,
rendered from the k3d base), so that it cannot exec into `workspace-dev`, `kube-system` or another brand.

#### Scenario: The website ClusterRole grants no exec *(BATS)*

- **GIVEN** the ClusterRole `${WEBSITE_NAMESPACE}-monitoring-reader` in `k3d/website.yaml`
- **WHEN** its rules are parsed
- **THEN** it still grants `get`/`list` on pods (positive anchor) and no rule grants `pods/exec`

#### Scenario: Exec is bound only in the brand's own namespaces *(BATS)*

- **GIVEN** `k3d/website.yaml` and `k3d/website-test-runner-rbac.yaml`
- **WHEN** the RBAC objects that grant `pods/exec` are listed
- **THEN** they are namespaced `Role`/`RoleBinding` objects whose subject is the ServiceAccount `website` in
  `${WEBSITE_NAMESPACE}`, and `k3d/kustomization.yaml` references `website-test-runner-rbac.yaml`

#### Scenario: The kustomize namespace transformer keeps the subject namespace *(BATS)*

- **GIVEN** the k3d base renders with `namespace: workspace` and a brand overlay may override it
- **WHEN** the base is rendered with `kubectl kustomize`
- **THEN** the RoleBinding `website-test-runner-exec` lands in the workspace namespace while its subject namespace
  stays `${WEBSITE_NAMESPACE}` for envsubst

### Requirement: cluster-admin bindings are limited to an allowlist
<!-- bats: security/cluster-admin-audit.bats -->

Every ClusterRoleBinding to `cluster-admin` SHALL bind only subjects on an explicit allowlist of platform
controllers (`system:masters`, Flux controllers, the k3s Traefik Helm installers, the Longhorn support bundle).
`scripts/security/cluster-admin-audit.sh` SHALL report every other subject and exit non-zero, so that manually
created cluster-admin identities with long-lived tokens are detected.

#### Scenario: Allowlisted bindings pass *(BATS)*

- **GIVEN** a ClusterRoleBinding list containing only allowlisted cluster-admin subjects
- **WHEN** the audit runs against it
- **THEN** it exits 0 and reports the number of checked bindings

#### Scenario: An unmanaged cluster-admin ServiceAccount is reported *(BATS)*

- **GIVEN** a ClusterRoleBinding `dev-deployer` binding `ServiceAccount kube-system/dev-deployer` to `cluster-admin`
- **WHEN** the audit runs against it
- **THEN** it exits 1 and names the binding and the subject
