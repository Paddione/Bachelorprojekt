## ADDED Requirements

### Requirement: pinned container images SHALL carry zero CRITICAL CVEs per the Trivy baseline

Every container image pinned in `k3d/*.yaml` SHALL be refreshed to a digest with zero CRITICAL-severity
CVEs as reported by `trivy image --severity CRITICAL`, tracked against the baseline recorded in
`docs/audits/2026-07-17-trivy-cve-baseline.md`.

#### Scenario: alpine/k8s no longer reports CRITICAL CVEs

- **GIVEN** `alpine/k8s:1.34.0` is pinned in one or more `k3d/*.yaml` manifests and reports CRITICAL CVEs
  in the baseline
- **WHEN** the image digest is bumped to a current stable tag
- **THEN** `trivy image --severity CRITICAL` against the new digest reports zero CRITICAL findings

### Requirement: the CVE health-goal current value SHALL reflect the post-bump scan

After all pinned images in the baseline are refreshed, the corresponding health-goal current value in
`.claude/lib/goals.md` SHALL be updated to match the post-bump Trivy scan result.

#### Scenario: goals.md reflects zero CRITICAL CVEs after the bump sweep

- **GIVEN** all images from the 2026-07-17 baseline have been bumped and rescanned
- **WHEN** the goal's current value is refreshed
- **THEN** it reads 0 CRITICAL CVEs across the pinned image set
