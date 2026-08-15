# Partial 3: MCP Registry & Taskfile Integration

## Tasks

- [ ] **Step 1: Update MCP Registry**
  - Update `docs/agent-guide/registry/mcp.yaml` for `mcp-task-runner` to reference `node scripts/mcp-task-runner/server.mjs`.
  - Update `Taskfile.yml` task `mcp-task-runner:install` to symlink or install the Node script wrapper to `/usr/local/bin/mcp-task-runner`.
  - Run `task mcp:sync` and verify parity with `task mcp:check`.

- [ ] **Step 2: Deprecate and Clean up Go Codebase**
  - Remove or archive the `mcp-task-runner/` Go module directory.
  - Verify that no lingering build steps depend on Go toolchain for `mcp-task-runner`.
