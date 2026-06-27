## ADDED Requirements

### Requirement: Validate warnt bei SSOT-Specs ohne config.yaml-Eintrag

The system SHALL emit a `WARN:` line for each SSOT spec file in `openspec/specs/` that
is not listed in the `OpenSpec-Komponenten` field of `openspec/config.yaml`. The check
SHALL NOT produce a `FAIL:` line — it is advisory only and must not block CI.

#### Scenario: New spec missing from config.yaml list

- **WHEN** `openspec-validate.ts` runs and `openspec/specs/my-new-feature.md` exists
- **AND** `my-new-feature` is not listed in `openspec/config.yaml` OpenSpec-Komponenten
- **THEN** validation output contains `WARN: my-new-feature not listed in config.yaml OpenSpec-Komponenten`
- **AND** validation exits with code 0 (not failing CI)

#### Scenario: All specs are listed — no drift warning

- **WHEN** `openspec-validate.ts` runs and all files in `openspec/specs/` are listed in config.yaml
- **THEN** no `WARN: ... not listed in config.yaml` lines appear in the output

## MODIFIED Requirements

### Requirement: Validate erstellt vollständige Validierungsausgabe

The system SHALL run validation in the following order and produce a complete output:
1. Validate each SSOT spec in `openspec/specs/` for `## Purpose`, `## Requirements`, and `### Requirement:` headers (FAIL on violation)
2. Validate each active change in `openspec/changes/` (excluding `archive/`) for `specs/` directory with at least one capability `.md` (FAIL on violation), `.ticket` presence (WARN on absence)
3. **[NEW]** Check each SSOT spec slug against the `OpenSpec-Komponenten` list in `openspec/config.yaml` (WARN on absence)
4. Print a summary line: `N FAIL(s), M WARN(s)`
5. Exit with code 1 if any FAIL exists; exit 0 otherwise

#### Scenario: Validation with FAIL and WARN

- **WHEN** validation runs with one spec missing `## Purpose` and one spec not in config.yaml
- **THEN** output contains one `FAIL:` line (missing header) and one `WARN:` line (drift)
- **AND** exit code is 1 (due to FAIL)

#### Scenario: Validation with only WARN (drift)

- **WHEN** all spec headers are valid but one spec is missing from config.yaml
- **THEN** output contains only `WARN:` lines (no FAIL)
- **AND** exit code is 0
