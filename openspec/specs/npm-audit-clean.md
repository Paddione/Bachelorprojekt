# npm-audit-clean


<!-- merged from change delta npm-audit-clean.md on 2026-06-28 -->

## Purpose

Spec for the npm-audit-clean capability — guarantees the `website/` package reports zero known vulnerabilities on `pnpm audit` and that the gate is enforced by an automated BATS test in `task test:all`. Originally added by PR #2209 (T001278 — g-dep01-npm-vuln). Wrappers added in T001274 to unblock the validateTree CI gate for the antigravity-cli gh pre-grant plan.

## Requirements

### Requirement: Zero-vulnerability npm audit gate

The `website/` package SHALL report zero known vulnerabilities when `pnpm audit` is run against the committed `pnpm-lock.yaml`. This gate SHALL be enforced by an automated BATS test that runs in CI as part of `task test:all`.

#### Scenario: Clean audit passes the gate

- **WHEN** `pnpm audit --json` is executed in the `website/` directory
- **THEN** the command exits with code 0
- **AND** the sum of severity counts (`info` + `low` + `moderate` + `high` + `critical`) in `metadata.vulnerabilities` equals 0

#### Scenario: Vulnerability detected fails the gate

- **WHEN** a known vulnerable package version is present in `pnpm-lock.yaml`
- **THEN** the BATS test fails with a non-zero exit code
- **AND** the failure message identifies the severity and package name

#### Scenario: Override pins transitive deps to safe versions

- **WHEN** `overrides` in `website/pnpm-workspace.yaml` pins `js-yaml` to `^4.1.2` and `@babel/core` to `>=7.29.1`
- **THEN** `pnpm install --frozen-lockfile` resolves both to their patched versions
- **AND** the website build (`task website:build`) completes successfully
