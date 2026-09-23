## MODIFIED Requirements

### Requirement: Unified mishap buffer path across implementations

All implementations of the mishap tracking buffer (`scripts/ticket-mcp-node/server.mjs`,
`scripts/ticket-mcp-node/runner.mjs`, and `scripts/ticket-mcp/go/internal/tools/mishap.go`)
SHALL resolve the buffer path using git's common directory (`git rev-parse --git-common-dir`),
pointing directly to `<git-common-dir>/mishap-buffer.json` (i.e. `.git/mishap-buffer.json`).
No implementation SHALL place or look for the mishap buffer in the workspace root or under `.git/info/`.

#### Scenario: ticket-mcp-node server resolves shared git common dir for buffer

- **GIVEN** `scripts/ticket-mcp-node/server.mjs`
- **WHEN** `mishapBufferPath` is computed
- **THEN** it resolves to `<git-common-dir>/mishap-buffer.json` and does not step up into the repository root

#### Scenario: ticket-mcp-node runner resolves shared git common dir for buffer

- **GIVEN** `scripts/ticket-mcp-node/runner.mjs`
- **WHEN** `mishapBufferPath` is computed
- **THEN** it resolves to `<git-common-dir>/mishap-buffer.json` rather than `.git/info/mishap-buffer.json`

#### Scenario: Go and Node implementations share the identical buffer location

- **GIVEN** a worktree or main checkout
- **WHEN** mishap entries are written or flushed by any of the Go or Node entry points
- **THEN** they read and write the exact same file under the common `.git` directory
