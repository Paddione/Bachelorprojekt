## ADDED Requirements

### Requirement: Typed extra-namespace secrets

`environments/schema.yaml` entries under `extra_namespaces` SHALL accept an optional
`type` field naming the Kubernetes secret type of the generated manifest. When the
field is absent the type SHALL default to `Opaque`, preserving the behaviour of every
existing entry. For `type: kubernetes.io/dockerconfigjson` the sealer SHALL construct
the `.dockerconfigjson` value from a registry host, a username key and a token key
rather than reading a pre-built JSON blob from the plaintext secrets file.

#### Scenario: Opaque stays the default for existing entries

- **GIVEN** an `extra_namespaces` mapping without a `type` field
- **WHEN** `task env:seal ENV=mentolder` runs
- **THEN** the generated SealedSecret template carries `type: Opaque`
- **AND** its `encryptedData` keys are unchanged from before this change

#### Scenario: dockerconfigjson is assembled from username and token

- **GIVEN** an `extra_namespaces` mapping with `type: kubernetes.io/dockerconfigjson`,
  `registry: ghcr.io`, `username_key: GHCR_USERNAME` and source key `GHCR_PAT`
- **WHEN** `task env:seal ENV=mentolder` runs
- **THEN** the sealed value decrypts to
  `{"auths":{"ghcr.io":{"auth":"<base64 of GHCR_USERNAME:GHCR_PAT>"}}}`
- **AND** the plaintext secrets file contains no pre-built JSON blob

### Requirement: Per-entry output file for sealed secrets

`environments/schema.yaml` entries under `extra_namespaces` SHALL accept an optional
`output_file` field giving a repo-relative path. Mappings carrying it SHALL be written
to that file as a standalone SealedSecret document instead of being appended to
`environments/sealed-secrets/<env>.yaml`. Two mappings that name the same
`output_file` SHALL be emitted into that one file as separate YAML documents. Files
named by `output_file` SHALL be overwritten in full on each run, so that a removed
schema entry cannot leave a stale ciphertext behind.

#### Scenario: Bootstrap secret is written to its own file

- **GIVEN** the schema declares `output_file: flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml`
  for the `flux-system/ghcr-auth` mapping
- **WHEN** `task env:seal ENV=mentolder` runs
- **THEN** that file contains exactly one SealedSecret for `flux-system/ghcr-auth`
- **AND** `environments/sealed-secrets/mentolder.yaml` contains no `flux-system` document

### Requirement: Flux bootstrap secrets are schema-managed

`environments/schema.yaml` SHALL declare `GHCR_USERNAME` and `FLUX_WEBHOOK_TOKEN`, and
SHALL map `GHCR_PAT` and `FLUX_WEBHOOK_TOKEN` into the `flux-system` namespace with
`owner_brand: [mentolder]`, so that both Flux bootstrap SealedSecrets are produced by
`task env:seal`. Sealing a non-owning brand SHALL NOT write the `flux-system` output
files. Because both values are user-supplied and a fail-closed `required: true` would
block `task env:seal` for the whole environment until the one-time plaintext migration
has landed, both entries SHALL be `required: false`. The sealer SHALL therefore leave an
`output_file` untouched when every source key of its mapping is empty, so that an
incomplete plaintext file cannot overwrite a live bootstrap ciphertext with empty
strings.

#### Scenario: korczewski does not overwrite the shared flux-system secrets

- **GIVEN** `flux-system` mappings carry `owner_brand: [mentolder]`
- **WHEN** `task env:seal ENV=korczewski` runs
- **THEN** the run logs that it skips the `flux-system` mappings
- **AND** `flux/clusters/fleet/bootstrap/*-sealedsecret.yaml` remain byte-identical

#### Scenario: An empty flux webhook token does not destroy the live ciphertext

- **GIVEN** `FLUX_WEBHOOK_TOKEN` is absent or empty in `environments/.secrets/mentolder.yaml`
- **WHEN** `task env:seal ENV=mentolder` runs
- **THEN** it logs that it skips the mapping
- **AND** `flux/clusters/fleet/bootstrap/flux-webhook-token-sealedsecret.yaml` stays
  byte-identical
