## MODIFIED Requirements

### Requirement: OCIRepositories pin a deterministic sha revision

The Flux `OCIRepository` resource `fleet-manifests` SHALL
reference an immutable `sha-<gitsha>` tag instead of the mutable `latest` tag. The
repository state MUST always name the exact artifact revision the cluster pulls, so a
rollback is a Git revert.

#### Scenario: No OCIRepository floats on latest

- **GIVEN** the file `flux/clusters/fleet/oci-source.yaml`
- **WHEN** its `spec.ref` block is inspected
- **THEN** no `ref.tag` equals `latest`
- **AND** every `ref.tag` matches `sha-[0-9a-f]{7,40}`

#### Scenario: Rollback to a previous revision

- **GIVEN** the cluster runs revision `sha-aaa1111`
- **WHEN** an operator reverts the bump commit that pinned `sha-bbb2222`
- **THEN** Flux reconciles the cluster back to the artifact tagged `sha-aaa1111`
