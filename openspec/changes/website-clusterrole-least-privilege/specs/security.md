## ADDED Requirements

### Requirement: Website ClusterRole holds only read permissions without clusterwide write access
<!-- bats: security/website-clusterrole-least-privilege.bats -->

The website ClusterRole `${WEBSITE_NAMESPACE}-monitoring-reader` SHALL grant only read verbs (`get`, `list`)
and SHALL NOT grant any write verbs (`delete`, `patch`, `create`, `update`) across the cluster.
Where write access is required by SDLC ops workflows (patching deployments or creating jobs), it SHALL be
granted through namespaced `Role` and `RoleBinding` objects restricted to the brand's own website namespace
(`${WEBSITE_NAMESPACE}`) and workspace namespace (`workspace`). Obsolete API groups (`argoproj.io`) and unused
write verbs (`pods: delete`) SHALL be completely removed.

#### Scenario: The website ClusterRole contains only read-only verbs *(BATS)*

- **GIVEN** the ClusterRole `${WEBSITE_NAMESPACE}-monitoring-reader` in `k3d/website.yaml`
- **WHEN** all its rules and verbs are inspected
- **THEN** every verb in every rule is either `get` or `list`
- **AND** no rule grants `delete`, `patch`, `create`, or `update`

#### Scenario: Obsolete ArgoCD and pod deletion rules are absent from the ClusterRole *(BATS)*

- **GIVEN** the ClusterRole `${WEBSITE_NAMESPACE}-monitoring-reader` in `k3d/website.yaml`
- **WHEN** its API groups and resources are inspected
- **THEN** no rule references the apiGroup `argoproj.io`
- **AND** no rule grants `delete` on `pods`

#### Scenario: Namespaced Roles grant deployment and job write access in required namespaces *(BATS)*

- **GIVEN** `k3d/website.yaml` and `k3d/website-test-runner-rbac.yaml`
- **WHEN** the namespaced roles for the website ServiceAccount are inspected
- **THEN** `website-self-exec` in `${WEBSITE_NAMESPACE}` grants `apps/deployments: patch`
- **AND** `website-test-runner-exec` in `workspace` grants `apps/deployments: patch` and `batch/jobs: create`
