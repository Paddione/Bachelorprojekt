# Spec Delta: workspace-deploy (T001404 — SealedSecret-Owner-Brand)

## ADDED Requirements

### Requirement: extra_namespaces entries declare an `owner_brand` allowlist

The system SHALL allow each entry under `secrets[*].extra_namespaces[*]` in
`environments/schema.yaml` to optionally carry an `owner_brand: [<brand>, ...]`
list. When the list is present, only the env-seal run for an environment whose
name appears in the list SHALL emit the corresponding SealedSecret document
into `environments/sealed-secrets/<env>.yaml`. When the field is absent
(default), the system SHALL preserve the existing behaviour — every
environment seals every entry (backwards-compatible with `env=dev`,
`env=staging`, and any legacy brand that does not opt in).

#### Scenario: shared namespace with owner_brand=[mentolder], mentolder env

- **GIVEN** a schema entry `RUSTDESK_ID_ED25519` with
  `extra_namespaces: [{namespace: rustdesk, secret: rustdesk-secrets, dest_key: id_ed25519, owner_brand: [mentolder]}]`
- **AND** the current env is `mentolder`
- **WHEN** `task env:seal ENV=mentolder` runs
- **THEN** `environments/sealed-secrets/mentolder.yaml` contains a SealedSecret
  document with `metadata.namespace: rustdesk` and `metadata.name: rustdesk-secrets`
- **AND** that document carries the annotation
  `secrets.bachelorprojekt/owner-brand: mentolder`

#### Scenario: shared namespace with owner_brand=[mentolder], korczewski env

- **GIVEN** the same schema entry as above with `owner_brand: [mentolder]`
- **AND** the current env is `korczewski`
- **WHEN** `task env:seal ENV=korczewski` runs
- **THEN** `environments/sealed-secrets/korczewski.yaml` does NOT contain
  any SealedSecret document with `metadata.namespace: rustdesk`
- **AND** the seal run emits an INFO line on stderr of the form
  `INFO: skipping rustdesk/rustdesk-secrets (owner_brand=[mentolder], env=korczewski)`
- **AND** the main `workspace-secrets` SealedSecret in that file is unchanged
  (other entries not in `extra_namespaces` still seal as before)

#### Scenario: legacy env without owner_brand (backwards-compat)

- **GIVEN** a schema entry `LEGACY_SHARED_KEY` with
  `extra_namespaces: [{namespace: shared-ns, secret: shared-secret}]` (no
  `owner_brand` field)
- **WHEN** `task env:seal ENV=<any-brand>` runs
- **THEN** the SealedSecret document for `shared-ns/shared-secret` is emitted
  for every env (unchanged behaviour, prevents regressions of `env=dev` and
  `env=staging` workflows)

---

### Requirement: workspace:deploy filters sealed-secrets file by owner_brand annotation

The system SHALL, in the production branch of `task workspace:deploy` (the
non-dev branch that runs after `source scripts/env-resolve.sh`), parse the
committed `environments/sealed-secrets/<ENV>.yaml` with `yq` and remove any
SealedSecret document whose `metadata.namespace` is in the shared-namespace
list (currently `["rustdesk", "coturn"]`) AND whose
`metadata.annotations["secrets.bachelorprojekt/owner-brand"]` is set to a
value that does not include the current `ENV` before calling
`kubectl apply -f`. The filter MUST emit a `WARN` line naming each removed
document so the operator can audit the filtered output.

#### Scenario: filter drops non-owner documents in shared namespaces

- **GIVEN** `environments/sealed-secrets/korczewski.yaml` still contains a
  SealedSecret document for `rustdesk/rustdesk-secrets` annotated
  `owner-brand: mentolder` (e.g. legacy state before re-seal)
- **AND** the current env is `korczewski`
- **WHEN** `task workspace:deploy ENV=korczewski` runs the production branch
- **THEN** the yq filter removes that document before `kubectl apply`
- **AND** the operator log contains the line
  `WARN: filtered out rustdesk/rustdesk-secrets (owner-brand=mentolder, env=korczewski)`
- **AND** `kubectl apply -f` is called only with the remaining documents
- **AND** the cluster's `rustdesk/rustdesk-secrets` is NOT touched by this
  deploy run

#### Scenario: filter preserves brand-owned documents in shared namespaces

- **GIVEN** `environments/sealed-secrets/mentolder.yaml` contains a
  SealedSecret for `rustdesk/rustdesk-secrets` annotated `owner-brand: mentolder`
- **AND** the current env is `mentolder`
- **WHEN** `task workspace:deploy ENV=mentolder` runs the production branch
- **THEN** the yq filter does NOT remove the document (owner matches env)
- **AND** `kubectl apply -f` proceeds with the document unchanged
- **AND** the SealedSecret controller reconciles
  `rustdesk/rustdesk-secrets` with mentolder's keypair

#### Scenario: filter preserves per-brand documents in non-shared namespaces

- **GIVEN** the file contains a SealedSecret for
  `website-korczewski/website-secrets` (no shared-namespace match, no
  owner-brand annotation)
- **AND** the current env is `korczewski`
- **WHEN** `task workspace:deploy ENV=korczewski` runs the production branch
- **THEN** the document is NOT touched by the filter (its namespace is not
  in the shared-namespace list)
- **AND** `kubectl apply -f` proceeds with the document

---

### Requirement: shared-namespace list is centrally defined

The system SHALL source the list of "shared namespaces" (the namespaces that
must be filtered by owner_brand in the workspace:deploy prod branch) from a
single, named constant in `scripts/env-seal.sh` (or a small lib module
sourced from it) and SHALL NOT duplicate the list across multiple Taskfile
branches. The initial value SHALL be `["rustdesk", "coturn"]`. Adding a new
shared namespace to the list SHALL require a code change with a unit test
that exercises the filter (the new namespace must round-trip a positive
`matched` result in `tests/spec/workspace-deploy-secrets-scope.bats`).

#### Scenario: shared-namespace constant exposed for tests

- **GIVEN** the constant lives in a bash array `SHARED_NAMESPACES=(rustdesk coturn)`
- **WHEN** `bash -c 'source scripts/env-seal.sh; echo "${SHARED_NAMESPACES[@]}"'`
  is run (with a stub for the rest of env-seal's preflight)
- **THEN** the output is `rustdesk coturn` (the array is exported/visible
  to callers and to BATS tests)

---

### Requirement: BATS regression test for shared-namespace scope

The system SHALL ship `tests/spec/workspace-deploy-secrets-scope.bats` that
verifies the schema + env-seal + (stub) yq-filter contract end-to-end. The
test MUST fail on `main` HEAD before this change is merged and MUST pass
after the change is applied. The test MUST be self-contained — it uses a
stub `kubeseal` (pattern from `tests/spec/env-seal-empty-value-keys.bats`)
and does NOT require a live cluster.

#### Scenario: static schema check — shared entries carry owner_brand

- **GIVEN** the live `environments/schema.yaml`
- **WHEN** the test runs
- **THEN** for every entry under `secrets[*].extra_namespaces[*]` whose
  `namespace` is in `["rustdesk", "coturn"]`, an `owner_brand` field is
  present and contains at least one of `mentolder`, `korczewski`

#### Scenario: env-seal filter — korczewski omits shared-namespace docs

- **GIVEN** a fixture schema with one shared entry (`owner_brand: [mentolder]`)
  and one brand-owned entry
- **AND** a fixture secrets file with values for both
- **WHEN** the test runs `bash scripts/env-seal.sh --env korczewski`
  with a stubbed `kubeseal` on PATH
- **THEN** the produced sealed file contains the brand-owned SealedSecret
  document
- **AND** the produced sealed file does NOT contain any SealedSecret
  document with `metadata.namespace: rustdesk` or `metadata.namespace: coturn`

#### Scenario: env-seal filter — mentolder keeps shared-namespace docs

- **GIVEN** the same fixture schema and secrets file as the previous scenario
- **WHEN** the test runs `bash scripts/env-seal.sh --env mentolder`
  with a stubbed `kubeseal` on PATH
- **THEN** the produced sealed file contains the brand-owned SealedSecret
  document
- **AND** the produced sealed file contains the shared
  `rustdesk/rustdesk-secrets` SealedSecret document
- **AND** that document carries the annotation
  `secrets.bachelorprojekt/owner-brand: mentolder`
