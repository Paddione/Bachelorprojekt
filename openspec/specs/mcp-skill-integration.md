# mcp-skill-integration


<!-- merged from change delta mcp-skill-integration.md on 2026-06-27 -->

## Purpose

### Requirement: ticket-mcp adapter completeness

The `ticket-mcp` server SHALL expose one MCP tool for every skill-critical
`scripts/ticket.sh` verb, so that skills can reach the ticket lifecycle through
MCP rather than shelling out. The skill-critical verb set is: `phase`, `grill`,
`stage-plan`, `create`, `enqueue`, `set-touched-files`, `get-attachments`,
`archive-plan`, `add-pr-link`, `get`, `add-comment`. Each tool SHALL be a thin
adapter that forwards to the matching `ticket.sh` verb via
`runner.RunTicket(...)` and SHALL preserve the verb's exact contract (required
arguments, value enumerations, and stdout format).

#### Scenario: Every skill-critical verb has a wrapper

- **GIVEN** the Go source under `scripts/ticket-mcp/go/internal/tools/`
- **WHEN** the verb set `{phase, grill, stage-plan, create, enqueue, set-touched-files, get-attachments, archive-plan, add-pr-link, get, add-comment}` is checked against the registered `mcp.NewTool(...)` adapters
- **THEN** each verb is wrapped by at least one tool whose handler calls `runner.RunTicket` with that verb as the first argument

#### Scenario: create_ticket preserves the EXT_ID|UUID stdout

- **GIVEN** the `create_ticket` tool wrapping `ticket.sh create`
- **WHEN** it is invoked with the required `type`, `title`, and `description`
- **THEN** it returns the unmodified `external_id|id` line that `create.sh` emits, so callers that parse `cut -d'|' -f1` keep working

#### Scenario: get_attachments forwards the mandatory out_dir

- **GIVEN** `cmd_get_attachments` requires both `--id` and `--out-dir`
- **WHEN** the `get_attachments` tool is defined
- **THEN** it declares both `id` and `out_dir` as required parameters and forwards `--out-dir` to the verb

## Requirements

### Requirement: Go-consolidated MCP runtime with no capability loss

The project SHALL run a single Go `ticket-mcp` binary for both the Claude Code
runtime (`.mcp.json`) and the opencode runtime (`.opencode/opencode.jsonc`),
and the Node adapter SHALL be removed. Before the Node adapter is removed, the
Go binary SHALL reach full tool and behaviour parity with the Node adapter,
including the `get_mishap_buffer` and `flush_mishap_buffer` tools and acceptance
of the `process` mishap type. The opencode runtime SHALL NOT be repointed at the
Go binary until that binary has been built.

#### Scenario: opencode points at a built Go binary

- **GIVEN** `.opencode/opencode.jsonc`
- **WHEN** the `ticket-mcp` server entry is resolved
- **THEN** its command is the Go binary `scripts/ticket-mcp/ticket-mcp-go` (not `node .../server.js`), and `task ticket-mcp:build` has produced that binary

#### Scenario: mishap buffer tools survive consolidation

- **GIVEN** the mishap-tracker skill calls `report_mishap`, `get_mishap_buffer`, and `flush_mishap_buffer`
- **WHEN** the Node adapter is removed and both runtimes use the Go binary
- **THEN** all three tools remain available from the Go binary and operate on the same `.git/mishap-buffer.json` buffer file

#### Scenario: process mishap type still accepted

- **GIVEN** the Go `report_mishap` tool
- **WHEN** a mishap with `type: process` is reported
- **THEN** it is accepted (not rejected as an invalid type), matching the prior Node behaviour and the mishap-tracker classification table

### Requirement: MCP-first skill routing

High-frequency skills SHALL present the MCP tool as the primary, executable path
for ticket-lifecycle and read operations, with the `ticket.sh` / `kubectl exec
psql` invocation documented beneath it as a fallback. Writes, DDL, and superuser
SQL SHALL remain on the `kubectl`/`psql` path per the MCP tool-guide; MCP-first
applies only to reads and to the ticket-mcp lifecycle tools.

#### Scenario: dev-flow-execute calls ticket-mcp first

- **GIVEN** the `dev-flow-execute` skill performing phase/stage-plan/get-attachments/archive-plan/add-comment operations
- **WHEN** the skill body is read by an executing agent
- **THEN** the primary instruction is an `mcp__ticket-mcp__*` tool call, and the `ticket.sh` call appears as an explicitly labelled fallback

#### Scenario: write paths stay on kubectl

- **GIVEN** a skill that performs an INSERT/UPDATE/DELETE or DDL
- **WHEN** that step is rewritten under MCP-first
- **THEN** it continues to use `kubectl exec ... psql`, not `mcp__mcp-postgres__query` (which is read-only)

### Requirement: MCP tool-guide as mapping SSOT

`.claude/skills/references/mcp-tool-guide.md` SHALL be the single source of truth
that maps each MCP server to its tools, when to prefer it, and its fallback. It
SHALL enumerate every tool name exposed by the Go `ticket-mcp` binary and the
`factory-mcp` server, list `task-master-ai` as optional/available, list
`mcp-task-runner` for task execution, and retain the portforward guard and the
kubectl-for-writes/DDL rule.

#### Scenario: guide lists every ticket-mcp tool

- **GIVEN** the set of `mcp.NewTool("...")` names in the Go source
- **WHEN** the guide is checked
- **THEN** every such tool name appears verbatim in `mcp-tool-guide.md`

### Requirement: factory-mcp registration and wiring

The `factory-mcp` HTTP server SHALL be registered in both `.mcp.json` and
`.opencode/opencode.jsonc` as an HTTP endpoint at `http://localhost:13003/mcp`,
and the `ticket-ops` and `operations-management` skills SHALL prefer its
`factory_status` / `factory_queue` / `factory_trigger` tools over equivalent
script calls, with the script path retained as a fallback for when the daemon is
down. CLAUDE.md and AGENTS.md SHALL stop referencing non-existent opencode
server names (`mcp-k8s`, `mcp-factory`) and use the real names.

#### Scenario: factory-mcp is registered in both runtimes

- **GIVEN** `.mcp.json` and `.opencode/opencode.jsonc`
- **WHEN** the MCP server list is read
- **THEN** both contain a `factory-mcp` HTTP entry pointing at `http://localhost:13003/mcp`

#### Scenario: docs no longer name phantom servers

- **GIVEN** CLAUDE.md and AGENTS.md
- **WHEN** they describe opencode MCP servers
- **THEN** they reference `mcp-kubernetes` (not `mcp-k8s`) and do not claim a server named `mcp-factory` that is not registered

### Requirement: re-drift guardrail

A hard CI BATS test (`tests/spec/mcp-tooling.bats`) SHALL fail the build when (a)
any tool name exposed by the Go `ticket-mcp` source is absent from
`mcp-tool-guide.md`, or (b) any verb in the skill-critical verb set lacks a
ticket-mcp wrapper. The test SHALL be wired into a `task test:*` target so it
executes in CI and is not an orphan.

#### Scenario: missing guide entry fails CI

- **GIVEN** a tool registered in Go but not listed in `mcp-tool-guide.md`
- **WHEN** `tests/spec/mcp-tooling.bats` runs
- **THEN** the test fails with a message naming the missing tool

#### Scenario: missing wrapper fails CI

- **GIVEN** a skill-critical verb with no corresponding `runner.RunTicket("<verb>", ...)` adapter in the Go source
- **WHEN** `tests/spec/mcp-tooling.bats` runs
- **THEN** the test fails with a message naming the unwrapped verb

#### Scenario: the guardrail actually executes

- **GIVEN** the new `tests/spec/mcp-tooling.bats`
- **WHEN** `task test:unit` (and thus `task test:changed` on a `scripts/` change) runs
- **THEN** the guardrail file is invoked by a `test:unit:*` subtask, not skipped
