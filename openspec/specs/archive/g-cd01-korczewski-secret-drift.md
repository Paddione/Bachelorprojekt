# g-cd01-korczewski-secret-drift

## Purpose

SSOT spec.

## Requirements

### Requirement: website-secrets cluster-freshness guard

The system SHALL provide a BATS-based test (`tests/spec/sealed-secret-cluster-drift.bats`) that, for each deployed website brand (mentolder, korczewski), compares the env-from-secret keys required by the `website` Deployment (`k3d/website.yaml`) against the keys present in the cluster's `Secret/website-secrets` in namespace `website-<brand>`. The test SHALL fail (with a list of missing keys and a remediation hint) when any required key is absent in the cluster. The test SHALL skip (with a clear skip reason) when no live cluster is reachable (`kubectl get nodes` fails within 3 s) or when the brand's namespace does not exist in the active cluster.

#### Scenario: korczewski cluster has all required keys (post-fix)

- **GIVEN** the `Secret/website-secrets -n website-korczewski` contains every env-from-secret key listed in `k3d/website.yaml` (e.g. BRETT_OIDC_SECRET, DEEPSEEK_API_KEY, DEEPSEEK_API_KEY_PK, SEPA_CREDITOR_BIC, SEPA_CREDITOR_IBAN, SEPA_CREDITOR_ID, plus all earlier ones)
- **WHEN** `bats tests/spec/sealed-secret-cluster-drift.bats` runs against a live cluster
- **THEN** the korczewski test passes (exit 0) and the mentolder test either passes or skips (depending on whether `website-mentolder` is deployed in the active cluster)

#### Scenario: korczewski cluster missing BRETT_OIDC_SECRET (G-CD01 root-cause class)

- **GIVEN** the `Secret/website-secrets -n website-korczewski` does NOT contain BRETT_OIDC_SECRET (or any other required key)
- **WHEN** `bats tests/spec/sealed-secret-cluster-drift.bats` runs against a live cluster
- **THEN** the korczewski test fails (exit 1) with output listing every missing key, plus a remediation hint ("Fix: task env:seal ENV=korczewski && task env:deploy ENV=korczewski")

#### Scenario: no live cluster reachable

- **GIVEN** `kubectl get nodes --request-timeout=3s` fails (no active context, network down, or credentials expired)
- **WHEN** `bats tests/spec/sealed-secret-cluster-drift.bats` runs
- **THEN** both the mentolder and korczewski tests skip with a clear skip reason ("no live cluster reachable (kubectl get nodes failed)")

#### Scenario: brand namespace not deployed

- **GIVEN** the active cluster has the `website-korczewski` namespace but not `website-mentolder` (or vice versa)
- **WHEN** `bats tests/spec/sealed-secret-cluster-drift.bats` runs
- **THEN** the test for the non-deployed brand skips with "namespace website-<brand> not present in active cluster (brand not deployed)"; the test for the deployed brand runs normally

### Requirement: website-deploy workflow pre-rollout secret-key check

The system SHALL run a pre-rollout key-existence check as the first step after `kubectl apply` (and before `kubectl rollout status`) in both website-deploy workflows (`.github/workflows/build-website.yml` and `.github/workflows/build-website-korczewski.yml`). The check SHALL list every env-from-secret key in `k3d/website.yaml` whose `secretKeyRef.name` is `website-secrets`, and SHALL fail-fast (exit 1, GitHub Actions `::error::` annotation) when any required key is missing in the cluster `Secret/website-secrets -n website-<brand>`. On success, the check SHALL exit 0 and the workflow SHALL proceed with the normal `kubectl rollout status` step.

#### Scenario: korczewski pre-rollout check detects missing key

- **GIVEN** the `Secret/website-secrets -n website-korczewski` is missing a required key (e.g. BRETT_OIDC_SECRET)
- **WHEN** `build-website-korczewski.yml` runs (push to main, `website/**` or the workflow file changed)
- **THEN** the pre-rollout step exits 1 within ~10 s and prints a GitHub Actions `::error::` annotation listing the missing keys plus a remediation hint
- **AND** the workflow run is marked `failure` without waiting the 120 s `rollout status --timeout=120s` window

#### Scenario: pre-rollout check is green on a healthy cluster

- **GIVEN** the `Secret/website-secrets -n website-<brand>` contains every required key
- **WHEN** `build-website-<brand>.yml` runs
- **THEN** the pre-rollout check exits 0, the workflow proceeds to `kubectl set image` and `kubectl rollout status`, and the run completes normally

<!-- merged from change delta g-cd01-korczewski-secret-drift.md on 2026-07-01 -->