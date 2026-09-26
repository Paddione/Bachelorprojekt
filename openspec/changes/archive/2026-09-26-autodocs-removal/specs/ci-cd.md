## MODIFIED Requirements

### Requirement: Freshness-Auto-Regenerierung nach main-Push

The system SHALL regenerate all stale generated artifacts (API-Map, repo-index)
after every push to `main` and SHALL commit and push the regenerated files if any changed,
using a dedicated bot identity.

#### Scenario: Veraltete Artefakte werden automatisch committet

- **GIVEN** `task freshness:regenerate` produziert Änderungen in `docs/generated/`
- **WHEN** `git diff --quiet` zeigt `changed=true`
- **THEN** committet der Bot (`github-actions[bot]`) mit `chore: auto-regenerate freshness artifacts`
  und pusht direkt auf `main` via `GH_PAT`

#### Scenario: Keine Änderungen — kein leerer Commit

- **GIVEN** alle generierten Artefakte sind bereits aktuell
- **WHEN** `git diff --quiet` zeigt `changed=false`
- **THEN** überspringt der Workflow den Commit-Schritt — kein leerer Commit entsteht

### Requirement: Lazy npm ci Guard in Test-Tasks vor Node-Skript-Aufrufen

The system SHALL ensure that every Taskfile task invoking a third-party-importing Node.js
script includes a lazy dependency install guard (`[ -d node_modules ] || npm ci`) that
executes before any `node` call, so that the offline test suite succeeds on fresh worktrees
without a prior `npm ci`.

#### Scenario: test:agent-guide installiert Node-Deps vor dem node-Aufruf

- **GIVEN** ein frischer Worktree ohne `node_modules/` (z.B. via `scripts/worktree-create.sh`)
- **WHEN** `task test:agent-guide` aufgerufen wird
- **THEN** führt der Task zuerst `[ -d node_modules ] || npm ci` aus — und erst danach den `node`-Aufruf — sodass fehlende Packages nicht zu `ERR_MODULE_NOT_FOUND` führen

## REMOVED Requirements

### Requirement: Docs-Content-Linting auf veraltete und verbotene Inhalte

The built docs tree it lints no longer exists.

### Requirement: Brand-Switch-Shell

The docs shell HTML it constrains is deleted with the sites.

### Requirement: Docs-Content-Vollständigkeit — Mermaid-Diagramme

The service pages it covers are deleted with the sites.

## ADDED Requirements

### Requirement: Keine Auto-Docs-Maschinerie mehr

The repository SHALL NOT contain auto reading-docs machinery: no
docs-build workflow, no docs generator, no built docs tree, no docs
deployment manifests and no `docs:*` serving tasks. The freshness
pipeline SHALL regenerate gate/plumbing artifacts only.

#### Scenario: No generator or workflow remains

- **GIVEN** the repository after auto-docs removal
- **WHEN** the absence guard runs
- **THEN** `.github/workflows/build-docs.yml`, `scripts/build-docs.mjs`
  and `scripts/docs-gen/` do not exist
- **AND** no Taskfile task starts with `docs:build` or `docs:deploy`

#### Scenario: No serving path remains

- **GIVEN** the repository after auto-docs removal
- **WHEN** the absence guard runs
- **THEN** `k3d/docs.yaml` and `k3d/docs-content-built/` do not exist
- **AND** no ingress rule or kustomization resource references a docs service
