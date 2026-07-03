## ADDED Requirements

### Requirement: Buildable Quartz site Dockerfile in the brain template

The brain template SHALL ship a buildable `site.Dockerfile` that pins Quartz at tag `v4.5.2` via a shallow git clone, runs `npm ci` inside the clone (which provides its own `package.json`), replaces the clone's content directory with the wiki content copied from the build context, builds with `npx quartz build`, and serves the generated `/q/public` output from the official `ghcr.io/static-web-server/static-web-server:2-alpine` runtime image. The Dockerfile SHALL NOT copy a template-side `package.json` and SHALL NOT run `npm ci --only=production`, since the template is a pure content wiki without a Node manifest.

#### Scenario: Dockerfile pins Quartz v4.5.2 and uses the official static-web-server runtime

- **GIVEN** the repository checkout
- **WHEN** `templates/brain/site.Dockerfile` is inspected
- **THEN** it contains `--branch v4.5.2` in the Quartz clone instruction
- **AND** it uses `ghcr.io/static-web-server/static-web-server:2-alpine` as the runtime stage base image
- **AND** it contains neither `COPY package` nor `--only=production`

### Requirement: Site build workflow template

The brain template SHALL include a GitHub Actions workflow at `.github/workflows/build-site.yml` that, on push to `main` or manual dispatch, stages the wiki content (`index.md`, `log.md`, `SCHEMA.md`, `wiki`, `raw`) into a build context together with `site.Dockerfile`, and builds and pushes the container image `ghcr.io/paddione/brain-site:latest` to ghcr.io using the workflow's `GITHUB_TOKEN` with `packages: write` permission.

#### Scenario: Workflow template exists and pushes the brain-site image

- **GIVEN** the repository checkout
- **WHEN** `templates/brain/.github/workflows/build-site.yml` is inspected
- **THEN** the file exists
- **AND** it references `site.Dockerfile` as the staged build Dockerfile
- **AND** it pushes the tag `ghcr.io/paddione/brain-site:latest`

### Requirement: Bootstrap seed carries the site build files

The bootstrap script SHALL seed both `site.Dockerfile` and `.github/workflows/build-site.yml` into every seed target through its unchanged 1:1 template copy, so that every bootstrapped brain repository is immediately able to build and publish its Quartz site.

#### Scenario: Local-mode seed contains both build files

- **GIVEN** a temporary empty target directory
- **WHEN** `scripts/brain-bootstrap.sh <target>` runs in local mode
- **THEN** it exits 0
- **AND** `<target>/site.Dockerfile` exists
- **AND** `<target>/.github/workflows/build-site.yml` exists
