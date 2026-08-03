## ADDED Requirements

### Requirement: Kein handverwalteter Orphan-Workload darf ein Flux-Health-Gate blockieren

The system SHALL ensure that every Deployment running in `workspace` and
`workspace-korczewski` has a corresponding manifest under `k3d/` or a documented exception,
because a single unhealthy workload freezes the entire Flux Kustomization (T002207) and an
orphan created with `kubectl` is invisible to repository-side cleanup.

#### Scenario: Orphan detection reports kubectl-managed Deployments

- **GIVEN** a Deployment in `workspace` whose `metadata.managedFields[].manager` is `kubectl`
- **WHEN** the orphan audit is executed against the namespace
- **THEN** the Deployment is reported as unmanaged infrastructure drift
- **AND** the report names the namespace, the Deployment and the managing field manager
