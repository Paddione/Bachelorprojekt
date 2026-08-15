---
title: "mcp-task-runner: Go-Binary nach Node.js/ESM portieren — Implementation Plan"
ticket_id: T006664
domains: [mcp, ci-cd]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-task-runner: Go-Binary nach Node.js/ESM portieren — Implementation Plan

**Goal:** Vollständige Portierung des `mcp-task-runner` MCP-Servers von Go (`mcp-task-runner/`) zu einem Node.js ESM-Skript (`scripts/mcp-task-runner/server.mjs`), um Binary- und Inode-Drift dauerhaft zu eliminieren.

**Architecture:** Ein leichtgewichtiges Node.js ESM-Modul liest stdio JSON-RPC 2.0 Nachrichten und implementiert die 7 MCP-Tools (`plan_tasks`, `run_task`, `execute_plan`, `get_task_graph`, `run_task_async`, `cancel_task`, `get_task_result`). Taskfile-Abhängigkeiten werden über `js-yaml` geparst und via Kahn-Toposort sequenziert.

**Tech Stack:** Node.js (ESM), `js-yaml`, BATS.

## File Structure

```
scripts/mcp-task-runner/planner.mjs                          # CREATE: Taskfile parsing, includes resolution, Kahn DAG sequencing
scripts/mcp-task-runner/planner.test.mjs                     # CREATE: Unit tests for Taskfile planner
scripts/mcp-task-runner/runner.mjs                           # CREATE: Subprocess execution, job registry, SIGTERM/SIGKILL escalation
scripts/mcp-task-runner/server.mjs                           # CREATE: Main stdio JSON-RPC 2.0 MCP server CLI
docs/agent-guide/registry/mcp.yaml                           # MODIFY: Update mcp-task-runner definition
Taskfile.yml                                                 # MODIFY: Update mcp-task-runner installation/symlink task
tests/spec/mcp-task-runner.bats                              # MODIFY: Verify test suite against node server
openspec/changes/mcp-task-runner-node-port/specs/mcp-task-runner.md # EXISTS: Delta-Spec
```

## Partials

| ID | File | Role | Target Files | Depends On |
|---|---|---|---|---|
| p1 | `tasks.d/p1-parser-and-planner.md` | planner | `scripts/mcp-task-runner/planner.mjs`, `scripts/mcp-task-runner/planner.test.mjs` | |
| p2 | `tasks.d/p2-runner-and-server.md` | runner | `scripts/mcp-task-runner/runner.mjs`, `scripts/mcp-task-runner/server.mjs` | p1 |
| p3 | `tasks.d/p3-registry-and-integration.md` | infra | `docs/agent-guide/registry/mcp.yaml`, `Taskfile.yml` | p2 |
| p4 | `tasks.d/p4-tests.md` | tests | `tests/spec/mcp-task-runner.bats` | p3 |

## Tasks

<!-- partial:p1-parser-and-planner -->
- [ ] **Partial 1: Taskfile DAG Parser & Planner**
  - Create `scripts/mcp-task-runner/planner.mjs`.
  - Parse `Taskfile.yml` and resolve `includes:` namespaces.
  - Implement Kahn's topological sort for `plan_tasks` to group independent tasks into parallel execution stages.
  - Implement `get_task_graph` returning Mermaid DAG (`graph TD`) or JSON.
  - Export `parseTaskfileDAG(taskfilePath)`, `planTasks(tasks, taskfilePath)`, `getTaskGraph(taskfilePath, format)`.
  - Add unit tests in `scripts/mcp-task-runner/planner.test.mjs`.
  - Run: `node --test scripts/mcp-task-runner/planner.test.mjs`

<!-- partial:p2-runner-and-server -->
- [ ] **Partial 2: Execution Runner & MCP Stdio Server**
  - Create `scripts/mcp-task-runner/runner.mjs`.
  - Implement `runTask(taskName, env)` with argument allowlist validation (`A-Za-z0-9_:./-`, no `--` prefix).
  - Implement `executePlan(plan)` with group-sequential and concurrent fail-fast execution.
  - Implement async Job Registry: `runTaskAsync(taskName, env)`, `cancelTask(jobId)` with SIGTERM and 5-second SIGKILL escalation timer, `getTaskResult(jobId)`.
  - Create `scripts/mcp-task-runner/server.mjs` with stdio JSON-RPC 2.0 message handler.
  - Parse `--taskfile <path>` (reject `..`) and `--otel-endpoint` (fail-open).

<!-- partial:p3-registry-and-integration -->
- [ ] **Partial 3: MCP Registry & Taskfile Integration**
  - Update `docs/agent-guide/registry/mcp.yaml` for `mcp-task-runner`.
  - Update `Taskfile.yml` task `mcp-task-runner:install` to symlink or install the Node script wrapper to `/usr/local/bin/mcp-task-runner`.
  - Run `task mcp:sync` and verify parity with `task mcp:check`.
  - Deprecate and clean up `mcp-task-runner/` Go module directory.

<!-- partial:p4-tests -->
- [ ] **Partial 4: Test Suite & Verification**
  - **Failing Test (RED):** Run existing BATS test suite to confirm baseline failure before implementation.
    - Run: `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-task-runner.bats`
    - Expected: `expected: FAIL`
  - **Integration Verification (GREEN):** Run all BATS tests for `mcp-task-runner`.
    - Run: `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-task-runner.bats tests/spec/mcp-task-runner/spec-doc-covers-7-tools.bats tests/spec/mcp-task-runner/planner-sees-real-deps.bats`
    - Expected: All tests PASS.
  - **Quality Gates & Freshness:**
    - Run: `task freshness:regenerate`
    - Run: `task freshness:check`
    - Run: `task test:changed`
