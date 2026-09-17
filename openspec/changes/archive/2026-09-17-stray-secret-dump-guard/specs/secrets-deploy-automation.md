## ADDED Requirements

### Requirement: Stray-Secret-Dump-Guard

The system SHALL provide `scripts/stray-secret-dump-guard.sh`, a fail-closed
guard that scans a target directory (default: the invoking repository root) for
stray Kubernetes secret-dump JSON files whose filename matches the
`*ws-secret*.json` / `*-secrets-*.json`-dump pattern. The guard SHALL exit
non-zero if any such file is present and exit 0 if none is found.

The guard SHALL be independent of the `gitleaks` binary: it MUST still report a
finding when `gitleaks` is not installed (unlike the fail-open pre-commit
gitleaks step).

The guard SHALL be invoked from the pre-commit hook (`.githooks/pre-commit`)
and from the CI `security-scan` job so that stray secret dumps are rejected
fail-closed in both places.

#### Scenario: Stray ws-secret dump in repo root fails the guard

- **GIVEN** a target directory containing a file named like
  `ws-secret.json` or a colon-mangled secret-dump artefact
- **WHEN** the guard scans that directory
- **THEN** the guard exits non-zero and names the offending file

#### Scenario: Clean target directory passes the guard

- **GIVEN** a target directory with no stray secret-dump files
- **WHEN** the guard scans that directory
- **THEN** the guard exits 0

#### Scenario: Guard fires without the gitleaks binary

- **GIVEN** a PATH that does not contain `gitleaks`
- **AND** a target directory containing a stray `ws-secret.json`
- **WHEN** the guard scans that directory
- **THEN** the guard still exits non-zero (fail-closed independent of gitleaks)

### Requirement: Exposed-Secret Cleanup Runbook

The system SHALL document, in the implementation plan and the
`secrets-deploy-automation` reference material, the manual operational gates for
an exposed untracked secret dump: (a) deletion of the offending file from the
working tree (irreversible — user-confirmed) and (b) rotation of the exposed
credentials via the existing `scripts/secret-rotate.sh` / `env:generate` +
`env:seal` flow (user-confirmed). Neither action SHALL be automated by this
change.

#### Scenario: Cleanup steps are documented, not automated

- **GIVEN** a security incident involving an untracked secret dump
- **WHEN** the plan and reference material are consulted
- **THEN** they state the deletion and rotation steps with explicit user-confirmation gates
- **AND** no step deletes the file or rotates credentials without human approval
