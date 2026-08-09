# mcp-gateway — Delta-Spec

## Purpose

Dieser Change ergänzt das Requirement für agy Headless MCP Tool Permission Bypass in `openspec/specs/mcp-gateway.md`.

## ADDED Requirements

### Requirement: agy Headless MCP Tool Permission Bypass

The system SHALL support headless non-interactive execution of `agy` CLI using the `--dangerously-skip-permissions` flag, which auto-approves all MCP tool permission checks (`mcp(*)`, `mcp(<server>/<tool>)`) without requiring interactive user confirmation in headless mode.

#### Scenario: agy binary supports --dangerously-skip-permissions flag

- **GIVEN** die `agy` CLI Binary ist auf dem System installiert
- **WHEN** `agy --help` aufgerufen wird
- **THEN** ist das Flag `--dangerously-skip-permissions` verfügbar

#### Scenario: Headless agy invocation bypasses MCP permission prompts

- **GIVEN** ein non-interaktiver / subagentischer Aufruf von `agy` (z. B. `agy -p '...'`)
- **WHEN** das Flag `--dangerously-skip-permissions` übergeben wird
- **THEN** gibt `agy` Tool-Berechtigungsanfragen automatisch frei, ohne an interaktiven Prompts zu scheitern
