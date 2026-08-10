---
title: agy Headless MCP Permissions Implementation Plan
ticket_id: T002719
domains: [mcp-gateway, agent-harness]
status: plan_staged
---

# agy Headless MCP Permissions Implementation Plan

Implementation Plan for documenting and verifying agy headless MCP tool permissions via `--dangerously-skip-permissions`.

## File Structure

- `openspec/specs/mcp-gateway.md` — SSOT specification for MCP Gateway and agy harness configuration
- `tests/spec/mcp-gateway/agy-mcp-permissions.bats` — Automated BATS test verifying agy headless permission requirements

## Tasks

### Task 1: Create failing BATS test for agy headless permissions

Add a BATS test in `tests/spec/mcp-gateway/agy-mcp-permissions.bats` that asserts `--dangerously-skip-permissions` support in `agy` and checks for the requirement in `openspec/specs/mcp-gateway.md`.

Run `npx bats tests/spec/mcp-gateway/agy-mcp-permissions.bats` and confirm the test fails initially before the spec is updated (`expected: FAIL`).

### Task 2: Update SSOT spec in openspec/specs/mcp-gateway.md

Add the requirement `Requirement: agy Headless MCP Tool Permission Bypass` with scenarios for `agy` headless invocations and auto-approval of MCP tools via `--dangerously-skip-permissions` to `openspec/specs/mcp-gateway.md`.

Verify that `npx bats tests/spec/mcp-gateway/agy-mcp-permissions.bats` passes after updating `openspec/specs/mcp-gateway.md`.

### Task 3: Final verification and quality gate checks

Execute the full verification task chain to ensure test integrity and workspace freshness:

- `task test:changed`
- `task freshness:regenerate`
- `task freshness:check`
