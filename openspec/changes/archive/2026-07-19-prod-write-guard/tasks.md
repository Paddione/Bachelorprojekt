---
ticket: T001954
status: planning
---

# Tasks for T001954 — Prod-Write-Guard

## Task 1: Create `scripts/prod-write-guard.sh`
- Guard script that wraps `kubectl exec psql` calls
- Checks target namespace against a denylist (`mentolder`, `workspace-korczewski`)
- Parses SQL statements for DDL/DML keywords (CREATE, INSERT, UPDATE, DELETE, ALTER, DROP, TRUNCATE)
- Returns exit 0 + warning when blocked, exit 1 when override not set
- Accepts `--confirm-prod-write` flag for explicit override

## Task 2: Create BATS test `scripts/tests/prod-write-guard.bats`
- Test namespace detection (mentolder blocked, workspace allowed)
- Test SQL keyword detection (SELECT passes, CREATE blocked)
- Test override flag behavior
- Test structured warning output format

## Task 3: Update `psql()` helper integration
- Modify the `psql()` helper in `mcp-tool-guide.md` to reference the guard
- Ensure all skill files that use `psql()` include a guard pre-check

## Task 4: Update MCP tool guide
- Add prod-write constraint to `mcp-tool-guide.md` global invariants
- Document the guard behavior and override mechanism

## Task 5: Add agent-dispatch integration
- Add guard invocation to `agent-lock.sh` claim flow or as a pre-step in dev-flow-plan
- Subagents automatically get the guard; main-session operators can override
