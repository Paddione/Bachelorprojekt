## ADDED Requirements

### Requirement: All `kustomize build | envsubst` deploy pipelines re-quote stripped placeholders

Every Taskfile.yml pipeline that pipes `kustomize build` output through
`envsubst` before `kubectl apply` SHALL insert a re-quoting `sed` stage
(`sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g'`) between
`kustomize build` and `envsubst`, so that bare `${VAR}` placeholders
kustomize's YAML round-trip strips quotes from cannot be substituted into
unquoted (and therefore type-coerced) YAML scalars.

#### Scenario: coturn-stack pipeline re-quotes stripped placeholders

- **GIVEN** the `workspace:coturn-setup` task's
  `kustomize build k3d/coturn-stack | envsubst ...` pipeline
- **WHEN** `kustomize build` re-serializes a quoted `${VAR}` placeholder as a
  bare scalar
- **THEN** a re-quoting `sed` stage between `kustomize build` and `envsubst`
  restores the quotes before substitution, so `envsubst` cannot produce an
  unquoted (int/bool-typed) YAML scalar

#### Scenario: office-stack pipeline re-quotes stripped placeholders

- **GIVEN** the `workspace:office:deploy` task's
  `kustomize build k3d/office-stack | envsubst ...` pipeline
- **WHEN** `kustomize build` re-serializes a quoted `${VAR}` placeholder as a
  bare scalar
- **THEN** a re-quoting `sed` stage between `kustomize build` and `envsubst`
  restores the quotes before substitution

#### Scenario: fleet:shared-services pipelines re-quote stripped placeholders

- **GIVEN** the `fleet:shared-services` task's three
  `kustomize build k3d/{coturn,office,rustdesk}-stack | envsubst ...`
  pipelines
- **WHEN** `kustomize build` re-serializes a quoted `${VAR}` placeholder as a
  bare scalar
- **THEN** a re-quoting `sed` stage between `kustomize build` and `envsubst`
  restores the quotes before substitution in all three call sites

#### Scenario: Taskfile-structural regression guard catches a future unhardened pipeline

- **GIVEN** a BATS test that enumerates every `kustomize build ... |
  envsubst` pipe chain in `Taskfile.yml`
- **WHEN** any such pipeline is missing the re-quoting `sed` stage between
  `kustomize build` and `envsubst`
- **THEN** the test fails, flagging the gap before it can cause a live
  `kubectl apply --server-side` type-coercion failure
