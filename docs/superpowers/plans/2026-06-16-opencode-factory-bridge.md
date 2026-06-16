---
title: "OpenCode × Factory Bridge + Agent-Msg Wiring Implementation Plan"
ticket_id: T000914
domains: [factory, opencode, agent-coordination]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# OpenCode × Factory Bridge + Agent-Msg Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OpenCode kann Factory-Tickets sehen, einreihen und einen Tick triggern — direkt aus dem Chat, ohne Bash-Kenntnisse. Factory-Pipeline postet `agent-msg`-Nachrichten an Schlüsselpunkten (Start/Ende/Block). OpenCode-Sessions lesen ausstehende Nachrichten beim Start.

**Architecture:** Vier additive Komponenten. (A) Ein schlanker MCP-Server (`scripts/factory/mcp-server.mjs`, StreamableHTTP, `127.0.0.1:13003`) mit 5 Tools die als dünne Bash/SQL-Wrapper die Factory-DB abfragen und `ticket.sh`/`wakeup.sh` aufrufen. (B) OpenCode-Konfiguration (`.opencode/opencode.jsonc`) registriert den MCP-Server. (C) `AGENTS.md` erhält einen Factory-Abschnitt. (D) Agent-Msg-Wiring in `wakeup.sh`, `pipeline.js` und `dispatcher.js` — alle Aufrufe fail-open (`|| true`).

**Tech Stack:** Node.js ESM (`@modelcontextprotocol/sdk`), Bash, PostgreSQL (via `factory_psql`), BATS.

---

## Ticket & Branch

- **Ticket:** T000914
- **Branch:** `feature/opencode-factory-bridge` (already pushed, holds the design spec commit)
- **Spec:** `docs/superpowers/specs/2026-06-16-opencode-factory-bridge-design.md` — this plan implements it 1:1.

## ⚠️ Reaper trap — read before you build

`agent-lock.sh reap` (run at the start of every dev-flow skill) deletes branches merged into `main` whose upstream is gone, and prunes their worktrees. **A freshly-created worktree branch with 0 commits points at `main`'s HEAD → counts as "merged" → it (and the worktree) get deleted mid-session.**

**Mitigation — do this FIRST, before any other work:**

- [x] **Step 0a: Confirm the worktree exists; recreate it if reaped**

```bash
# If /tmp/wt-opencode-factory-bridge is gone (reaper hit), recreate it from the remote branch:
cd /home/patrick/Bachelorprojekt
git fetch origin feature/opencode-factory-bridge
bash scripts/worktree-create.sh feature/opencode-factory-bridge /tmp/wt-opencode-factory-bridge origin/feature/opencode-factory-bridge
cd /tmp/wt-opencode-factory-bridge && git log --oneline -1
```

The branch already has commits and an upstream, so it is currently reaper-safe. **Commit + push after every task** (the plan does this) to keep it ahead of `main`.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/factory/mcp-server.mjs` (create) | MCP StreamableHTTP server on `127.0.0.1:13003` — 5 tools: `factory_status`, `factory_queue`, `factory_enqueue`, `factory_trigger`, `factory_recent`. |
| `scripts/factory/package.json` (modify) | Add `@modelcontextprotocol/sdk` dependency. |
| `.opencode/opencode.jsonc` (modify) | Add `mcp-factory` entry pointing to the MCP server. |
| `Taskfile.openclaw.yml` (modify) | Add `openclaw:factory-mcp:start`, `openclaw:factory-mcp:stop`, `openclaw:factory-mcp:status` tasks. |
| `AGENTS.md` (modify) | Add "Software Factory (OpenCode)" section with tool descriptions and agent-msg guidance. |
| `scripts/factory/wakeup.sh` (modify) | Add `agent-msg.sh post` calls at tick start and tick end. |
| `scripts/factory/pipeline.js` (modify) | Add `agent-msg.sh post` calls at ticket claim and pipeline done. |
| `scripts/factory/dispatcher.js` (modify) | Add `agent-msg.sh post` call in escalation block. |
| `tests/unit/factory/mcp-server.bats` (create) | BATS tests for all 5 MCP tool endpoints against a mock-DB stub. |
| `docs/superpowers/specs/2026-06-16-opencode-factory-bridge-design.md` (modify) | Update frontmatter: `ticket_id: T000914`, `plan_ref`. |

## S1 line-budget table (mandatory pre-flight)

| File | wc -l now | Baseline (`baseline.json`) | Ext limit | Effective budget |
|---|---|---|---|---|
| `scripts/factory/mcp-server.mjs` | 0 (new) | nicht-baselined | `.mjs` = 500 | 500 → target **≤ ~200** (growth reserve) |
| `scripts/factory/package.json` | 9 | nicht-baselined | N/A (JSON) | N/A |
| `.opencode/opencode.jsonc` | 44 | nicht-baselined | N/A (JSON) | N/A |
| `Taskfile.openclaw.yml` | 142 | nicht-baselined | `.yml` = no S1 extension-limit | N/A — keep additions ≤ ~30 lines |
| `AGENTS.md` | 170 | nicht-baselined | `.md` = no S1 extension-limit | N/A — keep additions ≤ ~40 lines |
| `scripts/factory/wakeup.sh` | 132 | nicht-baselined | `.sh` = 500 | 500 − 132 = **368 budget** → ~8 lines added |
| `scripts/factory/pipeline.js` | 599 | nicht-baselined | `.js` = 600 | 600 − 599 = **1 budget** → CRITICAL: only ~2 lines net (one-liner calls) |
| `scripts/factory/dispatcher.js` | 205 | nicht-baselined | `.js` = 600 | 600 − 205 = **395 budget** → ~3 lines added |
| `tests/unit/factory/mcp-server.bats` | 0 (new) | nicht-baselined | `.bats` = 300 | 300 → target **≤ ~180** |

### ⚠️ S1 CRITICAL: `pipeline.js` at 599/600

`pipeline.js` has exactly **1 line of budget** left. The spec requires adding agent-msg calls at claim and done. **Strategy:** Use inline one-liner `execFileSync` calls that replace existing whitespace or compress an existing multi-line block. If the file cannot absorb 2 net-new lines, extract a small `agentMsgBroadcast(label, text)` helper function into a new `scripts/factory/agent-msg-bridge.cjs` module (pure, no backward imports → S2-safe) and call it from `pipeline.js` with a single-line import+call.

**Decision:** Create `scripts/factory/agent-msg-bridge.cjs` (~25 lines, new file, `.cjs` limit = 200). `pipeline.js` adds 1 import line + 2 one-liner calls = 3 lines → but we must also remove 2 lines elsewhere to stay at ≤ 600. Identify 2 lines of dead code or compress a multi-line block in `pipeline.js` to offset.

## S2 — Import cycles

- `scripts/factory/agent-msg-bridge.cjs` is a **pure module** — only uses `child_process.execFileSync` to call `bash scripts/agent-msg.sh`. No imports from `pipeline.js`, `dispatcher.js`, or any DB/API layer. **No cycle risk.**
- `scripts/factory/mcp-server.mjs` is a standalone HTTP server — imports only `@modelcontextprotocol/sdk` and `node:http`. No imports from `pipeline.js` or `dispatcher.js`. **No cycle risk.**

## S3 — Hardcoded hostnames

- No brand-domain literals (`*.mentolder.de`, `*.korczewski.de`) in any new code. The MCP server binds to `127.0.0.1` (loopback only). All DB queries go through `factory_psql` (namespace resolved via `lib.sh`). **S3-clean.**

## S4 — Orphan manifests/scripts

- `scripts/factory/mcp-server.mjs` → referenced by `.opencode/opencode.jsonc` (MCP config) and `Taskfile.openclaw.yml` (start/stop tasks). **Not orphaned.**
- `scripts/factory/agent-msg-bridge.cjs` → referenced by `pipeline.js` and `dispatcher.js`. **Not orphaned.**
- `tests/unit/factory/mcp-server.bats` → wired into `Taskfile.yml` under `test:unit:factory-mcp`. **Not orphaned.**

---

## Task 1 — Add `@modelcontextprotocol/sdk` dependency

- [x] **Step 1: Add the MCP SDK to `scripts/factory/package.json`**

```bash
cd /tmp/wt-opencode-factory-bridge
npm install @modelcontextprotocol/sdk --save --prefix scripts/factory
```

- [x] **Step 2: Verify the dependency was added**

```bash
grep '@modelcontextprotocol/sdk' scripts/factory/package.json
```

Expected: `"@modelcontextprotocol/sdk": "^X.Y.Z"` in dependencies.

- [x] **Step 3: Commit**

```bash
git add scripts/factory/package.json scripts/factory/package-lock.json
git commit -m "chore(factory): add @modelcontextprotocol/sdk dependency [T000914]"
git push origin feature/opencode-factory-bridge
```

---

## Task 2 — Create `scripts/factory/agent-msg-bridge.cjs`

This pure CJS helper wraps `agent-msg.sh` calls so `pipeline.js` can broadcast messages without exceeding its S1 budget.

- [x] **Step 1: Create the file**

```bash
cat > scripts/factory/agent-msg-bridge.cjs << 'BRIDGE_EOF'
/**
 * scripts/factory/agent-msg-bridge.cjs — thin wrapper around scripts/agent-msg.sh.
 * Pure module: no backward imports from pipeline/dispatcher. All calls fail-open.
 */
'use strict'
const { execFileSync } = require('child_process')
const path = require('path')
const REPO = process.env.REPO || '/home/patrick/Bachelorprojekt'
const SCRIPT = path.join(REPO, 'scripts/agent-msg.sh')

function broadcast(text, label) {
  try {
    execFileSync('bash', [SCRIPT, 'post', String(text).slice(0, 512)], {
      stdio: 'ignore', timeout: 5000,
      env: { ...process.env, AGENT_MSG_LABEL: label || 'factory' },
    })
  } catch (_) { /* fail-open */ }
}

module.exports = { broadcast }
BRIDGE_EOF
```

- [x] **Step 2: Verify syntax**

```bash
node --check scripts/factory/agent-msg-bridge.cjs
```

- [x] **Step 3: Commit**

```bash
git add scripts/factory/agent-msg-bridge.cjs
git commit -m "feat(factory): add agent-msg-bridge.cjs helper [T000914]"
git push origin feature/opencode-factory-bridge
```

---

## Task 3 — Wire agent-msg into `wakeup.sh`

- [x] **Step 1: Add agent-msg calls to `wakeup.sh`**

After the flock acquire (line ~53, after the `exit 0` for the lock-already-held case) and before the tick loop, add:

```bash
# Read pending messages from other sessions (informativ, kein Blocker)
bash "${REPO}/scripts/agent-msg.sh read --unread 2>/dev/null || true
# Broadcast factory tick start
AGENT_MSG_LABEL=factory bash "${REPO}/scripts/agent-msg.sh" post "factory-tick: starting (dry_run=${DRY_RUN})" 2>/dev/null || true
```

At the end of the file (after the `done` of the while loop), add:

```bash
AGENT_MSG_LABEL=factory bash "${REPO}/scripts/agent-msg.sh" post "factory-tick: done" 2>/dev/null || true
```

- [x] **Step 2: Verify syntax**

```bash
bash -n scripts/factory/wakeup.sh
```

- [x] **Step 3: Commit**

```bash
git add scripts/factory/wakeup.sh
git commit -m "feat(factory): wire agent-msg into wakeup.sh [T000914]"
git push origin feature/opencode-factory-bridge
```

---

## Task 4 — Wire agent-msg into `pipeline.js`

- [x] **Step 1: Add import at the top of `pipeline.js` (after line 17 `const D = require(...)`)**

```javascript
const _msgBridge = require('./agent-msg-bridge.cjs')
```

- [x] **Step 2: Add claim broadcast after the ticket-claim phase**

Find the Scout phase entry (around the `phase('Scout')` call) and add after the first `phaseEvent`:

```javascript
_msgBridge.broadcast(`factory-pipeline: claiming ${A.ticket_id} (${A.title || A.slug})`, 'factory')
```

- [x] **Step 3: Add done broadcast at the end of `main()`**

Before the final `return` or at the end of the function body:

```javascript
_msgBridge.broadcast(`factory-pipeline: ${A.ticket_id} finished`, 'factory')
```

- [x] **Step 4: Offset S1 budget — compress 2 lines**

Since `pipeline.js` is at 599/600, find 2 lines that can be compressed (e.g., a multi-line comment that can be shortened, or a blank line + redundant semicolon). The implementer should identify the safest compression at implementation time.

- [x] **Step 5: Verify syntax**

```bash
node --check scripts/factory/pipeline.js
```

- [x] **Step 6: Verify line count ≤ 600**

```bash
wc -l scripts/factory/pipeline.js
```

Expected: ≤ 600.

- [x] **Step 7: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "feat(factory): wire agent-msg into pipeline.js [T000914]"
git push origin feature/opencode-factory-bridge
```

---

## Task 5 — Wire agent-msg into `dispatcher.js`

- [x] **Step 1: Add import at the top of `dispatcher.js` (after the `export const meta` block)**

```javascript
const _msgBridge = require('./agent-msg-bridge.cjs')
```

- [x] **Step 2: Add escalation broadcast**

Inside the `if (escalations.length)` block (around line 161), add before the `await agent(...)` call:

```javascript
_msgBridge.broadcast(`factory-dispatch: ${escalations.length} run(s) blocked/escalated`, 'factory')
```

- [x] **Step 3: Verify syntax**

```bash
node --check scripts/factory/dispatcher.js
```

- [x] **Step 4: Commit**

```bash
git add scripts/factory/dispatcher.js
git commit -m "feat(factory): wire agent-msg into dispatcher.js [T000914]"
git push origin feature/opencode-factory-bridge
```

---

## Task 6 — Create `scripts/factory/mcp-server.mjs`

- [x] **Step 1: Create the MCP server file**

```bash
cat > scripts/factory/mcp-server.mjs << 'MCP_EOF'
#!/usr/bin/env node
/**
 * scripts/factory/mcp-server.mjs — MCP StreamableHTTP server for OpenCode.
 * Binds 127.0.0.1:13003 (loopback only). 5 tools: factory_status, factory_queue,
 * factory_enqueue, factory_trigger, factory_recent.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from 'node:http'
import { execFileSync, execFile } from 'child_process'
import { randomUUID } from 'crypto'

const REPO = process.env.FACTORY_REPO || '/home/patrick/Bachelorprojekt'
const PORT = Number(process.env.FACTORY_MCP_PORT || 13003)
const LIB = `${REPO}/scripts/factory/lib.sh`

function psqlJSON(sql) {
  try {
    return execFileSync('bash', ['-c', `source "${LIB}" && factory_resolve && cat <<'SQL' | factory_psql -tA\n${sql}\nSQL`],
      { encoding: 'utf8', timeout: 15000, cwd: REPO }).trim()
  } catch (e) { return JSON.stringify({ error: e.message }) }
}

const server = new McpServer({ name: 'factory', version: '1.0.0' })

server.tool('factory_status', 'Show factory queue depth and whether a tick is running', {}, async () => {
  const lockHeld = execFileSync('bash', ['-c', `test -f /tmp/factory-tick.lock && flock -n 9 2>/dev/null && echo false || echo true`], { encoding: 'utf8', timeout: 3000 }).trim()
  return { content: [{ type: 'text', text: JSON.stringify({ backlog: psqlJSON("SELECT count(*) FROM tickets.tickets WHERE status='backlog'"), plan_staged: psqlJSON("SELECT count(*) FROM tickets.tickets WHERE status='plan_staged'"), tick_running: lockHeld === 'true' }, null, 2) }] }
})

server.tool('factory_queue', 'List waiting tickets (backlog + plan_staged)', {}, async () => {
  const sql = `SELECT COALESCE(json_agg(row_to_json(q)), '[]') FROM (SELECT external_id, title, priority, status FROM tickets.tickets WHERE status IN ('backlog','plan_staged') ORDER BY CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 ELSE 3 END, created_at) q;`
  return { content: [{ type: 'text', text: psqlJSON(sql) }] }
})

server.tool('factory_enqueue', 'Enqueue a ticket into the factory backlog', { ticket_id: { type: 'string', description: 'Ticket external_id (e.g. T000123)' } }, async ({ ticket_id }) => {
  try {
    const out = execFileSync('bash', [`${REPO}/scripts/ticket.sh`, 'enqueue', '--id', ticket_id], { encoding: 'utf8', timeout: 15000, cwd: REPO })
    return { content: [{ type: 'text', text: out.trim() || `enqueued ${ticket_id}` }] }
  } catch (e) { return { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true } }
})

server.tool('factory_trigger', 'Trigger an immediate factory tick (runs wakeup.sh in background)', {}, async () => {
  return new Promise((resolve) => {
    execFile('bash', [`${REPO}/scripts/factory/wakeup.sh`], { timeout: 3000, cwd: REPO, stdio: 'ignore' })
      .on('exit', (code) => resolve({ content: [{ type: 'text', text: `wakeup.sh exited: ${code}` }] }))
      .on('error', (e) => resolve({ content: [{ type: 'text', text: `error: ${e.message}` }], isError: true }))
  })
})

server.tool('factory_recent', 'Show last N factory run comments from ticket_comments', { limit: { type: 'number', description: 'Number of recent entries (default 10)' } }, async ({ limit }) => {
  const n = Math.min(Number(limit) || 10, 50)
  const sql = `SELECT COALESCE(json_agg(row_to_json(q)), '[]') FROM (SELECT ticket_id, author, body, created_at FROM tickets.ticket_comments WHERE author='factory' ORDER BY created_at DESC LIMIT ${n}) q;`
  return { content: [{ type: 'text', text: psqlJSON(sql) }] }
})

const app = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, server: 'factory-mcp' }))
    return
  }
  if (req.method === 'POST' && req.url === '/mcp') {
    let body = ''
    for await (const chunk of req) body += chunk
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
    await server.connect(transport)
    req.body = JSON.parse(body)
    await transport.handleRequest(req, res, req.body)
    return
  }
  res.writeHead(404).end()
})
app.listen(PORT, '127.0.0.1', () => console.log(`factory-mcp listening on 127.0.0.1:${PORT}`))
MCP_EOF
```

- [x] **Step 2: Verify syntax**

```bash
node --check scripts/factory/mcp-server.mjs
```

- [x] **Step 3: Check line count ≤ 500**

```bash
wc -l scripts/factory/mcp-server.mjs
```

Expected: ≤ 200 (well within the 500 `.mjs` limit).

- [x] **Step 4: Commit**

```bash
git add scripts/factory/mcp-server.mjs
git commit -m "feat(factory): add MCP server for OpenCode integration [T000914]"
git push origin feature/opencode-factory-bridge
```

---

## Task 7 — Configure OpenCode to use the MCP server

- [x] **Step 1: Add `mcp-factory` entry to `.opencode/opencode.jsonc`**

Add the following entry inside the `"mcp"` object (after `mcp-keycloak`):

```jsonc
"mcp-factory": {
  "type": "remote",
  "url": "http://localhost:13003/mcp",
  "enabled": true
}
```

- [x] **Step 2: Verify JSON validity**

```bash
node -e "JSON.parse(require('fs').readFileSync('.opencode/opencode.jsonc','utf8').replace(/\/\/.*$/gm,''))"
```

- [x] **Step 3: Commit**

```bash
git add .opencode/opencode.jsonc
git commit -m "feat(opencode): register factory MCP server [T000914]"
git push origin feature/opencode-factory-bridge
```

---

## Task 8 — Add Taskfile tasks for MCP server lifecycle

- [x] **Step 1: Add tasks to `Taskfile.openclaw.yml`**

Append to the `tasks:` section:

```yaml
  factory-mcp:start:
    desc: "Start the Factory MCP server in the background (PID file)"
    cmds:
      - |
        PIDFILE=/tmp/factory-mcp.pid
        if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
          echo "factory-mcp already running (PID $(cat $PIDFILE))"
        else
          nohup node scripts/factory/mcp-server.mjs > /tmp/factory-mcp.log 2>&1 &
          echo $! > "$PIDFILE"
          echo "factory-mcp started (PID $!)"
        fi

  factory-mcp:stop:
    desc: "Stop the Factory MCP server"
    cmds:
      - |
        PIDFILE=/tmp/factory-mcp.pid
        if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
          kill "$(cat "$PIDFILE")"
          rm -f "$PIDFILE"
          echo "factory-mcp stopped"
        else
          echo "factory-mcp not running"
          rm -f "$PIDFILE"
        fi

  factory-mcp:status:
    desc: "Health-check the Factory MCP server"
    cmds:
      - curl -sS --max-time 3 http://127.0.0.1:13003/health && echo "" || echo "factory-mcp not responding"
```

- [x] **Step 2: Commit**

```bash
git add Taskfile.openclaw.yml
git commit -m "feat(taskfile): add factory-mcp start/stop/status tasks [T000914]"
git push origin feature/opencode-factory-bridge
```

---

## Task 9 — Update AGENTS.md with Factory section

- [x] **Step 1: Add a "Software Factory (OpenCode)" section to `AGENTS.md`**

Insert after the existing "Software Factory (autopilot)" section (around line 153):

```markdown
**Software Factory (OpenCode MCP)**
```
mcp-factory:factory_status    # Queue depth + tick lock status
mcp-factory:factory_queue     # List waiting tickets
mcp-factory:factory_enqueue   # Add ticket to backlog (param: ticket_id)
mcp-factory:factory_trigger   # Start a factory tick immediately
mcp-factory:factory_recent    # Last N factory run comments
```
Start the MCP server: `task factory-mcp:start`
When the user asks about factory tickets, queue status, or wants to enqueue/trigger — use these tools instead of raw bash.
At session start, check for pending factory messages: `bash scripts/agent-msg.sh read --unread 2>/dev/null || true`
```

- [x] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): add Software Factory OPENCode section [T000914]"
git push origin feature/opencode-factory-bridge
```

---

## Task 10 — BATS tests for MCP server

- [x] **Step 1: Create `tests/unit/factory/mcp-server.bats`**

```bash
cat > tests/unit/factory/mcp-server.bats << 'BATS_EOF'
#!/usr/bin/env bats
# tests/unit/factory/mcp-server.bats — MCP server tool endpoint tests. [T000914]
# Offline: starts the MCP server against a mock environment, sends JSON-RPC
# requests to each tool, validates response structure.

setup() {
  export FACTORY_REPO="${BATS_TMPDIR}/mock-repo"
  mkdir -p "$FACTORY_REPO/scripts/factory"
  cp "${BATS_TEST_DIRNAME}/../../../scripts/factory/mcp-server.mjs" "$FACTORY_REPO/scripts/factory/"
  cp "${BATS_TEST_DIRNAME}/../../../scripts/factory/package.json" "$FACTORY_REPO/scripts/factory/" 2>/dev/null || true
  export FACTORY_MCP_PORT=13099
  export REPO="$FACTORY_REPO"
}

teardown() {
  [[ -n "${MCP_PID:-}" ]] && kill "$MCP_PID" 2>/dev/null || true
  rm -rf "$FACTORY_REPO"
}

_start_server() {
  node "${FACTORY_REPO}/scripts/factory/mcp-server.mjs" &
  MCP_PID=$!
  sleep 1
}

_health_check() {
  for i in 1 2 3 4 5; do
    curl -sS --max-time 2 http://127.0.0.1:${FACTORY_MCP_PORT}/health >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}

@test "mcp-server: /health returns ok" {
  _start_server
  _health_check
  result="$(curl -sS http://127.0.0.1:${FACTORY_MCP_PORT}/health)"
  [[ "$result" == *'"ok":true'* ]]
}

@test "mcp-server: factory_status tool returns JSON" {
  _start_server
  _health_check
  result="$(curl -sS -X POST http://127.0.0.1:${FACTORY_MCP_PORT}/mcp \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"factory_status","arguments":{}}}')"
  [[ "$result" == *'"content"'* ]]
}

@test "mcp-server: factory_queue tool returns JSON array" {
  _start_server
  _health_check
  result="$(curl -sS -X POST http://127.0.0.1:${FACTORY_MCP_PORT}/mcp \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"factory_queue","arguments":{}}}')"
  [[ "$result" == *'"content"'* ]]
}

@test "mcp-server: factory_enqueue tool validates ticket_id param" {
  _start_server
  _health_check
  result="$(curl -sS -X POST http://127.0.0.1:${FACTORY_MCP_PORT}/mcp \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"factory_enqueue","arguments":{"ticket_id":"T999999"}}}')"
  [[ "$result" == *'"content"'* ]]
}

@test "mcp-server: factory_recent tool returns JSON array" {
  _start_server
  _health_check
  result="$(curl -sS -X POST http://127.0.0.1:${FACTORY_MCP_PORT}/mcp \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"factory_recent","arguments":{"limit":5}}}')"
  [[ "$result" == *'"content"'* ]]
}
BATS_EOF
```

- [x] **Step 2: Verify BATS syntax**

```bash
bash -n tests/unit/factory/mcp-server.bats 2>/dev/null || true
```

- [x] **Step 3: Wire into Taskfile.yml**

Add a new task `test:unit:factory-mcp` and include it in the `test:unit` dependency list:

```yaml
  test:unit:factory-mcp:
    desc: "BATS: factory MCP server tool endpoints"
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/factory/mcp-server.bats
```

- [x] **Step 4: Commit**

```bash
git add tests/unit/factory/mcp-server.bats Taskfile.yml
git commit -m "test(factory): add BATS tests for MCP server [T000914]"
git push origin feature/opencode-factory-bridge
```

---

## Task 11 — Update spec frontmatter

- [x] **Step 1: Update the spec's frontmatter**

Edit `docs/superpowers/specs/2026-06-16-opencode-factory-bridge-design.md`:
- Change `ticket_id: T000915` → `ticket_id: T000914`
- Change `plan_ref: null` → `plan_ref: docs/superpowers/plans/2026-06-16-opencode-factory-bridge.md`

- [x] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-16-opencode-factory-bridge-design.md
git commit -m "chore(spec): update frontmatter ticket_id + plan_ref [T000914]"
git push origin feature/opencode-factory-bridge
```

---

## Task 12 — Final verification

- [x] **Step 1: Run targeted tests for changed domains**

```bash
task test:changed
```

- [x] **Step 2: Regenerate freshness artifacts**

```bash
task freshness:regenerate
```

- [x] **Step 3: Run freshness check (CI equivalent)**

```bash
task freshness:check
```

- [x] **Step 4: Run the plan frontmatter hook**

```bash
bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/2026-06-16-opencode-factory-bridge.md
```

- [x] **Step 5: Commit any regenerated artifacts**

```bash
git add -A
git commit -m "chore: auto-regenerate freshness artifacts [ci skip] [T000914]" || true
git push origin feature/opencode-factory-bridge
```

- [x] **Step 6: Final sanity checks**

```bash
wc -l scripts/factory/pipeline.js   # must be ≤ 600
wc -l scripts/factory/mcp-server.mjs  # must be ≤ 500
wc -l scripts/factory/agent-msg-bridge.cjs  # must be ≤ 200
wc -l tests/unit/factory/mcp-server.bats  # must be ≤ 300
node --check scripts/factory/mcp-server.mjs
node --check scripts/factory/pipeline.js
node --check scripts/factory/dispatcher.js
bash -n scripts/factory/wakeup.sh
bash -n scripts/factory/agent-msg-bridge.cjs 2>/dev/null || true
```
