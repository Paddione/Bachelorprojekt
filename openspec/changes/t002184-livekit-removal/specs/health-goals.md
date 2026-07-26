## REMOVED Requirements

### Requirement: livekit-egress muss als Kustomize-Manifest mit Recreate-Strategie getrackt sein

**Reason:** The `livekit-egress` Deployment and its `k3d/livekit-egress.yaml` manifest are
removed entirely by T002184. The goal only existed to make the RWO-PVC-incompatible
RollingUpdate strategy safe; with the workload gone there is nothing left to assert, and the
BATS test `G-OPS01b` in `tests/spec/health-goals.bats` would stay permanently red.

**Migration:** Delete the `G-OPS01b` test and its comment block from
`tests/spec/health-goals.bats` and retire the goal IDs `G-OPS01-STATIC-001` (secretKeyRef
completeness for `LIVEKIT_*`) and `G-OPS01-STATIC-002` (Recreate strategy) in
`.claude/lib/goals.md`. The general "every secretKeyRef must resolve" goal remains in force
for all other workloads.

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
