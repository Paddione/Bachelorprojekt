## MODIFIED Requirements

### Requirement: Dependency-Versions-Erkennung (discover-versions)

The system SHALL discover current versions of k3s, sealed-secrets-chart,
cert-manager, and longhorn-chart from the GitHub API and Helm repos, SHALL print
them in dry-run mode without writing a file, and SHALL write a `versions.yaml` with
all four required keys when `--update` is passed. Because the fleet cluster now runs
a pull-based GitOps controller (Flux Operator), the prior clause "Flux SHALL NOT be
tracked" is REMOVED: the system MAY additionally track a Flux/flux-operator version
key, and MUST NOT fail when that key is absent (the four core keys remain
mandatory).

#### Scenario: Dry-Run gibt alle Pflicht-Versionen aus *(BATS)*

- **GIVEN** `curl` and `helm` are replaced by stubs (k3s: v1.99.0+k3s1,
  sealed-secrets: 9.1.0, cert-manager: v9.2.0, longhorn: 9.3.0)
- **WHEN** `bash scripts/discover-versions.sh` runs without flags
- **THEN** exit code is 0 and the output contains all four versions

#### Scenario: Dry-Run schreibt keine Datei *(BATS)*

- **GIVEN** stubs for `curl` and `helm` are active
- **WHEN** `bash scripts/discover-versions.sh` runs without `--update`
- **THEN** exit code is 0 and no `versions.yaml` file is created

#### Scenario: --update schreibt versions.yaml mit allen Pflicht-Keys *(BATS)*

- **GIVEN** stubs for `curl` and `helm` are active
- **WHEN** `bash scripts/discover-versions.sh --update --versions-file <path>` runs
- **THEN** exit code is 0 and the file contains `k3s:`, `sealed_secrets_chart:`,
  `cert_manager:`, and `longhorn_chart:`
- **AND** an optional `flux:` key, whether present or absent, does not cause a
  non-zero exit

## ADDED Requirements

### Requirement: CI rendert und pusht das Fleet-OCI-Artefakt statt push-based apply

The system SHALL, on merge to `main`, render the fleet components into an OCI
artifact and push it to the private registry
(`oci://ghcr.io/paddione/fleet-manifests`) via `flux push artifact` with a
git-derived `--source` and `--revision`, instead of applying manifests to the
cluster with `kubectl apply`. After a successful push, CI SHALL ping the Flux
`Receiver` webhook so the cluster reconciles immediately rather than waiting for the
polling interval. The `fleet-manifests` package SHALL be private (rendered manifests
expose internal topology).

#### Scenario: Merge löst Render+Push+Ping aus

- **GIVEN** a pull request is merged to `main`
- **WHEN** the post-merge CI job runs
- **THEN** the fleet components are rendered and pushed as an OCI artifact with a
  `--revision` derived from the merge commit SHA
- **AND** the Flux Receiver webhook is pinged to trigger an immediate reconcile
- **AND** no `kubectl apply` of the rendered manifests runs in the job

#### Scenario: Build-Workflows triggern Re-Render statt set image

- **GIVEN** a component image (e.g. website, brett) is rebuilt with a new SHA tag
- **WHEN** its build workflow completes
- **THEN** the workflow triggers an artifact re-render passing the SHA tag as the
  image input
- **AND** it does NOT run `kubectl set image` or `kubectl rollout restart`
