## ADDED Requirements

### Requirement: Pre-granted gh Permissions in antigravity-cli settings

The system SHALL have `Bash(gh *)` and `Bash(gh-axi *)` entries in
`~/.gemini/antigravity-cli/settings.json` `permissions.allow` so agents
can run `gh` commands directly without an interactive permission prompt
that fails due to grant-format mismatch.

#### Scenario: Direct gh command succeeds without interactive prompt

- **GIVEN** the `~/.gemini/antigravity-cli/settings.json` contains a
  `permissions.allow` list with `Bash(gh *)` and `Bash(gh-axi *)`
- **WHEN** an agent runs `gh pr view 42` via the Bash tool
- **THEN** the command executes without a permission-denied error

#### Scenario: BATS guard validates configuration

- **GIVEN** the BATS test in `tests/spec/mcp-tooling.bats` checks for `Bash(gh *)` allow-entry
- **WHEN** `npx bats tests/spec/mcp-tooling.bats` runs on a machine with the antigravity-cli installed
- **THEN** the test `antigravity-cli settings.json pre-grants Bash(gh *) permission` passes

### Requirement: CONTRIBUTING.md documents the permission behavior

The system SHALL document in `CONTRIBUTING.md` under a `### antigravity-cli Permissions`
section: the root cause of the sandbox intercept failure, the `bash -c "gh ..."` workaround,
and the correct fix via `permissions.allow`.

#### Scenario: New contributor reads CONTRIBUTING.md

- **GIVEN** a contributor encounters the `gh` permission-denied behavior in antigravity-cli
- **WHEN** they consult `CONTRIBUTING.md` under the antigravity-cli Permissions section
- **THEN** they understand the root cause, the workaround, and the correct long-term fix
