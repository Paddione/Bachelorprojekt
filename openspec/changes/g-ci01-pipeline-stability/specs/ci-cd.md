## MODIFIED Requirements

### Requirement: Post-merge Freshness-Regenerierung ohne externe GPG-Action

The system SHALL auto-regenerate freshness artifacts after every main-push without depending on
external GPG-signing Actions. Bot-commits from `freshness-regen.yml` MUST NOT use
`crazy-max/ghaction-import-gpg` or any other external commit-signing Action. Authentication
via `secrets.GH_PAT` is sufficient for push authorization.

#### Scenario: freshness-regen workflow completes without GPG setup failure

- **GIVEN** a push to `main` triggers `freshness-regen.yml`
- **WHEN** the workflow runs the "Import GPG key" step
- **THEN** no such step exists; the workflow proceeds directly to artifact regeneration

#### Scenario: freshness-regen bot-commit succeeds without GPG signing *(BATS)*

- **GIVEN** `.github/workflows/freshness-regen.yml` exists
- **WHEN** the file is grep-scanned for `ghaction-import-gpg`
- **THEN** no match is found — the broken action reference is absent

### Requirement: Website Dockerfile verwendet pnpm als Package-Manager

The system SHALL build the website Docker image using pnpm@10 to match the CI package-manager.
`website/Dockerfile` MUST reference `pnpm-lock.yaml` (not `package-lock.json`) and MUST install
dependencies via `pnpm install --frozen-lockfile`.

#### Scenario: Dockerfile COPY line references pnpm-lock.yaml *(BATS)*

- **GIVEN** `website/Dockerfile` exists and `website/pnpm-lock.yaml` exists
- **WHEN** the Dockerfile COPY instruction for lock files is examined
- **THEN** it references `pnpm-lock.yaml`, not `package-lock.json`

#### Scenario: Dockerfile build stage uses pnpm install *(BATS)*

- **GIVEN** `website/Dockerfile` uses pnpm as package manager
- **WHEN** the install command in the build stage is examined
- **THEN** it is `pnpm install --frozen-lockfile`, not `npm ci`

#### Scenario: website directory contains only pnpm-lock.yaml *(BATS)*

- **GIVEN** the website was migrated to pnpm in T001224
- **WHEN** the website directory is checked for lock files
- **THEN** `website/pnpm-lock.yaml` exists and `website/package-lock.json` does NOT exist
