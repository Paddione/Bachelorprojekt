---
title: MCP Server New Capabilities
date: 2026-06-28
slug: mcp-server-capabilities
status: approved
ticket_id: ""
plan_ref: ""
---

# MCP Server New Capabilities — Design Spec

## Scope

One PR (`feature/mcp-server-capabilities`) adding 6 new tools across two self-built MCP servers:

- **mcp-task-runner**: `run_task_async`, `cancel_task`, `get_task_result`, `get_task_graph`
- **ticket-mcp**: `link_tickets`, `get_ticket_links`, `export_ticket_timeline`

No new Kubernetes manifests. No new external dependencies. Both binaries are rebuilt in-place.

---

## File Structure

```
mcp-task-runner/
  runner/registry.go       # new: JobRegistry
  runner/executor.go       # +StartTask() non-blocking
  planner/graphviz.go      # new: GraphToMermaid(), GraphToJSON()
  main.go                  # +4 new tool handlers

scripts/ticket-mcp/go/
  internal/tools/links.go  # new: link_tickets, get_ticket_links
  internal/tools/list.go   # +export_ticket_timeline handler
  cmd/ticket-mcp/main.go   # +RegisterLinkTools()

scripts/lib/ticket-links.sh          # +cmd_link_tickets, cmd_get_ticket_links
scripts/ticket.sh                    # +cmd_get_timeline, case dispatch entries
scripts/datamodel/
  2026-06-28-ticket-links-deps-kind.sql  # idempotent CHECK constraint extension
```

---

## mcp-task-runner

### Feature A: Async Task Execution + Cancellation

**Problem:** `run_task` blocks until task completion. A `cancel_task` call cannot arrive while `run_task` holds the MCP request/response cycle. A new async pattern is needed.

**Design:** Three additive tools. `run_task` (sync) remains unchanged for full backward compatibility.

#### JobRegistry (`runner/registry.go`)

```go
type JobEntry struct {
    Cancel  context.CancelFunc
    Result  chan Result   // buffered(1), written once
    Status  JobStatus    // running | done | cancelled
}

type JobRegistry struct {
    mu   sync.Mutex
    jobs map[string]*JobEntry
}
```

- JobID: UUID v4 (google/uuid is already a transitive dependency)
- `CancelFunc` is idempotent — safe to call multiple times
- No TTL for MVP: entries live until process restart

#### `StartTask()` (`runner/executor.go`)

New non-blocking function alongside existing `RunTask()`:

```go
func StartTask(parentCtx context.Context, task, env, taskfilePath string) (string, error) {
    jobID := uuid.New().String()
    ctx, cancel := context.WithCancel(parentCtx)
    ch := GlobalRegistry.Register(jobID, cancel)
    go func() {
        defer cancel()
        r, _ := RunTask(ctx, task, env, taskfilePath)
        GlobalRegistry.Complete(jobID, r)
    }()
    return jobID, nil
}
```

#### Process Termination

`exec.CommandContext` sends SIGKILL by default. The `task` CLI spawns its own subprocesses (kubectl, helm, etc.) — SIGKILL leaves these as orphans.

Fix: use `cmd.Cancel` + `cmd.WaitDelay` (Go 1.20+, supported by go 1.25.5):
```go
cmd.Cancel = func() error { return cmd.Process.Signal(syscall.SIGTERM) }
cmd.WaitDelay = 5 * time.Second  // SIGKILL after 5s if still running
```

#### Tool Signatures

```
run_task_async(task: string, env?: string) → {job_id: string, status: "running"}
get_task_result(job_id: string)            → {status: "running"|"done"|"cancelled", exit_code?: int, output?: string}
cancel_task(job_id: string)                → {cancelled: bool, job_id: string}
```

---

### Feature B: Task Dependency Graph

**Design:** The `Graph = map[string][]string` (task → deps) already exists in `planner/parser.go`. New `planner/graphviz.go` adds two conversion functions.

#### `get_task_graph` Tool

```
get_task_graph(format?: "mermaid" | "json")  // default: "mermaid"
```

**Mermaid output (default):**
```
graph TD
  build["build"]
  test["test"]
  deploy["deploy"]
  build --> test
  test --> deploy
```

Node-ID sanitization: all `:`, `-`, `.`, `/` → `_` (Mermaid rejects special chars in IDs). Labels retain original names.

**JSON output:**
```json
{
  "nodes": ["build", "deploy", "test"],
  "edges": [{"from": "build", "to": "test"}, {"from": "test", "to": "deploy"}]
}
```
Edge semantics: `from` must run before `to`. Both formats are sorted deterministically (Go maps are non-deterministic).

**Cycle guard:** Not needed. `planner/scheduler.go` already runs Kahn's BFS and rejects cyclic taskfiles. Input is guaranteed acyclic.

---

## ticket-mcp

### Architecture Reminder

All Go handlers are thin adapters. Business logic lives in `ticket.sh` → psql via `kubectl exec`. No direct DB driver in Go. New features follow this same pattern exactly.

---

### Feature C: Ticket Linking

#### Database

`tickets.ticket_links` already exists with `UNIQUE(from_id, to_id, kind)`. Only the CHECK constraint needs extending:

```sql
-- scripts/datamodel/2026-06-28-ticket-links-deps-kind.sql
ALTER TABLE tickets.ticket_links
  DROP CONSTRAINT IF EXISTS ticket_links_kind_check;
ALTER TABLE tickets.ticket_links
  ADD CONSTRAINT ticket_links_kind_check
    CHECK (kind IN ('pr', 'blocks', 'relates'));
```

This migration is idempotent (DROP IF EXISTS + recreate).

#### Directionality

- **`blocks`**: unidirectional in DB. `(A, B, 'blocks')` = "A blocks B". `get_ticket_links(B)` derives `blocked_by: [A]` via reverse SQL query — no second DB row.
- **`relates`**: symmetric in DB. SQL uses UNION on both directions to return `A` under `relates` of `B` and vice versa, from a single row.

Note: `tickets.depends_on TEXT[]` is an informal planning field written by `set_plan_meta`. The new `ticket_links` with `kind='blocks'` are the structured FK-based alternative. Both coexist.

#### Bash (`scripts/lib/ticket-links.sh`, new verbs)

`cmd_link_tickets --from T000100 --to T000200 --kind blocks`:
```sql
INSERT INTO tickets.ticket_links (from_id, to_id, kind)
SELECT f.id, t.id, :'kind'
FROM tickets.tickets f, tickets.tickets t
WHERE f.external_id = :'from_ext' AND t.external_id = :'to_ext'
ON CONFLICT (from_id, to_id, kind) DO NOTHING;
```

`cmd_get_ticket_links --id T000123` → JSON:
```json
{"blocks": ["T000200"], "blocked_by": ["T000050"], "relates": ["T000300"]}
```

#### Go (`tools/links.go`)

```
link_tickets(from: string, to: string, kind?: "blocks"|"relates", brand?: string)
get_ticket_links(id: string, brand?: string)
```

Enum validation (`kind` must be `blocks` or `relates`) before shell call. Follows `workflow.go` pattern with `brandOf()` helper.

---

### Feature D: Timeline Export

#### Data Sources

Four existing tables, no migration needed:

| Source | Table | Timestamp column |
|--------|-------|-----------------|
| `comment` | `tickets.ticket_comments` | `created_at` |
| `phase_event` | `tickets.factory_phase_events` | `at` |
| `pr_link` | `tickets.ticket_links WHERE kind='pr'` | `created_at` |
| `plan_archived` | `tickets.ticket_plans` | `archived_at` |

#### SQL Pattern

Single query with 4 CTEs + `UNION ALL` + `ORDER BY ts ASC`. Returns one JSON object:

```json
{
  "ticket": {
    "external_id": "T000123", "title": "...", "status": "done",
    "type": "task", "brand": "mentolder",
    "created_at": "...", "done_at": "...", "resolution": "shipped"
  },
  "events": [
    {"source": "comment",       "ts": "...", "detail": {"type": "comment", "author": "paddione", "body": "..."}},
    {"source": "phase_event",   "ts": "...", "detail": {"phase": "implement", "state": "done", "driver": "factory"}},
    {"source": "pr_link",       "ts": "...", "detail": {"pr_number": 1234}},
    {"source": "plan_archived", "ts": "...", "detail": {"slug": "...", "branch": "feature/..."}}
  ]
}
```

#### Known Gap (documented, not fixed in this PR)

`update-status.sh` does NOT write `ticket_comments` entries. CLI-driven status transitions (via `ticket.sh update-status`) do not appear in the timeline. Status transitions via the website TypeScript (`tickets-db.ts`) DO appear as `kind='status_change'` comments.

**Follow-up ticket required:** extend `update-status.sh` to write a `kind='status_change'` comment after each status update so CLI transitions appear in the timeline.

#### Tool Signature

```
export_ticket_timeline(id: string, brand?: string)
```

Handler added to `tools/list.go` after `export_tickets` — same read-only export pattern.

---

## Testing

- `mcp-task-runner`: existing `executor_test.go` and `scheduler_test.go` extended; new `registry_test.go` for JobRegistry (cancel race, double-cancel idempotency, map cleanup after Complete)
- `ticket-mcp`: new Bash test in `tests/spec/ticket-mcp.bats` for `link-tickets` + `get-ticket-links` round-trip; `get-timeline` output shape check (offline mock via fixture JSON)
- CI gate: `task test:changed` + `task freshness:regenerate` + `task freshness:check`

---

## Out of Scope

- Streaming output for `run_task` (separate feature)
- Job registry TTL / persistence across restarts
- Status-change logging in `update-status.sh` (follow-up ticket)
- Rate limiting for parallel ticket mutations
- OTel tracing in ticket-mcp / factory-mcp (separate improvement)
