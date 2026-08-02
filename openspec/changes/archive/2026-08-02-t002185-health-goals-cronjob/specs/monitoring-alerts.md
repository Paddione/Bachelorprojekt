## ADDED Requirements

### Requirement: No Unregistered Resource Manifests in k3d/monitoring

Every YAML file under `k3d/monitoring/` that declares a Kubernetes resource (i.e. contains a top-level
`kind:` field) SHALL be listed as a `resource` entry in `k3d/monitoring/kustomization.yaml`. A manifest
that is not referenced there is never built or applied, and SHALL NOT exist in the directory.

#### Scenario: All monitoring manifests are referenced by the kustomization

- **GIVEN** the file list under `k3d/monitoring/*.yaml`
- **WHEN** each file containing a `kind:` field is cross-checked against the `resources:` list in
  `k3d/monitoring/kustomization.yaml`
- **THEN** every such file appears in that `resources:` list

### Requirement: Placeholder CronJobs Are Not Committed

No `CronJob` manifest under `k3d/` SHALL ship with a container `command` that is a literal placeholder
(e.g. an `echo` string with no measurement or side effect). If a CronJob's job is not yet implemented, it
SHALL NOT be committed until it performs real work, or the responsibility SHALL be documented as owned by
an existing mechanism (e.g. a GitHub Actions workflow) instead of a redundant in-cluster stub.

#### Scenario: health-goals-cronjob.yaml no longer exists as a dead placeholder

- **GIVEN** the repository at `k3d/monitoring/`
- **WHEN** the directory listing is checked for `health-goals-cronjob.yaml`
- **THEN** the file does not exist, because the health-goals measurement responsibility is fully owned by
  `.github/workflows/health-goals.yml` (`task health:goals:update` / `scripts/health-goals-check.sh`)
