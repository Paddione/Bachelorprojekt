## ADDED Requirements

### Requirement: Transitive-CVE override convention documented

The `website/package.json` MAY include a `pnpm.overrides` block to pin transitive dependencies to CVE-patched versions when upstream packages have not yet released a fix. Each override entry SHALL include a comment referencing the CVE or advisory ID.

#### Scenario: Override block present with CVE annotation

- **WHEN** `website/package.json` contains a `pnpm.overrides` field
- **THEN** each overridden package version constraint SHALL trace to a known advisory (GHSA-* or CVE-*)
- **AND** the override SHALL be removed once the upstream package ships the fix

#### Scenario: Lockfile reflects override pinning

- **WHEN** `pnpm install` is run after adding an override
- **THEN** `pnpm-lock.yaml` SHALL record the overridden (safe) version for the affected transitive package
- **AND** `pnpm audit` SHALL report zero vulnerabilities for those packages
