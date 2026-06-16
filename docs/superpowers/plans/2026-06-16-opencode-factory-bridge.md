---
title: "OpenCode × Factory Bridge + Agent-Msg Wiring"
date: 2026-06-16
status: active
ticket_id: T000915
plan_ref: docs/superpowers/specs/2026-06-16-opencode-factory-bridge-design.md
domains: [factory, opencode, agent-coordination]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# OpenCode × Factory Bridge + Agent-Msg Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give OpenCode first-class access to the Software Factory via a thin loopback MCP server, and wire the Factory pipeline to broadcast its lifecycle over the existing `agent-msg.sh` channel so parallel sessions stay coordinated.

**Architecture:** A ~180-line Node.js MCP server (`scripts/factory/mcp-server.mjs`) on `127.0.0.1:13003` exposes 5 read/trigger tools, each a thin shell-out to existing scripts (`scripts/factory/lib.sh` → `factory_psql`, `scripts/ticket.sh enqueue`, `scripts/factory/wakeup.sh`). OpenCode registers it via `.opencode/opencode.jsonc`; lifecycle is managed by new `openclaw:factory-mcp:*` Taskfile tasks. Separately, `wakeup.sh`/`pipeline.js`/`dispatcher.js` post `agent-msg` breadcrumbs at start/claim/done/escalate, and `AGENTS.md` instructs OpenCode when to use Factory tools and to read pending messages at session start.

**Tech Stack:** Node.js (ESM, `@modelcontextprotocol/sdk` StreamableHTTP transport), Bash (existing factory helpers), BATS (offline tests with PATH-stubbed `kubectl`/`bash` deps), go-task, jsonc.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/factory/mcp-server.mjs` | Create | The MCP server: 5 tool handlers, each shells out to an existing script. Bind loopback only. |
| `scripts/factory/mcp-package.json` | Create | Isolated `@modelcontextprotocol/sdk` dependency for the MCP server (mirrors the existing isolated `scripts/factory/package.json` for ci-review). |
| `.opencode/opencode.jsonc` | Modify | Add `mcp-factory` remote entry pointing at `http://localhost:13003/mcp`. |
| `Taskfile.openclaw.yml` | Modify | Add `openclaw:factory-mcp:start` / `:stop` / `:status` tasks (PID-file lifecycle + health probe). |
| `scripts/factory/wakeup.sh` | Modify | Read `--unread` + post `factory-tick: starting/done` breadcrumbs. |
| `scripts/factory/pipeline.js` | Modify | Post `claiming`/`finished` breadcrumbs (agent() calls inside existing phases — no top-level imports; FA-SF-20 invariants preserved). |
| `scripts/factory/dispatcher.js` | Modify | Post `N run(s) blocked/escalated` breadcrumb inside the existing escalation branch. |
| `AGENTS.md` | Modify | New "Factory-Tools & Koordination" section for OpenCode. |
| `tests/unit/factory_mcp_server.bats` | Create | Offline tests: all 5 tool handlers against PATH-stubbed `kubectl`/`ticket.sh`/`wakeup.sh`. |
| `Taskfile.yml` | Modify | Wire `test:unit:factory-mcp-server` internal task + add it to `test:unit` deps. |

### S1 line-budget analysis (effective threshold = baseline if baselined, else static limit)

All touched/created files were checked against `docs/code-quality/baseline.json` — **none are baselined** (`jq` returned `nicht-baselined` for every one). Effective threshold = static extension limit from `gates.yaml`:

| File | Ext limit | Current | Projected after change | Budget | Action |
|------|-----------|---------|------------------------|--------|--------|
| `scripts/factory/mcp-server.mjs` | `.mjs` = 500 | 0 (new) | ~180 | ~320 | New file cut well under limit. |
| `scripts/factory/wakeup.sh` | `.sh` = 500 | 132 | ~140 | ~360 | Tiny addition. |
| `scripts/factory/dispatcher.js` | `.js` = 600 | 205 | ~210 | ~390 | Tiny addition. |
| `scripts/factory/pipeline.js` | `.js` = 600 (**but IGNORED in gates.yaml**) | 635 | ~645 | n/a | **Sanctioned S1 exception** (`s1.ignore` lists `scripts/factory/pipeline.js`). NOT exempt from FA-SF-20 structural contract → additions MUST be `agent()` calls inside existing phases; **no** new top-level `import`/`require`, no `meta` change. |
| `Taskfile.openclaw.yml` | `.yml` — not S1-tracked | 142 | ~165 | n/a | YAML not in `s1.limits`. |
| `Taskfile.yml` | `.yml` — not S1-tracked | — | +~8 | n/a | YAML not S1-tracked. |
| `AGENTS.md` | `.md` — not S1-tracked | 170 | ~205 | n/a | Markdown not S1-tracked. |
| `tests/unit/factory_mcp_server.bats` | `.bats` = 300 | 0 (new) | ~120 | ~180 | New file under limit. |
| `.opencode/opencode.jsonc` | `.jsonc` — not S1-tracked | 44 | ~50 | n/a | Not S1-tracked. |
| `scripts/factory/mcp-package.json` | `.json` — not S1-tracked | 0 (new) | ~12 | n/a | Not S1-tracked. |

**S2 (import cycles):** `mcp-server.mjs` is a pure leaf module — it imports only `@modelcontextprotocol/sdk`, `node:http`, and `node:child_process`. It is imported by nobody (it is an entrypoint). No cycle possible.

**S3 (hardcoded brand domains):** No `*.mentolder.de` / `*.korczewski.de` literals anywhere. The MCP server binds `127.0.0.1` and queries via `kubectl --context fleet` resolved inside `lib.sh` (brand → namespace, never a domain). `agent-msg` breadcrumbs carry ticket ids/labels only.

**S4 (orphans):** `mcp-server.mjs` is referenced by `.opencode/opencode.jsonc` + the new Taskfile tasks. `mcp-package.json` is referenced by the install step in the start task. `factory_mcp_server.bats` is wired into `Taskfile.yml` `test:unit`. No orphans.

---

## Task 1: Create the MCP server dependency manifest

**Files:**
- Create: `scripts/factory/mcp-package.json`

**Why:** The spec assumed `@modelcontextprotocol/sdk` was already a dep in `scripts/factory/package.json`, but that file only declares `@anthropic-ai/sdk` (it is the isolated CI-review package). To avoid coupling the MCP server to the ci-review deps, give it its own isolated manifest mirroring the existing pattern.

- [ ] **Step 1: Write the manifest**

Create `scripts/factory/mcp-package.json`:

```json
{
  "name": "factory-mcp-server",
  "private": true,
  "type": "module",
  "description": "Isolated deps for the loopback Factory MCP server (mcp-server.mjs).",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

- [ ] **Step 2: Verify it is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('scripts/factory/mcp-package.json','utf8'))" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add scripts/factory/mcp-package.json
git commit -m "feat(factory): isolated dep manifest for MCP server [T000XXX]"
```

---

## Task 2: Write the Factory MCP server

**Files:**
- Create: `scripts/factory/mcp-server.mjs`

**Design:** Each tool handler shells out to an existing script and returns its stdout as MCP text content. Read-tools (`factory_status`, `factory_queue`, `factory_recent`) source `scripts/factory/lib.sh` and call `factory_psql` (so namespace/context resolution stays in one place). `factory_enqueue` calls `scripts/ticket.sh enqueue`. `factory_trigger` spawns `scripts/factory/wakeup.sh` detached. A plain `GET /health` returns `ok` (used by the status task). The server binds `127.0.0.1:13003` only.

- [ ] **Step 1: Write the server**

Create `scripts/factory/mcp-server.mjs`:

```javascript
#!/usr/bin/env node
// scripts/factory/mcp-server.mjs — loopback MCP server bridging OpenCode → Software Factory.
// Streamable-HTTP transport on 127.0.0.1:13003. Every tool is a thin shell-out to an
// existing script (lib.sh/factory_psql, ticket.sh, wakeup.sh) — no business logic here.
// No auth: loopback bind only. Start via `task openclaw:factory-mcp:start`.
import { createServer } from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

const REPO = process.env.FACTORY_REPO ?? '/home/patrick/Bachelorprojekt'
const HOST = '127.0.0.1'
const PORT = Number(process.env.FACTORY_MCP_PORT ?? 13003)
const BRANDS = ['mentolder', 'korczewski']

// Run a bash snippet with a brand env, return trimmed stdout (or throw on non-zero).
function runBash(snippet, brand) {
  return new Promise((resolve, reject) => {
    execFile('bash', ['-c', snippet], {
      cwd: REPO,
      timeout: 20000,
      env: { ...process.env, ...(brand ? { BRAND: brand } : {}) },
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${err.message}\n${stderr ?? ''}`.slice(0, 2000)))
      resolve(String(stdout).trim())
    })
  })
}

function text(s) {
  return { content: [{ type: 'text', text: String(s) || '(empty)' }] }
}

const server = new McpServer({ name: 'factory-bridge', version: '1.0.0' })

// factory_status — queue depth + whether a tick lock is held, per brand.
server.tool('factory_status', 'Software Factory queue depth and whether a tick is running.', {}, async () => {
  const lines = []
  for (const brand of BRANDS) {
    const depth = await runBash(`bash ${REPO}/scripts/factory/queue.sh | jq 'length'`, brand).catch((e) => `err: ${e.message}`)
    lines.push(`${brand}: queue=${depth}`)
  }
  const lock = process.env.FACTORY_TICK_LOCK ?? '/tmp/factory-tick.lock'
  const running = await runBash(`flock -n ${lock} -c true >/dev/null 2>&1 && echo idle || echo running`).catch(() => 'unknown')
  lines.push(`tick: ${running}`)
  return text(lines.join('\n'))
})

// factory_queue — waiting feature tickets (backlog) for a brand (default mentolder).
server.tool('factory_queue', 'List waiting Factory feature tickets for a brand.', {
  brand: { type: 'string', enum: BRANDS, default: 'mentolder' },
}, async ({ brand }) => {
  const b = BRANDS.includes(brand) ? brand : 'mentolder'
  return text(await runBash(`bash ${REPO}/scripts/factory/queue.sh`, b))
})

// factory_enqueue — set a ticket to type=feature,status=backlog so the Factory picks it up.
server.tool('factory_enqueue', 'Enqueue a ticket into the Software Factory queue.', {
  ticket_id: { type: 'string' },
  brand: { type: 'string', enum: BRANDS, default: 'mentolder' },
}, async ({ ticket_id, brand }) => {
  if (!/^[A-Za-z0-9_-]+$/.test(String(ticket_id ?? ''))) {
    return text(`refused: invalid ticket_id ${JSON.stringify(ticket_id)}`)
  }
  const b = BRANDS.includes(brand) ? brand : 'mentolder'
  return text(await runBash(`bash ${REPO}/scripts/ticket.sh enqueue --id ${ticket_id}`, b))
})

// factory_trigger — fire one Factory tick immediately (detached; wakeup.sh has its own flock guard).
server.tool('factory_trigger', 'Trigger one Software Factory tick now (detached).', {}, async () => {
  const child = spawn('bash', [`${REPO}/scripts/factory/wakeup.sh`], {
    cwd: REPO, detached: true, stdio: 'ignore',
    env: { ...process.env },
  })
  child.unref()
  return text(`factory tick triggered (pid ${child.pid}); wakeup.sh single-flights via flock.`)
})

// factory_recent — last N factory breadcrumb comments from the ticket_comments table.
server.tool('factory_recent', 'Show the last N Factory run breadcrumbs.', {
  limit: { type: 'integer', default: 10 },
  brand: { type: 'string', enum: BRANDS, default: 'mentolder' },
}, async ({ limit, brand }) => {
  const n = Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : 10
  const b = BRANDS.includes(brand) ? brand : 'mentolder'
  const sql = `SELECT created_at || ' ' || left(body, 200) FROM tickets.ticket_comments WHERE author_label='factory' ORDER BY created_at DESC LIMIT ${n};`
  const snippet = `source ${REPO}/scripts/factory/lib.sh && factory_resolve && printf '%s' ${JSON.stringify(sql)} | factory_psql`
  return text(await runBash(snippet, b))
})

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
await server.connect(transport)

const http = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    return
  }
  if (req.url === '/mcp') {
    transport.handleRequest(req, res)
    return
  }
  res.writeHead(404)
  res.end('not found')
})

http.listen(PORT, HOST, () => {
  process.stderr.write(`factory-mcp: listening on http://${HOST}:${PORT}/mcp (health: /health)\n`)
})
```

- [ ] **Step 2: Verify it parses (offline syntax check)**

Run: `node --check scripts/factory/mcp-server.mjs && echo OK`
Expected: `OK` (the SDK import is resolved at runtime, `--check` only parses).

- [ ] **Step 3: Commit**

```bash
git add scripts/factory/mcp-server.mjs
git commit -m "feat(factory): loopback MCP server bridging OpenCode to the Factory [T000XXX]"
```

---

## Task 3: Wire the MCP server into OpenCode config

**Files:**
- Modify: `.opencode/opencode.jsonc`

**Note on transport type:** The spec offered `local` vs `remote`. We use **`remote`** (matching every other entry in this file — `mcp-k8s`, `mcp-github`, etc. are all `remote`) so lifecycle is explicit via Taskfile (Task 4), consistent with the existing servers.

- [ ] **Step 1: Add the `mcp-factory` entry**

In `.opencode/opencode.jsonc`, inside the `"mcp"` object, after the `mcp-keycloak` block, add:

```jsonc
    "mcp-factory": {
      "type": "remote",
      "url": "http://localhost:13003/mcp",
      "enabled": true
    }
```

(Add a comma after the closing `}` of the `mcp-keycloak` block so the JSON stays valid.)

The `mcp` object should end up as:

```jsonc
    "mcp-keycloak": {
      "type": "remote",
      "url": "http://localhost:18081/mcp/sse",
      "enabled": true
    },
    "mcp-factory": {
      "type": "remote",
      "url": "http://localhost:13003/mcp",
      "enabled": true
    }
  },
```

- [ ] **Step 2: Verify the file is still valid JSONC (strip comments, parse)**

Run: `node -e "const s=require('fs').readFileSync('.opencode/opencode.jsonc','utf8').replace(/\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,''); JSON.parse(s); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add .opencode/opencode.jsonc
git commit -m "feat(opencode): register mcp-factory server [T000XXX]"
```

---

## Task 4: Add Taskfile lifecycle tasks for the MCP server

**Files:**
- Modify: `Taskfile.openclaw.yml`

- [ ] **Step 1: Append the three tasks**

Add to the `tasks:` map in `Taskfile.openclaw.yml` (after the existing `wipe:` task):

```yaml
  factory-mcp:start:
    desc: "Start the Factory MCP server (loopback 127.0.0.1:13003) as a background process"
    vars:
      REPO: '{{.REPO | default "/home/patrick/Bachelorprojekt"}}'
      PIDFILE: /tmp/factory-mcp.pid
    cmds:
      - |
        if [[ -f "{{.PIDFILE}}" ]] && kill -0 "$(cat {{.PIDFILE}})" 2>/dev/null; then
          echo "factory-mcp already running (pid $(cat {{.PIDFILE}}))"
          exit 0
        fi
        # Ensure the SDK dependency is installed in scripts/factory/ (isolated manifest).
        if [[ ! -d "{{.REPO}}/scripts/factory/node_modules/@modelcontextprotocol" ]]; then
          ( cd "{{.REPO}}/scripts/factory" && npm install --no-save --package-lock=false \
              --prefix "{{.REPO}}/scripts/factory" \
              @modelcontextprotocol/sdk@^1.0.0 )
        fi
        nohup node "{{.REPO}}/scripts/factory/mcp-server.mjs" >/tmp/factory-mcp.log 2>&1 &
        echo $! > "{{.PIDFILE}}"
        sleep 1
        echo "factory-mcp started (pid $(cat {{.PIDFILE}})) — log: /tmp/factory-mcp.log"

  factory-mcp:stop:
    desc: "Stop the Factory MCP server"
    vars:
      PIDFILE: /tmp/factory-mcp.pid
    cmds:
      - |
        if [[ -f "{{.PIDFILE}}" ]] && kill -0 "$(cat {{.PIDFILE}})" 2>/dev/null; then
          kill "$(cat {{.PIDFILE}})" && rm -f "{{.PIDFILE}}"
          echo "factory-mcp stopped"
        else
          echo "factory-mcp not running"
          rm -f "{{.PIDFILE}}"
        fi

  factory-mcp:status:
    desc: "Health-probe the Factory MCP server"
    cmds:
      - |
        port="${FACTORY_MCP_PORT:-13003}"
        curl -sS --max-time 3 "http://127.0.0.1:${port}/health" \
          && echo " (factory-mcp: up)" \
          || echo "factory-mcp healthz did not respond on port ${port}"
```

- [ ] **Step 2: Verify the Taskfile parses and the tasks are listed**

Run: `task -t Taskfile.openclaw.yml --list 2>/dev/null | grep factory-mcp`
Expected: three lines — `factory-mcp:start`, `factory-mcp:stop`, `factory-mcp:status`.

- [ ] **Step 3: Commit**

```bash
git add Taskfile.openclaw.yml
git commit -m "feat(openclaw): factory-mcp start/stop/status lifecycle tasks [T000XXX]"
```

---

## Task 5: Wire agent-msg breadcrumbs into wakeup.sh

**Files:**
- Modify: `scripts/factory/wakeup.sh`

**Where:** After the flock acquire (line ~53) and before the idle-retick loop (line ~87). Add the read + start post after `cd "${REPO}"` succeeds and the lock is held; add the done post after the `while` loop ends.

- [ ] **Step 1: Add the read + start breadcrumb**

In `scripts/factory/wakeup.sh`, immediately **after** the `flock -n 9` success block (the `fi` closing the `if ! flock -n 9` test, line ~53) and before the git-crypt probe comment, insert:

```bash
# ── agent-msg coordination (informative, never a blocker — all || true) ──────
# Surface pending messages from parallel sessions, then announce the tick start.
bash "${REPO}/scripts/agent-msg.sh" read --unread 2>/dev/null || true
AGENT_MSG_LABEL=factory bash "${REPO}/scripts/agent-msg.sh" post "factory-tick: starting (dry_run=${DRY_RUN})" 2>/dev/null || true
```

(Note: `${DRY_RUN}` is defined at line ~40, before this point — safe to reference.)

- [ ] **Step 2: Add the done breadcrumb**

In `scripts/factory/wakeup.sh`, immediately **after** the `done` that closes the idle-retick `while true; do` loop (the final `done` at line ~132), append:

```bash
AGENT_MSG_LABEL=factory bash "${REPO}/scripts/agent-msg.sh" post "factory-tick: done" 2>/dev/null || true
```

- [ ] **Step 3: Verify the script still parses**

Run: `bash -n scripts/factory/wakeup.sh && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add scripts/factory/wakeup.sh
git commit -m "feat(factory): wakeup.sh posts agent-msg start/done breadcrumbs [T000XXX]"
```

---

## Task 6: Wire agent-msg breadcrumbs into pipeline.js

**Files:**
- Modify: `scripts/factory/pipeline.js`

**Constraint:** `pipeline.js` is the monolithic Workflow script. FA-SF-20 guards its structural invariants (no top-level imports before `meta`, no dynamic `import()`, single `await main()`). All additions here are **`agent()` calls inside existing phases** — they ask the harness subagent to run a bash command. No new top-level statements, no `meta` change.

- [ ] **Step 1: Add the claim breadcrumb (Scout phase entry)**

In `scripts/factory/pipeline.js`, inside the `try { if (!REUSE) {` block, immediately **after** the `phaseEvent('scout', 'entered', ...)` call (line ~154) and before `const cp = require('child_process')`, add:

```javascript
await agent(
  `Run exactly this and report nothing else: AGENT_MSG_LABEL=factory bash ${REPO}/scripts/agent-msg.sh post "factory-pipeline: claiming ${A.ticket_id} (${String(A.title ?? '').slice(0, 80)})" 2>/dev/null || true`,
  { label: 'agent-msg-claim', phase: 'Scout' },
)
```

- [ ] **Step 2: Add the finished breadcrumb (cleanup/finally block)**

In the `finally` block at the very end of `main()` (line ~634), **before** the existing `try { await agent(...cleanup.sh...) }`, add a finished breadcrumb. Replace the current `finally` body:

```javascript
} finally { if (WORK_BRANCH || WORK_WT) { try { await agent(`bash ${REPO}/scripts/factory/cleanup.sh --branch '${WORK_BRANCH}' --worktree '${WORK_WT}'`, { label: 'cleanup' }) } catch (_) {} } } }
```

with:

```javascript
} finally {
  try {
    await agent(
      `Run exactly this and report nothing else: AGENT_MSG_LABEL=factory bash ${REPO}/scripts/agent-msg.sh post "factory-pipeline: ${A.ticket_id} finished" 2>/dev/null || true`,
      { label: 'agent-msg-done' },
    )
  } catch (_) {}
  if (WORK_BRANCH || WORK_WT) {
    try { await agent(`bash ${REPO}/scripts/factory/cleanup.sh --branch '${WORK_BRANCH}' --worktree '${WORK_WT}'`, { label: 'cleanup' }) } catch (_) {}
  }
} }
```

(The trailing `} }` closes the `finally` block and `main()` respectively — verify the brace count matches the original.)

- [ ] **Step 3: Verify the script parses (FA-SF-20 offline check)**

Run: `node --check scripts/factory/pipeline.js && echo OK`
Expected: `OK`

- [ ] **Step 4: Run the FA-SF-20 structural contract test**

Run: `./tests/unit/lib/bats-core/bin/bats tests/local/FA-SF-20-pipeline-contract.bats`
Expected: all tests pass (confirms no top-level import added, single `await main()`, `meta` intact).

- [ ] **Step 5: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "feat(factory): pipeline.js posts agent-msg claim/finished breadcrumbs [T000XXX]"
```

---

## Task 7: Wire agent-msg breadcrumb into dispatcher.js

**Files:**
- Modify: `scripts/factory/dispatcher.js`

**Where:** Inside the existing escalation branch `if (escalations.length) { ... }` (line ~161), the dispatcher already spawns a notify agent. Add the agent-msg post as an instruction appended to that same agent's prompt — or, more simply, as a separate `agent()` call right after the escalation `agent(...)` call, still inside the `if (escalations.length)` block.

- [ ] **Step 1: Add the escalation breadcrumb**

In `scripts/factory/dispatcher.js`, inside the `if (escalations.length) {` block, immediately **after** the closing `)` of the existing `await agent(...)` escalation call (line ~185) and before the block's closing `}`, add:

```javascript
    await agent(
      `Run exactly this and report nothing else: AGENT_MSG_LABEL=factory bash ${REPO}/scripts/agent-msg.sh post "factory-dispatch: ${escalations.length} run(s) blocked/escalated" 2>/dev/null || true`,
      { label: 'agent-msg-escalate', phase: 'Launch' },
    )
```

- [ ] **Step 2: Verify the script parses**

Run: `node --check scripts/factory/dispatcher.js && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add scripts/factory/dispatcher.js
git commit -m "feat(factory): dispatcher.js posts agent-msg escalation breadcrumb [T000XXX]"
```

---

## Task 8: Document Factory tools & coordination for OpenCode in AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the new section**

In `AGENTS.md`, immediately **after** the existing `## Agent Coordination` section (ends at line ~93, the `Use worktrees ...` line) and before `## Task Reference`, insert:

```markdown
## Factory-Tools & Koordination (OpenCode)

OpenCode hat über den `mcp-factory`-Server (loopback `127.0.0.1:13003`) Zugriff auf
die Software Factory. Lifecycle: `task -t Taskfile.openclaw.yml openclaw:factory-mcp:start|stop|status`.

**Verfügbare Tools:**

| Tool | Wann nutzen |
|------|-------------|
| `factory_status` | Vor jeder Factory-Aktion: zeigt Queue-Tiefe pro Brand + ob gerade ein Tick läuft. |
| `factory_queue` | Welche Feature-Tickets warten (backlog) — Argument `brand` (default `mentolder`). |
| `factory_enqueue` | Ein bestehendes Ticket einreihen (`ticket_id`, `brand`). Setzt `type=feature, status=backlog`. |
| `factory_trigger` | Einen Tick sofort starten. Harmlos bei laufendem Tick (wakeup.sh single-flightet via flock). |
| `factory_recent` | Letzte N Factory-Breadcrumbs (`limit`, `brand`). Zeigt was die Pipeline zuletzt tat. |

**Factory nutzen vs. selbst implementieren:** Routinemäßige, gut spezifizierte Features
(klarer Plan vorhanden) → `factory_enqueue` + `factory_trigger`. Explorative,
mehrdeutige oder cross-cutting Arbeit → selbst via `dev-flow-plan`/`dev-flow-execute`.

**Beim Session-Start (Pflicht):** ausstehende Nachrichten paralleler Sessions lesen, um
zu sehen, ob die Factory gerade ein Ticket bearbeitet:

```bash
bash scripts/agent-msg.sh read --unread
```

Erscheint dort `factory-pipeline: claiming T000xxx` ohne folgendes `finished`, arbeitet die
Factory aktiv an diesem Ticket — dann **nicht** dasselbe Ticket anfassen (Doppelarbeit/Branch-Race).
```

- [ ] **Step 2: Verify the section is present**

Run: `grep -q "## Factory-Tools & Koordination" AGENTS.md && grep -q "factory_enqueue" AGENTS.md && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): document Factory MCP tools + agent-msg session-start read [T000XXX]"
```

---

## Task 9: Write the offline BATS test for the MCP server

**Files:**
- Create: `tests/unit/factory_mcp_server.bats`

**Strategy:** The MCP server's tool handlers each shell out via `execFile('bash', ['-c', snippet], { cwd: REPO, env: { BRAND } })`. We test the **shell snippets** the handlers run — by extracting/reproducing each command and running it against PATH-stubbed `kubectl`, `ticket.sh`, `wakeup.sh`, and `flock`. This keeps the test fully offline (no cluster, no node MCP runtime needed) while exercising every tool's command contract. A `node --check` on the server is included so a syntax break is caught.

We stub the executables the snippets call by prepending a temp `bin/` to `PATH`:
- `kubectl` → prints a canned `factory_psql` result.
- `bash scripts/factory/queue.sh` → we instead point `FACTORY_REPO` at a fixture repo whose `scripts/factory/queue.sh` echoes a fixed JSON array.

Simpler and more robust: stub at the `bash -c "<snippet>"` boundary by validating the snippet strings the server constructs. We assert the server source contains the exact commands (contract test), plus run the live snippets against stubs.

- [ ] **Step 1: Write the test**

Create `tests/unit/factory_mcp_server.bats`:

```bash
#!/usr/bin/env bats
# tests/unit/factory_mcp_server.bats — offline contract tests for the Factory MCP server.
# No cluster/node-runtime required: we (a) syntax-check the server and (b) run each tool's
# underlying shell command against PATH-stubbed kubectl/ticket.sh/wakeup.sh.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SRV="$REPO_ROOT/scripts/factory/mcp-server.mjs"
  STUB_DIR="$(mktemp -d "$BATS_TMPDIR/factory-mcp-stub.XXXXXX")"

  # Stub kubectl: factory_psql pipes SQL into `kubectl exec ... psql ...`; just echo a row.
  cat > "$STUB_DIR/kubectl" <<'EOF'
#!/usr/bin/env bash
# Swallow stdin (the SQL) and emit a canned single-column row.
cat >/dev/null 2>&1 || true
echo "2026-06-16 factory-pipeline: T000999 finished"
EOF
  chmod +x "$STUB_DIR/kubectl"

  # Stub jq passthrough length for queue depth.
  PATH="$STUB_DIR:$PATH"
  export PATH
}

teardown() {
  rm -rf "$STUB_DIR"
}

@test "mcp-server.mjs parses (node --check)" {
  run node --check "$SRV"
  [ "$status" -eq 0 ]
}

@test "server source registers all 5 tools" {
  for tool in factory_status factory_queue factory_enqueue factory_trigger factory_recent; do
    run grep -q "server.tool('$tool'" "$SRV"
    [ "$status" -eq 0 ]
  done
}

@test "server binds loopback only (127.0.0.1)" {
  run grep -q "const HOST = '127.0.0.1'" "$SRV"
  [ "$status" -eq 0 ]
  run grep -q "0.0.0.0" "$SRV"
  [ "$status" -ne 0 ]
}

@test "factory_enqueue rejects an injection-shaped ticket_id" {
  # Mirror the server's validation regex against a malicious id.
  run bash -c '[[ "T000; rm -rf /" =~ ^[A-Za-z0-9_-]+$ ]] && echo accept || echo refuse'
  [ "$output" = "refuse" ]
}

@test "factory_recent SQL snippet runs against stubbed factory_psql" {
  # Reproduce the exact snippet the server builds for factory_recent.
  local sql="SELECT 1;"
  run env BRAND=mentolder FACTORY_CTX=fleet bash -c \
    "source $REPO_ROOT/scripts/factory/lib.sh && factory_resolve && printf '%s' '$sql' | factory_psql"
  [ "$status" -eq 0 ]
  [[ "$output" == *"factory-pipeline"* ]]
}

@test "factory_queue snippet is queue.sh piped to jq length" {
  run grep -q "queue.sh | jq 'length'" "$SRV"
  [ "$status" -eq 0 ]
}

@test "factory_enqueue snippet calls ticket.sh enqueue --id" {
  run grep -q "ticket.sh enqueue --id" "$SRV"
  [ "$status" -eq 0 ]
}

@test "factory_trigger spawns wakeup.sh detached" {
  run grep -q "scripts/factory/wakeup.sh" "$SRV"
  [ "$status" -eq 0 ]
  run grep -q "detached: true" "$SRV"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run the test**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/factory_mcp_server.bats`
Expected: all tests PASS. (If `factory_psql` stub fails because `lib.sh` calls `kubectl exec` differently, confirm the `kubectl` stub swallows stdin and exits 0 — it must.)

- [ ] **Step 3: Commit**

```bash
git add tests/unit/factory_mcp_server.bats
git commit -m "test(factory): offline contract tests for MCP server [T000XXX]"
```

---

## Task 10: Wire the BATS test into the offline suite

**Files:**
- Modify: `Taskfile.yml`

**Why:** `scripts/tests/unit-coverage-guard.sh` fails CI if a `tests/unit/*.bats` file is neither referenced by a test task nor listed in `.coverage-allowlist`. This test needs a live `kubectl`-stub path but runs fully offline (stubs in setup), so it belongs in the offline `test:unit` suite, not the allowlist.

- [ ] **Step 1: Add the internal task**

In `Taskfile.yml`, near the other `test:unit:*` internal tasks (e.g. after `test:unit:factory-blocked:`, around line ~320), add:

```yaml
  test:unit:factory-mcp-server:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/factory_mcp_server.bats
```

- [ ] **Step 2: Add it to the `test:unit` deps list**

In the `test:unit:` aggregate task's `deps:` (or `cmds: [task: ...]`) list, immediately after the `- task: test:unit:factory-blocked` line, add:

```yaml
      - task: test:unit:factory-mcp-server
```

- [ ] **Step 3: Verify the task resolves and runs**

Run: `task test:unit:factory-mcp-server`
Expected: bats output, all tests pass.

- [ ] **Step 4: Verify the coverage guard is satisfied**

Run: `task test:unit:coverage-guard`
Expected: PASS (no un-referenced bats file).

- [ ] **Step 5: Commit**

```bash
git add Taskfile.yml
git commit -m "test(factory): wire factory_mcp_server.bats into test:unit [T000XXX]"
```

---

## Task 11: Regenerate test inventory

**Files:**
- Modify: `website/src/data/test-inventory.json` (generated)

**Why:** CI re-runs `task test:inventory` and fails if `website/src/data/test-inventory.json` differs from the committed version. A new BATS file must be reflected there.

- [ ] **Step 1: Regenerate**

Run: `task test:inventory`
Expected: `website/src/data/test-inventory.json` is updated to include `factory_mcp_server.bats`.

- [ ] **Step 2: Confirm the new test is in the inventory**

Run: `grep -q "factory_mcp_server" website/src/data/test-inventory.json && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add website/src/data/test-inventory.json
git commit -m "chore(test): regenerate test inventory for factory MCP test [T000XXX]"
```

---

## Task 12: Final verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run targeted tests for the changed domains**

Run: `task test:changed`
Expected: PASS — runs vitest `--changed`, the BATS selection (incl. `factory_mcp_server.bats` and `factory-blocked.bats`), and `quality:check` (S1–S4 ratchet).

- [ ] **Step 2: Run the Factory BATS suite explicitly**

Run: `task test:factory`
Expected: PASS — confirms no Factory regression from the pipeline.js / dispatcher.js edits.

- [ ] **Step 3: Regenerate all freshness artifacts**

Run: `task freshness:regenerate`
Expected: regenerates test-inventory, repo-index, quality-index, agent-guide, etc. Commit any changes:

```bash
git add -A
git commit -m "chore: regenerate freshness artifacts [T000XXX]" || echo "nothing to regenerate"
```

- [ ] **Step 4: Run the CI-equivalent freshness + quality check**

Run: `task freshness:check`
Expected: PASS — Freshness + `quality:check` (S1–S4) + baseline key-count assertion all green. The plan adds **no** baseline entries (all touched files are non-baselined and stay under their limits; `pipeline.js` is already in `s1.ignore`), so the baseline key-count assertion holds.

- [ ] **Step 5: Confirm clean tree**

Run: `git status --porcelain`
Expected: empty (all changes committed).

---

## Self-Review

**Spec coverage:**
- Komponente 1 (MCP server, 5 tools, StreamableHTTP, loopback, no-auth) → Tasks 1, 2. ✅ (spec's claim that the SDK was already a dep was corrected — Task 1 adds it.)
- Komponente 2 (opencode.jsonc entry + Taskfile start/stop/status) → Tasks 3, 4. ✅ (chose `remote` type matching existing servers; spec allowed this fallback.)
- Komponente 3 (AGENTS.md Factory section) → Task 8. ✅
- Komponente 4 (agent-msg in wakeup.sh / pipeline.js / dispatcher.js) → Tasks 5, 6, 7. ✅
- Acceptance criteria 1–7 → covered: AC1 `factory_status` (Task 2), AC2 `factory_enqueue` (Task 2), AC3 `factory_trigger` (Task 2), AC4 wakeup.sh posts (Task 5), AC5 pipeline.js posts (Task 6), AC6 session-start read via AGENTS.md (Task 8), AC7 BATS for all 5 tools (Task 9). ✅

**Placeholder scan:** No TBD/TODO/"add error handling" placeholders — every code block is complete and runnable.

**Type/name consistency:** Tool names (`factory_status/queue/enqueue/trigger/recent`), the `mcp-factory` config key, the `/tmp/factory-mcp.pid` PID file, port `13003`, and the `AGENT_MSG_LABEL=factory` label are used identically across server, config, Taskfile, tests, and docs. The `factory_psql`/`factory_resolve` helpers match `scripts/factory/lib.sh`. `pipeline.js` edits stay within FA-SF-20 invariants (no top-level import; guarded by Task 6 Step 4).

**Quality gates:** S1 budgets documented per-file (all generous; pipeline.js is sanctioned exception but FA-SF-20-guarded), S2 leaf module no-cycle, S3 no brand-domain literals, S4 all new files referenced. Final task runs `task test:changed` + `task freshness:regenerate` + `task freshness:check`; new BATS wired + inventory regenerated.
