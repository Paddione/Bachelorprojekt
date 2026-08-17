## MODIFIED Requirements

### Requirement: gitleaks-Gegenscan

The system SHALL run `gitleaks` as a supplemental secret scan layer at two points: (1) the pre-commit hook (fail-open, warns if gitleaks is not installed) and (2) GitHub Actions CI (fail-closed, hard-fails on finding leaks). git-crypt-managed paths (`environments/.secrets/**`) SHALL be allowlisted in `.gitleaks.toml` because encrypted blobs produce false positives on entropy-based rules. BATS positive tests that force a gitleaks finding SHALL copy their fixture into a scan path that matches no allowlist pattern (e.g. a fresh directory under `/dev/shm`), because the `.*tmp.*` allowlist entry (T002554) also matches `$BATS_TEST_TMPDIR` under `/tmp` and would silently suppress the finding.

#### Scenario: gitleaks pre-commit warns without binary

- **GIVEN** a machine without `gitleaks` installed
- **WHEN** `git commit` triggers the pre-commit hook
- **THEN** a warning is printed that gitleaks is not installed
- **AND** the commit proceeds (exit 0)

#### Scenario: gitleaks CI fails on finding leaks

- **GIVEN** the CI Security Scan job runs
- **WHEN** `gitleaks detect` finds a potential secret
- **THEN** the job fails with a non-zero exit code
- **AND** the findings are printed in the CI log

#### Scenario: git-crypt paths are excluded from gitleaks

- **GIVEN** the `.gitleaks.toml` allowlist
- **WHEN** `gitleaks detect` scans the repository
- **THEN** files under `environments/.secrets/` (and other git-crypt paths) are not flagged
- **AND** the `.gitleaks.toml` comment explains why encrypted blobs are excluded

#### Scenario: BATS positive tests scan fixtures outside allowlisted paths

- **GIVEN** a BATS test that forces a gitleaks finding by scanning a copied fixture
- **WHEN** the test copies the fixture into a directory whose path matches no allowlist pattern (e.g. `mktemp -d /dev/shm/alk.XXXXXX`, which contains no `tmp` segment)
- **THEN** `gitleaks detect` reports the leak (exit 1, "leaks found") and the test passes
- **AND** when the target directory does not exist (e.g. no `/dev/shm`), the test skips cleanly instead of failing
