# Partial 2: Execution Runner & MCP Stdio Server

## Tasks

- [ ] **Step 1: Implement Execution Runner & Job Registry**
  - Create `scripts/mcp-task-runner/runner.mjs`.
  - Implement `runTask(taskName, env)` spawning `task <name> ENV=<env>`, argument allowlist validation (`A-Za-z0-9_:./-`, no `--` prefix).
  - Implement `executePlan(plan)` running groups sequentially and tasks within each group concurrently with fail-fast semantics.
  - Implement async Job Registry: `runTaskAsync(taskName, env)`, `cancelTask(jobId)` with SIGTERM and 5-second SIGKILL escalation timer, `getTaskResult(jobId)`.

- [ ] **Step 2: Implement Stdio JSON-RPC 2.0 MCP Server**
  - Create `scripts/mcp-task-runner/server.mjs` with `#!/usr/bin/env node`.
  - Handle stdio line-delimited JSON-RPC 2.0 messages (`initialize`, `tools/list`, `tools/call`).
  - Register all 7 MCP tools: `plan_tasks`, `run_task`, `execute_plan`, `get_task_graph`, `run_task_async`, `cancel_task`, `get_task_result`.
  - Parse CLI arguments `--taskfile <path>` (reject paths containing `..`) and `--otel-endpoint <host:port>` (fail-open if unreachable).
