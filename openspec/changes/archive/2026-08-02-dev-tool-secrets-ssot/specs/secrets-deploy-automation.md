## ADDED Requirements

### Requirement: Dev-Tool-Secret-SSOT

The system SHALL provide a single source of truth (SSOT) for developer tool secrets (`GITHUB_PERSONAL_ACCESS_TOKEN`, `BRAINTRUST_API_KEY`, `OPENCODE_API_KEY`) at `environments/.secrets/dev-tools.yaml`, encrypted at rest via git-crypt. Every harness config file (`dotfiles/agy/settings.json`, `dotfiles/opencode/config.json`, `~/.claude/settings.json`) MUST obtain these secrets from the SSOT — never store them inline.

#### Scenario: SSOT is the only file with secret values

- **GIVEN** the repository
- **WHEN** searching for `ghp_`, `github_pat_`, `sk-` (token prefix) in `dotfiles/agy/settings.json` and `dotfiles/opencode/config.json`
- **THEN** no matches are found
- **AND** the only file containing the actual token values is `environments/.secrets/dev-tools.yaml` (git-crypt encrypted)

#### Scenario: git-crypt protects the SSOT file

- **GIVEN** `environments/.secrets/dev-tools.yaml` is committed to the repository
- **WHEN** inspecting the file blob in the git index
- **THEN** the blob begins with the git-crypt magic header (`\x00GITCRYPT\x00`)
- **AND** `scripts/git-crypt-guard.sh check-tracked` reports it as encrypted

### Requirement: Bootstrap-Merge-Semantik

The system SHALL provide `dotfiles/install.sh` which reads the SSOT and injects secrets into harness configs via idempotent `jq` merge operations. The merge SHALL only set the specific secret fields, leaving all other configuration untouched. `dotfiles/install.sh` SHALL abort with a clear error message if the SSOT file is missing or unreadable.

#### Scenario: Bootstrap injects secrets into .claude/settings.json

- **GIVEN** `~/.claude/settings.json` exists with non-secret env fields configured
- **WHEN** `bash dotfiles/install.sh` runs
- **THEN** `.env.GITHUB_PERSONAL_ACCESS_TOKEN` and `.env.BRAINTRUST_API_KEY` are set in the file
- **AND** all other keys (permissions, hooks, non-secret env vars) remain unchanged

#### Scenario: Bootstrap is idempotent

- **GIVEN** a machine with bootstrapped configs
- **WHEN** `bash dotfiles/install.sh` runs a second time
- **THEN** no files are changed (exit code 0, identical content)

#### Scenario: Bootstrap aborts on missing SSOT

- **GIVEN** `environments/.secrets/dev-tools.yaml` does not exist
- **WHEN** `bash dotfiles/install.sh` runs
- **THEN** the script exits with a non-zero code
- **AND** prints a clear message instructing the user to unlock git-crypt first

### Requirement: gitleaks-Gegenscan

The system SHALL run `gitleaks` as a supplemental secret scan layer at two points: (1) the pre-commit hook (fail-open, warns if gitleaks is not installed) and (2) GitHub Actions CI (fail-closed, hard-fails on finding leaks). git-crypt-managed paths (`environments/.secrets/**`) SHALL be allowlisted in `.gitleaks.toml` because encrypted blobs produce false positives on entropy-based rules.

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
