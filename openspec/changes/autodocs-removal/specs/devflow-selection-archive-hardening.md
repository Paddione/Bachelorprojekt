## MODIFIED Requirements

### Requirement: Post-merge deploy does not build container images

`scripts/devflow-post-merge-deploy.sh` SHALL NOT invoke tasks that build and push container
images (`feature:website`, `feature:brett`). Production images are built by
their GitHub Actions workflows and rolled out pull-based via Flux; a local build requires a
registry login the agent does not hold. When such a trigger path is detected, the script
SHALL name the responsible CI workflow instead.

`task feature:deploy` remains available as the break-glass path because `kubectl apply`
requires no registry login. The exit-code collection and fail-closed `deploy/blocked`
reporting introduced by T002242-M3 SHALL remain in effect for the tasks that still run.

#### Scenario: A merged website change reports the CI workflow instead of building

- **GIVEN** a merge commit touching `components/website/src/pages/index.astro`
- **WHEN** `scripts/devflow-post-merge-deploy.sh` runs
- **THEN** no image build is started and the output names `build-website.yml`

#### Scenario: A failing break-glass task still reports deploy blocked

- **GIVEN** `task feature:deploy` exits non-zero
- **WHEN** `scripts/devflow-post-merge-deploy.sh` finishes
- **THEN** it records a `deploy blocked` phase event and exits non-zero
