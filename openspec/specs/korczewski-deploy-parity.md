# korczewski-deploy-parity


<!-- merged from change delta korczewski-deploy-parity.md on 2026-06-28 -->

### Requirement: Unabhängiger korczewski Deploy-Job in build-website.yml

The system SHALL deploy the website to the korczewski brand in an independent CI job that does NOT depend on the mentolder deploy job, so that a mentolder deployment failure does not block or skip the korczewski deployment.

#### Scenario: korczewski deploy runs independently when mentolder deploy fails

- **GIVEN** `build-website.yml` is triggered by a push to `main`
- **WHEN** the `deploy-mentolder` job fails (e.g., rollout timeout)
- **THEN** the `deploy-korczewski` job still runs and reports its own status to GitHub Actions — it is NOT skipped

#### Scenario: Both deploy jobs depend on the shared build job

- **GIVEN** `build-website.yml` defines `build-image`, `deploy-mentolder`, and `deploy-korczewski` jobs
- **WHEN** the `build-image` job completes successfully
- **THEN** both `deploy-mentolder` and `deploy-korczewski` start in parallel, each with `needs: [build-image]`

#### Scenario: korczewski deploy uses the SHA-tagged image from the build job

- **GIVEN** `build-image` exports `image` and `sha_tag` as job outputs
- **WHEN** `deploy-korczewski` runs
- **THEN** it reads `needs.build-image.outputs.image` and `needs.build-image.outputs.sha_tag` to pin the rollout to the freshly built image

### Requirement: G-CD01 Brand-Parity BATS coverage

The system SHALL have BATS tests in `tests/spec/ci-cd.bats` that verify the korczewski deploy job is structurally independent of the mentolder deploy job in `build-website.yml`.

#### Scenario: BATS test verifies korczewski job has no dependency on deploy-mentolder

- **GIVEN** `tests/spec/ci-cd.bats` runs in CI
- **WHEN** the test checks `build-website.yml` job dependencies
- **THEN** it asserts that the korczewski deploy job does NOT list `deploy-mentolder` in its `needs:` field

#### Scenario: BATS test verifies both deploy jobs depend on build-image

- **GIVEN** `tests/spec/ci-cd.bats` runs in CI
- **WHEN** the test checks the `needs:` fields of both deploy jobs
- **THEN** both `deploy-mentolder` and `deploy-korczewski` reference `build-image` in their `needs:` arrays
