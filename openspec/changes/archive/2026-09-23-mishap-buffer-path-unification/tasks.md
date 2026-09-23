---
title: "mishap-buffer-path-unification — Implementation Plan"
ticket_id: T900309
domains: [mcp, dev-flow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-buffer-path-unification — Implementation Plan

_Ticket: T900309_ · Design: `openspec/changes/mishap-buffer-path-unification/design.md`

## File Structure

```
CHANGED:
scripts/ticket-mcp-node/server.mjs
scripts/ticket-mcp-node/runner.mjs
tests/spec/mcp-skill-integration.bats
```

## Tasks

### Task 1: Failing-Test-Step (RED)

- [ ] **RED: Failing-Test-Step.** Add bats tests to `tests/spec/mcp-skill-integration.bats` asserting that `scripts/ticket-mcp-node/server.mjs` and `scripts/ticket-mcp-node/runner.mjs` do not reference `.git/info` or `..` from `gitDir`, and that both resolve `<git-common-dir>/mishap-buffer.json`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-skill-integration.bats -f "T900309"
# expected: FAIL
```

### Task 2: Implement Fix in Node MCP Server and Runner (GREEN)

- [ ] **GREEN: Fix mishapBufferPath in `server.mjs`.**
In `scripts/ticket-mcp-node/server.mjs`, change:
```js
function mishapBufferPath(root) {
  const gitDir = gitCommonDir(root);
  return join(gitDir, '..', 'mishap-buffer.json');
}
```
to:
```js
function mishapBufferPath(root) {
  const gitDir = gitCommonDir(root);
  return join(gitDir, 'mishap-buffer.json');
}
```

- [ ] **GREEN: Fix mishapBufferPath in `runner.mjs`.**
In `scripts/ticket-mcp-node/runner.mjs`, add `gitCommonDir(root)` helper matching `server.mjs` and update `mishapBufferPath`:
```js
function gitCommonDir(root) {
  try {
    const out = execSync('git rev-parse --git-common-dir', { cwd: root, encoding: 'utf8', timeout: 3000 }).trim();
    if (!out || out === '.git') return join(root, '.git');
    const abs = out.startsWith('/') ? out : join(root, out);
    return abs;
  } catch {
    return join(root, '.git');
  }
}

function mishapBufferPath(repoRoot) {
  const gitDir = gitCommonDir(repoRoot);
  return join(gitDir, 'mishap-buffer.json');
}
```

- [ ] Verify test passes:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-skill-integration.bats -f "T900309"
```

### Task 3: Final Verification

- [ ] **Verification.** Verify all affected tests and mandatory CI gates pass:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-skill-integration.bats tests/spec/ticket-mcp.bats
task test:changed
task freshness:regenerate
task freshness:check
```
