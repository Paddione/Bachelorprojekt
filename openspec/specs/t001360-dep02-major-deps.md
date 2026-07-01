# t001360-dep02-major-deps

## Purpose

SSOT spec.

## Requirements

### Requirement: Major dependency audit process (G-DEP02 dep02 slot)

The system SHALL maintain a documented, per-slot audit of major-level
(semver-major) outdated dependencies for the root npm tooling package,
recording current/latest version, the semver jump, and a breaking-change
summary before any major upgrade is applied.

#### Scenario: Root tooling package audited for major bumps

- **GIVEN** the root `package.json` (npm) tooling manifest
- **WHEN** the dep02 audit is run (`npm outdated` per workspace)
- **THEN** every major-level outdated dependency is recorded with current
  version, latest version, semver jump, and breaking-change summary in
  `openspec/changes/t001360-dep02-major-deps/audit.md`

### Requirement: Conflict-free major upgrade execution

The system SHALL apply major dependency upgrades only when validated by the
existing test suite (`npm run test:openspec`, `task test:changed`) and SHALL
defer any upgrade blocked by an incompatible transitive peer dependency
rather than force-install it.

#### Scenario: vitest major upgrade shipped after test validation

- **GIVEN** vitest is outdated by a major version (3.2.6 → 4.1.9)
- **WHEN** the upgrade is applied to the root `package.json` / `package-lock.json`
- **THEN** `npm run test:openspec`, `test:agent-guide`, and `test:code-quality`
  pass unchanged, and `npm ci` resolves cleanly

#### Scenario: typescript major upgrade deferred due to peer conflict

- **GIVEN** typescript is outdated by a major version (5.9.3 → 6.0.3)
- **AND** `madge@8.0.0` declares `peerOptional typescript@^5.4.4` with no
  release yet supporting TypeScript 6
- **WHEN** `npm ci` (strict, CI-equivalent) is run against the bumped
  typescript version
- **THEN** the upgrade SHALL be deferred (not shipped) and recorded as
  blocked in `update-plan.md`, to be re-attempted once the blocking
  transitive peer dependency widens its range

<!-- merged from change delta t001360-dep02-major-deps.md on 2026-07-01 -->