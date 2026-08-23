## ADDED Requirements

### Requirement: Installed ticket-mcp-go binary staleness is detectable

The repository SHALL provide a guard (`task ticket-mcp:freshness`) that compares the
git revision embedded in the installed `/usr/local/bin/ticket-mcp-go` binary against
the latest commit touching `scripts/ticket-mcp/go`, making the best-effort install
fallback (stale pre-installed binary) visible instead of silent.

#### Scenario: Fresh build reports green

- **GIVEN** the binary was built from the current HEAD of `scripts/ticket-mcp/go`
- **WHEN** `task ticket-mcp:freshness` runs
- **THEN** it exits 0 and reports the matching short sha

#### Scenario: Stale binary fails with actionable message

- **GIVEN** the installed binary embeds a sha older than the last commit touching
  `scripts/ticket-mcp/go`
- **WHEN** `task ticket-mcp:freshness` runs
- **THEN** it exits 1 and prints both shas plus a hint to run `task ticket-mcp:build`

#### Scenario: Missing binary skips safely

- **GIVEN** no binary exists at the install location (e.g. CI runner)
- **WHEN** `task ticket-mcp:freshness` runs
- **THEN** it exits 0 with a visible skip note

### Requirement: Build embeds the git revision

The `ticket-mcp-go` Makefile build SHALL embed the current short git sha via
`-ldflags -X`, and the binary SHALL expose it via a `--version` flag, so consumers can
verify their own runtime stand.

#### Scenario: Version flag prints embedded sha

- **GIVEN** a freshly built binary from commit `abc1234`
- **WHEN** `ticket-mcp-go --version` runs
- **THEN** it prints a line containing `abc1234` and exits 0
