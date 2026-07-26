## ADDED Requirements

### Requirement: Flux bootstrap SealedSecrets carry decryptable ciphertexts

Every SealedSecret committed under `flux/clusters/fleet/bootstrap/` SHALL carry a
real ciphertext produced by `kubeseal` against the cluster's current sealing
certificate, and SHALL NOT carry a placeholder value. Each file SHALL declare
`spec.template.metadata.name` and `spec.template.metadata.namespace` so the
controller can materialise the target Secret, and SHALL preserve the target
Secret's type.

The bootstrap path is applied imperatively by `task flux:bootstrap`
(`Taskfile.yml`) before Flux can reconcile anything, so these files are the only
git-side record of the two secrets the pull-based pipeline depends on:
`ghcr-auth` (GHCR pull of the OCI artifact) and `flux-webhook-token` (Receiver
webhook).

#### Scenario: Placeholder ciphertext is rejected

- **GIVEN** a SealedSecret under `flux/clusters/fleet/bootstrap/`
- **WHEN** its `spec.encryptedData` value starts with the placeholder prefix
  `AgD_dummy`
- **THEN** the spec BATS suite fails, naming the offending file and key

#### Scenario: Missing template metadata is rejected

- **GIVEN** a SealedSecret under `flux/clusters/fleet/bootstrap/`
- **WHEN** it lacks `spec.template.metadata.name` or
  `spec.template.metadata.namespace`
- **THEN** the spec BATS suite fails, because the controller cannot materialise
  the target Secret without them

#### Scenario: Reused ciphertext across two SealedSecrets is rejected

- **GIVEN** two SealedSecrets under `flux/clusters/fleet/bootstrap/` with
  different `metadata.name` values in the same namespace
- **WHEN** they carry byte-identical ciphertexts
- **THEN** the spec BATS suite fails, because sealed-secrets binds a ciphertext
  to `namespace/name` under the default strict scope, so at most one of them
  could ever decrypt

#### Scenario: Controller reports the bootstrap SealedSecrets as synced

- **GIVEN** the corrected bootstrap files applied to the `fleet` cluster
- **WHEN** `kubectl --context fleet -n flux-system get sealedsecrets` is queried
- **THEN** `ghcr-auth` and `flux-webhook-token` both report `SYNCED=True` with
  no decode error
