# workspace-deploy

## ADDED Requirements

### Requirement: The built image tag reaches the rendered manifest

The rendered website manifest SHALL reference the image tag supplied by the
build pipeline, not a hardcoded `latest`.

The tag SHALL be a template placeholder (`${WEBSITE_IMAGE_TAG}`) rather than a
literal. Templating only the image *name* is insufficient: an override would
then replace the name, turning the tag `sha-20260726-abc` into
`ghcr.io/paddione/sha-20260726-abc:latest`, an image that does not exist.

`scripts/flux-render-artifact.sh` SHALL read `WEBSITE_IMAGE_TAG` and
`BRETT_IMAGE_TAG` from the environment, with the CLI flags `--website-image`
and `--brett-image` taking precedence.

Rationale: `.github/workflows/render-fleet-artifact.yml` supplies the freshly
built SHA tag as an environment variable, while the script only ever read the
CLI flag and `Taskfile.yml`'s `flux:render` passes only `--out`. The value
arrived and was never consumed. The manifest kept `:latest`, its content did
not change between builds, and Flux therefore had nothing to apply — a green
build and a green render produced no rollout. On 2026-07-26 the website pod
was still 2.5 hours old after a successful build (run 30208864439).

#### Scenario: Supplied tag appears in the rendered Deployment

- **GIVEN** `WEBSITE_IMAGE_TAG=sha-20260726-abc` is set in the environment
- **WHEN** the fleet artifact is rendered
- **THEN** the website Deployment references `ghcr.io/paddione/website:sha-20260726-abc`

#### Scenario: CLI flag wins over the environment

- **GIVEN** both `WEBSITE_IMAGE_TAG` and `--website-image` are supplied
- **WHEN** the render script runs
- **THEN** the value from the CLI flag is used

### Requirement: The image tag placeholder never renders empty

Every render path SHALL establish a default for `WEBSITE_IMAGE_TAG` and
`BRETT_IMAGE_TAG` before invoking `envsubst`, and every `envsubst` allowlist
that permits `$WEBSITE_IMAGE` SHALL also permit `$WEBSITE_IMAGE_TAG`.

`envsubst` has no `${VAR:-default}` form: an unset variable becomes the empty
string. A missing default or a missing allowlist entry therefore renders
`image: ghcr.io/paddione/website:` — a broken manifest rather than a loud
failure. The same failure mode is visible in the korczewski `notify-push`
container, which waits forever on `bin/$/notify_push` after an `${ARCH}`
placeholder was consumed by an unguarded `envsubst` pass.

This applies to the break-glass `workspace:deploy` path as well — the path
used precisely when the GitOps path is already broken.

#### Scenario: Allowlist missing the tag placeholder fails the suite

- **GIVEN** an `envsubst` allowlist contains `$WEBSITE_IMAGE` but not `$WEBSITE_IMAGE_TAG`
- **WHEN** the spec suite runs
- **THEN** the test fails, naming the offending list

#### Scenario: Rendering without a supplied tag yields latest, not empty

- **GIVEN** no `WEBSITE_IMAGE_TAG` is set
- **WHEN** the artifact is rendered
- **THEN** the Deployment references `…/website:latest`
- **AND** no manifest contains an image reference ending in a bare colon
