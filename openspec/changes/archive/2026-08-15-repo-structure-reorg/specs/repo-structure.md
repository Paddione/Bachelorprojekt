## ADDED Requirements

### Requirement: Repo root carries only harness and GitHub convention files

The repo root SHALL contain only: harness entry points (`CLAUDE.md`, `AGENTS.md`,
`GEMINI.md`, a `QWEN.md` pointer), GitHub conventions (`README.md`, `CONTRIBUTING.md`,
`LICENSE`), tooling-required config files, and the top-level directories listed in this
spec. Agent persona and identity documents (`SOUL.md`, `IDENTITY.md`, `USER.md`,
`HEARTBEAT.md`) MUST NOT live at the repo root.

#### Scenario: Root contains no persona files after the reorg

- **GIVEN** the repo-structure-reorg change has been merged
- **WHEN** the repo root is listed
- **THEN** `SOUL.md`, `IDENTITY.md`, `USER.md` and `HEARTBEAT.md` are absent from the root
- **AND** their content lives under `docs/agent-context/`

#### Scenario: QWEN.md is a pointer

- **GIVEN** the reorg has been merged
- **WHEN** `QWEN.md` is read
- **THEN** it references `CLAUDE.md` as the authoritative context instead of duplicating
  project context

### Requirement: Build components live under components/

Every build component that has its own CI build workflow and Dockerfile (`website`,
`brett`, `studio-server`, `mentolder-web`, `mediaviewer-widget`, `VideoVault`) SHALL
reside under `components/`. All references to those components — in GitHub workflows,
Taskfiles, scripts, tests and agent configurations — MUST use the `components/` path.

#### Scenario: Component directories are grouped

- **GIVEN** the reorg has been merged
- **WHEN** the top-level directories are listed
- **THEN** `website`, `brett`, `studio-server`, `mentolder-web`, `mediaviewer-widget`
  and `VideoVault` appear only as subdirectories of `components/`

#### Scenario: No stale references to the old component paths

- **GIVEN** the reorg has been merged
- **WHEN** a fixed-string grep for `website/`, `brett/`, `studio-server/`,
  `mentolder-web/`, `mediaviewer-widget/` or `VideoVault/` runs over workflows,
  Taskfiles, scripts, tests and agent configurations
- **THEN** no match refers to the top-level path (matches inside `components/` are
  allowed)

### Requirement: packages/ holds npm packages

`design-system` SHALL live at `packages/design-system`; `packages/` SHALL contain only
npm-style packages (with their own `package.json`, `src/` and `tsconfig.json`).

#### Scenario: design-system moved into packages

- **GIVEN** the reorg has been merged
- **WHEN** `packages/` is listed
- **THEN** it contains `design-system` alongside `videovault-player`

### Requirement: assets/ holds branding assets

`art-library` SHALL live at `assets/art-library`. `assets/` remains the single home for
branding and design assets.

#### Scenario: art-library moved under assets

- **GIVEN** the reorg has been merged
- **WHEN** `assets/` is listed
- **THEN** it contains `art-library` as a subdirectory
- **AND** the top-level `art-library/` directory no longer exists

### Requirement: apps/ remains an app registry

`apps/` SHALL contain only app registry manifests (each declaring name, kustomize path,
domains and secrets), never source-code components.

#### Scenario: apps/ registry semantics preserved

- **GIVEN** the reorg has been merged
- **WHEN** `apps/` is listed
- **THEN** it still contains only registry manifests such as `apps/whiteboard/app.yaml`
- **AND** no source-code component directory has been added to it

### Requirement: Operational directories remain at the repo root

`k3d/`, `prod*`, `flux/`, `environments/`, `openspec/`, `tests/`, `scripts/`,
`taskfiles/`, `docker/`, `dotfiles/`, `migrations/`, `templates/`, `wireguard/` and
`rustdesk-installer/` SHALL remain top-level directories. Moving them requires a new
change with its own plan.

#### Scenario: Infrastructure paths untouched

- **GIVEN** the reorg has been merged
- **WHEN** the top-level directories are listed
- **THEN** the operational directories named above are still present at the root

### Requirement: Moves are atomic with reference updates

Every directory move in this change SHALL happen as a single atomic commit that combines
the `git mv` with all reference updates. After each move, a fixed-string grep for the
old path over the repository (excluding generated docs under `k3d/docs-content-built/`)
MUST return no stale references.

#### Scenario: Each move is self-contained

- **GIVEN** any single commit of the reorg series
- **WHEN** the commit is checked out
- **THEN** CI gates (`test:inventory`, Taskfile dry-run, workspace validation) are green
  at that commit
- **AND** a fixed-string grep for the old path of the moved directory returns no matches
  outside the moved content itself
