## ADDED Requirements

### Requirement: OCIRepositories pin a deterministic sha revision

The Flux `OCIRepository` resources (`fleet-manifests`, `fleet-manifests-gitlab`) SHALL
reference an immutable `sha-<gitsha>` tag instead of the mutable `latest` tag. The
repository state MUST always name the exact artifact revision the cluster pulls, so a
rollback is a Git revert.

#### Scenario: No OCIRepository floats on latest

- **GIVEN** the files `flux/clusters/fleet/oci-source.yaml` and
  `flux/clusters/fleet/oci-source-gitlab.yaml`
- **WHEN** their `spec.ref` blocks are inspected
- **THEN** no `ref.tag` equals `latest`
- **AND** every `ref.tag` matches `sha-[0-9a-f]{7,40}`

#### Scenario: Rollback to a previous revision

- **GIVEN** the cluster runs revision `sha-aaa1111`
- **WHEN** an operator reverts the bump commit that pinned `sha-bbb2222`
- **THEN** Flux reconciles the cluster back to the artifact tagged `sha-aaa1111`

### Requirement: Render workflow advances the pin automatically

After a successful push and signature of a new fleet-manifests artifact on `main`, the
`render-fleet-artifact` workflow SHALL commit a bump that updates both OCIRepository
`ref.tag` values to `sha-${GITHUB_SHA}`. The bump commit MUST NOT trigger another
workflow run, and a failed bump push MUST NOT fail the workflow.

#### Scenario: Successful render bumps the pin without re-triggering

- **GIVEN** a push to `main` changed render inputs
- **WHEN** the workflow pushes, signs, and executes the bump step
- **THEN** a commit with `[skip ci]` sets both `ref.tag` values to `sha-${GITHUB_SHA}`
- **AND** no second workflow run is triggered by that commit

#### Scenario: Bump push race does not fail the render

- **GIVEN** another merge landed while the bump step was preparing its commit
- **WHEN** the bump push is rejected as non-fast-forward
- **THEN** the workflow logs a warning and completes successfully
- **AND** the next successful render retries the bump
