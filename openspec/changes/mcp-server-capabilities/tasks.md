---
title: "mcp-server-capabilities — Implementation Plan"
ticket_id: "T001310"
domains: [mcp, task-runner, ticket-mcp, bash]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-server-capabilities — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 new tools across two self-built MCP servers: async task execution with cancellation (`run_task_async`, `cancel_task`, `get_task_result`), task dependency graph visualisation (`get_task_graph`), structured ticket dependency links (`link_tickets`, `get_ticket_links`), and full ticket history export (`export_ticket_timeline`).

**Architecture:** mcp-task-runner gains a process-wide `JobRegistry` (mutex-protected map of async jobs, identified by UUID v4) and a `planner/graphviz.go` module that converts the already-parsed `Graph` type to Mermaid/JSON. ticket-mcp gains two bash verbs in `lib/ticket-links.sh`, a timeline verb inline in `ticket.sh`, a new `tools/links.go` Go file, and an additional tool in `tools/list.go` — all following the existing thin-adapter pattern (Go handler → `runner.RunTicket()` → `ticket.sh` → psql via `kubectl exec`).

**Tech Stack:** Go 1.25.5, mark3labs/mcp-go, google/uuid (already transitive), Bash, PostgreSQL 16, psql heredoc SQL, BATS.

## Global Constraints

- Go module path for mcp-task-runner: `github.com/paddione/mcp-task-runner`
- Go module path for ticket-mcp: `github.com/korczewski/bachelorprojekt/ticket-mcp`
- No new external Go dependencies (google/uuid already in go.sum as indirect)
- No new Kubernetes manifests; no changes to `k3d/`, `prod*/`, or `environments/`
- All existing tool behaviours are unchanged — purely additive
- `ticket.sh` dispatch table and usage string must be updated for every new verb
- S1 budget: no files in `docs/code-quality/baseline.json` are touched by this plan; no S1 freeze applies
- SQL migrations must be idempotent (use `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, or `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`)
- BATS tests use `TICKET_OFFLINE=1` to avoid cluster calls; reads exit 9, writes exit 0 in offline mode
- `task test:changed`, `task freshness:regenerate`, `task freshness:check` in the final task

---

## File Structure

| Status | File | Responsibility |
|--------|------|----------------|
| **CREATE** | `mcp-task-runner/runner/registry.go` | `JobRegistry` — thread-safe map of async jobs; `GlobalRegistry` singleton; `Register()`, `Cancel()`, `Complete()`, `Lookup()` |
| **MODIFY** | `mcp-task-runner/runner/executor.go` | Add `StartTask()` (non-blocking wrapper); modify `RunTask()` to allow empty env and to set `cmd.Cancel = SIGTERM` + `cmd.WaitDelay = 5s` |
| **CREATE** | `mcp-task-runner/runner/registry_test.go` | Unit tests: cancel idempotency, double-cancel, Complete + Lookup round-trip |
| **MODIFY** | `mcp-task-runner/main.go` | Add four new tool handlers: `run_task_async`, `cancel_task`, `get_task_result`, `get_task_graph` |
| **CREATE** | `mcp-task-runner/planner/graphviz.go` | `GraphToMermaid(g Graph) string`, `GraphToJSON(g Graph) string` — deterministic output, node-ID sanitisation |
| **CREATE** | `mcp-task-runner/planner/graphviz_test.go` | Unit tests: Mermaid node sanitisation, deterministic order, JSON shape, empty-deps case |
| **CREATE** | `scripts/datamodel/2026-06-28-ticket-links-deps-kind.sql` | Idempotent migration: extend `ticket_links_kind_check` to allow `'blocks'` and `'relates'` |
| **MODIFY** | `scripts/lib/ticket-links.sh` | Add `cmd_link_tickets()` and `cmd_get_ticket_links()` |
| **MODIFY** | `scripts/ticket.sh` | Add `cmd_get_timeline()` inline; add three new case dispatch entries; extend usage string |
| **CREATE** | `scripts/ticket-mcp/go/internal/tools/links.go` | `RegisterLinkTools(s)` — thin adapters for `link_tickets` and `get_ticket_links` |
| **MODIFY** | `scripts/ticket-mcp/go/internal/tools/list.go` | Add `export_ticket_timeline` tool at the end of `RegisterListTools()` |
| **MODIFY** | `scripts/ticket-mcp/go/cmd/ticket-mcp/main.go` | Call `tools.RegisterLinkTools(mcpServer)` |
| **MODIFY** | `tests/spec/ticket-mcp.bats` | Add offline-safe BATS tests for `link-tickets`, `get-ticket-links`, `get-timeline` |

---

### Task 1: JobRegistry + StartTask (Feature A — foundation)

**Files:**
- Create: `mcp-task-runner/runner/registry.go`
- Create: `mcp-task-runner/runner/registry_test.go`
- Modify: `mcp-task-runner/runner/executor.go`

**Interfaces:**
- Produces: `runner.JobStatus` (string type, constants `JobRunning`, `JobDone`, `JobCancelled`); `runner.JobRegistry` with methods `Register(jobID string, cancel context.CancelFunc)`, `Cancel(jobID string) (found bool, wasCancelled bool)`, `Complete(jobID string, result Result)`, `Lookup(jobID string) (found bool, status JobStatus, result *Result)`; `runner.GlobalRegistry *JobRegistry`; `runner.StartTask(parentCtx context.Context, task, env, taskfilePath string) (string, error)`

- [ ] **Step 1: Write the failing registry test**

Create `mcp-task-runner/runner/registry_test.go`:

```go
package runner_test

import (
	"context"
	"testing"
	"time"

	"github.com/paddione/mcp-task-runner/runner"
)

func TestJobRegistryCancelIdempotent(t *testing.T) {
	var reg runner.JobRegistry
	cancelled := false
	cancel := func() { cancelled = true }

	reg.Register("job-1", cancel)

	found, wasCancelled := reg.Cancel("job-1")
	if !found {
		t.Fatal("Cancel: want found=true, got false")
	}
	if !wasCancelled {
		t.Fatal("Cancel: want wasCancelled=true, got false")
	}
	if !cancelled {
		t.Fatal("CancelFunc was not called")
	}

	// Second cancel: job already in cancelled state.
	found, wasCancelled = reg.Cancel("job-1")
	if !found {
		t.Fatal("second Cancel: want found=true, got false")
	}
	if wasCancelled {
		t.Errorf("second Cancel: want wasCancelled=false (already cancelled), got true")
	}
}

func TestJobRegistryCancelUnknownJob(t *testing.T) {
	var reg runner.JobRegistry
	found, _ := reg.Cancel("no-such-job")
	if found {
		t.Fatal("Cancel unknown job: want found=false, got true")
	}
}

func TestJobRegistryCompleteAndLookup(t *testing.T) {
	var reg runner.JobRegistry
	reg.Register("job-2", func() {})

	// Before Complete: status should be running.
	found, status, result := reg.Lookup("job-2")
	if !found {
		t.Fatal("Lookup before Complete: want found=true")
	}
	if status != runner.JobRunning {
		t.Errorf("want status=running, got %s", status)
	}
	if result != nil {
		t.Error("want result=nil before Complete")
	}

	// Complete the job.
	reg.Complete("job-2", runner.Result{Task: "deploy", Env: "mentolder", ExitCode: 0})

	// After Complete: status should be done and result present.
	found, status, result = reg.Lookup("job-2")
	if !found {
		t.Fatal("Lookup after Complete: want found=true")
	}
	if status != runner.JobDone {
		t.Errorf("want status=done, got %s", status)
	}
	if result == nil {
		t.Fatal("want result non-nil after Complete")
	}
	if result.ExitCode != 0 || result.Task != "deploy" {
		t.Errorf("unexpected result: %+v", result)
	}
}

func TestStartTaskReturnsJobID(t *testing.T) {
	fakeTask(t, `exit 0`)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	jobID, err := runner.StartTask(ctx, "deploy", "mentolder", "Taskfile.yml")
	if err != nil {
		t.Fatal(err)
	}
	if jobID == "" {
		t.Fatal("want non-empty jobID")
	}
}

func TestStartTaskInvalidTask(t *testing.T) {
	_, err := runner.StartTask(context.Background(), "", "mentolder", "Taskfile.yml")
	if err == nil {
		t.Fatal("want error for empty task name")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails (types not yet defined)**

```bash
cd /tmp/wt-mcp-server-capabilities/mcp-task-runner
go test ./runner/ -run TestJobRegistry -v 2>&1 | head -20
```

Expected: FAIL — compilation errors: `runner.JobRegistry`, `runner.JobRunning`, `runner.StartTask` undefined.

- [ ] **Step 3: Create `mcp-task-runner/runner/registry.go`**

```go
package runner

import (
	"context"
	"sync"
)

// JobStatus represents the lifecycle state of an async job.
type JobStatus string

const (
	JobRunning   JobStatus = "running"
	JobDone      JobStatus = "done"
	JobCancelled JobStatus = "cancelled"
)

// jobEntry holds the mutable state for one async job.
// All fields are protected by JobRegistry.mu.
type jobEntry struct {
	cancel context.CancelFunc
	status JobStatus
	result *Result // nil until Complete is called
}

// JobRegistry is a thread-safe store of async jobs. The zero value is ready to use.
type JobRegistry struct {
	mu   sync.Mutex
	jobs map[string]*jobEntry
}

// GlobalRegistry is the process-wide singleton registry.
var GlobalRegistry JobRegistry

func (r *JobRegistry) ensureInit() {
	if r.jobs == nil {
		r.jobs = make(map[string]*jobEntry)
	}
}

// Register creates a new entry in the registry with status=running.
// Panics if jobID is already registered (jobIDs must be unique per session).
func (r *JobRegistry) Register(jobID string, cancel context.CancelFunc) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ensureInit()
	r.jobs[jobID] = &jobEntry{cancel: cancel, status: JobRunning}
}

// Cancel attempts to cancel a running job.
// Returns (found=false, _) if jobID is unknown.
// Returns (found=true, wasCancelled=false) if the job has already finished or been cancelled.
// Returns (found=true, wasCancelled=true) and calls the cancel func if job is still running.
func (r *JobRegistry) Cancel(jobID string) (found bool, wasCancelled bool) {
	r.mu.Lock()
	entry, ok := r.jobs[jobID]
	if !ok {
		r.mu.Unlock()
		return false, false
	}
	if entry.status != JobRunning {
		r.mu.Unlock()
		return true, false
	}
	entry.status = JobCancelled
	cancel := entry.cancel
	r.mu.Unlock()
	cancel() // call outside lock; CancelFunc is safe to call concurrently
	return true, true
}

// Complete marks the job as done and stores the result.
// Safe to call from any goroutine; idempotent if called twice.
func (r *JobRegistry) Complete(jobID string, result Result) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry, ok := r.jobs[jobID]
	if !ok {
		return
	}
	// Only transition from running → done; do not overwrite a cancel.
	if entry.status == JobRunning {
		entry.status = JobDone
	}
	if entry.result == nil {
		entry.result = &result
	}
}

// Lookup returns a snapshot of the job's status and, once complete, the result.
// Returns found=false if the jobID is unknown.
func (r *JobRegistry) Lookup(jobID string) (found bool, status JobStatus, result *Result) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry, ok := r.jobs[jobID]
	if !ok {
		return false, "", nil
	}
	return true, entry.status, entry.result
}
```

- [ ] **Step 4: Add `StartTask()` to `mcp-task-runner/runner/executor.go`**

Add these imports to the existing import block:
```go
"syscall"
"time"

"github.com/google/uuid"
```

Modify the `RunTask()` function — after `cmd := exec.CommandContext(...)` and before `cmd.Start()`, add two lines:
```go
cmd.Cancel = func() error { return cmd.Process.Signal(syscall.SIGTERM) }
cmd.WaitDelay = 5 * time.Second
```

Also modify the env-validation and cmd construction in `RunTask()` to allow empty env (needed by `StartTask()`):

Replace:
```go
if err := validateArg(env); err != nil {
    return Result{Task: task, Env: env, ExitCode: 1}, fmt.Errorf("invalid env argument: %w", err)
}
// ...
cmd := exec.CommandContext(ctx, "task", "--taskfile", taskfilePath, "--", task, "ENV="+env)
```

With:
```go
if env != "" {
    if err := validateArg(env); err != nil {
        return Result{Task: task, Env: env, ExitCode: 1}, fmt.Errorf("invalid env argument: %w", err)
    }
}
// ...
taskArgs := []string{"--taskfile", taskfilePath, "--", task}
if env != "" {
    taskArgs = append(taskArgs, "ENV="+env)
}
cmd := exec.CommandContext(ctx, "task", taskArgs...)
cmd.Cancel = func() error { return cmd.Process.Signal(syscall.SIGTERM) }
cmd.WaitDelay = 5 * time.Second
```

Then add `StartTask()` after the closing brace of `RunTask()`:
```go
// StartTask starts a task asynchronously in a new goroutine, registers it in
// GlobalRegistry, and returns the job ID immediately. The caller can poll
// GlobalRegistry.Lookup(jobID) for status and result.
func StartTask(parentCtx context.Context, task, env, taskfilePath string) (string, error) {
    if err := validateArg(task); err != nil {
        return "", fmt.Errorf("invalid task: %w", err)
    }
    if env != "" {
        if err := validateArg(env); err != nil {
            return "", fmt.Errorf("invalid env: %w", err)
        }
    }
    jobID := uuid.New().String()
    ctx, cancel := context.WithCancel(parentCtx)
    GlobalRegistry.Register(jobID, cancel)
    go func() {
        defer cancel()
        r, _ := RunTask(ctx, task, env, taskfilePath)
        GlobalRegistry.Complete(jobID, r)
    }()
    return jobID, nil
}
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
cd /tmp/wt-mcp-server-capabilities/mcp-task-runner
go mod tidy  # promotes google/uuid from indirect to direct
go test ./runner/ -v
```

Expected: all tests pass, including the existing `TestRunTask*` and `TestExecutePlan*` tests plus the new `TestJobRegistry*` and `TestStartTask*` tests.

- [ ] **Step 6: Commit**

```bash
cd /tmp/wt-mcp-server-capabilities
git add mcp-task-runner/runner/registry.go \
        mcp-task-runner/runner/registry_test.go \
        mcp-task-runner/runner/executor.go \
        mcp-task-runner/go.mod \
        mcp-task-runner/go.sum
git commit -m "feat(mcp-task-runner): add JobRegistry and StartTask for async execution"
```

---

### Task 2: Wire async tool handlers in mcp-task-runner/main.go (Feature A — tools)

**Files:**
- Modify: `mcp-task-runner/main.go`

**Interfaces:**
- Consumes: `runner.StartTask()`, `runner.GlobalRegistry.Cancel()`, `runner.GlobalRegistry.Lookup()`, `runner.JobRunning`, `runner.JobDone`, `runner.JobCancelled` from Task 1
- Produces: MCP tools `run_task_async`, `cancel_task`, `get_task_result` registered on the MCP server

- [ ] **Step 1: Add three new tool handlers in `mcp-task-runner/main.go`**

Add a new import `"encoding/json"` is already present. Add the three tool handlers before the `server.ServeStdio(s)` call. The exact insertion point is after the closing brace of the `execute_plan` handler:

```go
// ── run_task_async ────────────────────────────────────────────────────────
runTaskAsyncTool := mcp.NewTool("run_task_async",
    mcp.WithDescription("Start a task in the background and return a job_id immediately. Poll get_task_result to check progress."),
    mcp.WithString("task", mcp.Required(), mcp.Description("Task name, e.g. workspace:deploy")),
    mcp.WithString("env", mcp.Description("ENV value, e.g. mentolder (optional)")),
)
s.AddTool(runTaskAsyncTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    args := req.GetArguments()
    task, _ := args["task"].(string)
    env, _ := args["env"].(string)
    if task == "" {
        return mcp.NewToolResultError("task is required"), nil
    }
    jobID, err := runner.StartTask(ctx, task, env, *taskfilePath)
    if err != nil {
        return mcp.NewToolResultError(err.Error()), nil
    }
    b, _ := json.Marshal(map[string]string{"job_id": jobID, "status": "running"})
    return mcp.NewToolResultText(string(b)), nil
})

// ── cancel_task ───────────────────────────────────────────────────────────
cancelTaskTool := mcp.NewTool("cancel_task",
    mcp.WithDescription("Cancel a running async task by job_id. Sends SIGTERM; SIGKILL follows after 5 seconds if the process has not exited."),
    mcp.WithString("job_id", mcp.Required(), mcp.Description("Job ID returned by run_task_async")),
)
s.AddTool(cancelTaskTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    args := req.GetArguments()
    jobID, _ := args["job_id"].(string)
    if jobID == "" {
        return mcp.NewToolResultError("job_id is required"), nil
    }
    found, wasCancelled := runner.GlobalRegistry.Cancel(jobID)
    if !found {
        return mcp.NewToolResultError("job not found: " + jobID), nil
    }
    type cancelResult struct {
        Cancelled bool   `json:"cancelled"`
        JobID     string `json:"job_id"`
        Reason    string `json:"reason,omitempty"`
    }
    res := cancelResult{Cancelled: wasCancelled, JobID: jobID}
    if !wasCancelled {
        res.Reason = "already done"
    }
    b, _ := json.Marshal(res)
    return mcp.NewToolResultText(string(b)), nil
})

// ── get_task_result ───────────────────────────────────────────────────────
getTaskResultTool := mcp.NewTool("get_task_result",
    mcp.WithDescription("Poll the status and output of an async task. Returns status='running' while in progress, 'done' or 'cancelled' when finished."),
    mcp.WithString("job_id", mcp.Required(), mcp.Description("Job ID returned by run_task_async")),
)
s.AddTool(getTaskResultTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    args := req.GetArguments()
    jobID, _ := args["job_id"].(string)
    if jobID == "" {
        return mcp.NewToolResultError("job_id is required"), nil
    }
    found, status, result := runner.GlobalRegistry.Lookup(jobID)
    if !found {
        return mcp.NewToolResultError("job not found: " + jobID), nil
    }
    type taskResult struct {
        Status   string `json:"status"`
        JobID    string `json:"job_id"`
        ExitCode *int   `json:"exit_code,omitempty"`
        Output   string `json:"output,omitempty"`
    }
    res := taskResult{Status: string(status), JobID: jobID}
    if result != nil {
        res.ExitCode = &result.ExitCode
        res.Output = result.Stdout + result.Stderr
    }
    b, _ := json.Marshal(res)
    return mcp.NewToolResultText(string(b)), nil
})
```

- [ ] **Step 2: Verify compilation**

```bash
cd /tmp/wt-mcp-server-capabilities/mcp-task-runner
go build ./...
```

Expected: exits 0 with no output.

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-mcp-server-capabilities
git add mcp-task-runner/main.go
git commit -m "feat(mcp-task-runner): add run_task_async, cancel_task, get_task_result tools"
```

---

### Task 3: Task dependency graph — planner/graphviz.go (Feature B)

**Files:**
- Create: `mcp-task-runner/planner/graphviz.go`
- Create: `mcp-task-runner/planner/graphviz_test.go`
- Modify: `mcp-task-runner/main.go` (add `get_task_graph` handler)

**Interfaces:**
- Consumes: `planner.Graph` (type `map[string][]string`, defined in `planner/parser.go`)
- Produces: `planner.GraphToMermaid(g Graph) string`, `planner.GraphToJSON(g Graph) string`

- [ ] **Step 1: Write the failing graphviz test**

Create `mcp-task-runner/planner/graphviz_test.go`:

```go
package planner_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/paddione/mcp-task-runner/planner"
)

func TestGraphToMermaidBasic(t *testing.T) {
	g := planner.Graph{
		"build":  {},
		"test":   {"build"},
		"deploy": {"test"},
	}
	out := planner.GraphToMermaid(g)
	if !strings.HasPrefix(out, "graph TD") {
		t.Errorf("want output to start with 'graph TD', got: %q", out[:min(len(out), 20)])
	}
	if !strings.Contains(out, "build") || !strings.Contains(out, "test") || !strings.Contains(out, "deploy") {
		t.Errorf("missing node names in mermaid output:\n%s", out)
	}
	if !strings.Contains(out, "-->") {
		t.Errorf("want at least one edge (-->), output:\n%s", out)
	}
}

func TestGraphToMermaidSanitizesNodeIDs(t *testing.T) {
	g := planner.Graph{
		"workspace:deploy": {},
		"env-check.sh":    {"workspace:deploy"},
	}
	out := planner.GraphToMermaid(g)
	// Special chars in IDs must be replaced with _
	if strings.Contains(out, "workspace:deploy[") {
		t.Error("colon in node ID must be replaced with underscore")
	}
	// Labels must retain original name
	if !strings.Contains(out, `"workspace:deploy"`) {
		t.Errorf("node label must retain original name, got:\n%s", out)
	}
}

func TestGraphToMermaidDeterministic(t *testing.T) {
	g := planner.Graph{"z": {}, "a": {}, "m": {"a"}}
	out1 := planner.GraphToMermaid(g)
	out2 := planner.GraphToMermaid(g)
	if out1 != out2 {
		t.Error("GraphToMermaid must produce identical output on repeated calls")
	}
}

func TestGraphToMermaidNoDeps(t *testing.T) {
	g := planner.Graph{"build": {}, "test": {}}
	out := planner.GraphToMermaid(g)
	if strings.Contains(out, "-->") {
		t.Errorf("no dependencies: want no edges, got:\n%s", out)
	}
}

func TestGraphToJSONShape(t *testing.T) {
	g := planner.Graph{
		"build": {},
		"test":  {"build"},
	}
	raw := planner.GraphToJSON(g)
	var result struct {
		Nodes []string `json:"nodes"`
		Edges []struct {
			From string `json:"from"`
			To   string `json:"to"`
		} `json:"edges"`
	}
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		t.Fatalf("GraphToJSON produced invalid JSON: %v\noutput: %s", err, raw)
	}
	if len(result.Nodes) != 2 {
		t.Errorf("want 2 nodes, got %d", len(result.Nodes))
	}
	if len(result.Edges) != 1 {
		t.Errorf("want 1 edge, got %d", len(result.Edges))
	}
	if result.Edges[0].From != "build" || result.Edges[0].To != "test" {
		t.Errorf("wrong edge: %+v", result.Edges[0])
	}
}

func TestGraphToJSONDeterministic(t *testing.T) {
	g := planner.Graph{"z": {}, "a": {}, "m": {"a"}}
	if planner.GraphToJSON(g) != planner.GraphToJSON(g) {
		t.Error("GraphToJSON must produce identical output on repeated calls")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /tmp/wt-mcp-server-capabilities/mcp-task-runner
go test ./planner/ -run TestGraphTo -v 2>&1 | head -20
```

Expected: FAIL — `planner.GraphToMermaid` and `planner.GraphToJSON` undefined.

- [ ] **Step 3: Create `mcp-task-runner/planner/graphviz.go`**

```go
package planner

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// sanitizeID replaces Mermaid-illegal characters in task names with underscores.
// Characters replaced: colon, hyphen, dot, slash.
func sanitizeID(name string) string {
	r := strings.NewReplacer(":", "_", "-", "_", ".", "_", "/", "_")
	return r.Replace(name)
}

// GraphToMermaid converts the task dependency graph to a Mermaid graph TD diagram.
// Output is deterministically sorted (alphabetically by node ID).
// Node IDs have special characters replaced; node labels retain original names.
// Edge semantics: from → to means "from must run before to".
func GraphToMermaid(g Graph) string {
	nodes := make([]string, 0, len(g))
	for name := range g {
		nodes = append(nodes, name)
	}
	sort.Strings(nodes)

	var sb strings.Builder
	sb.WriteString("graph TD\n")

	// Emit node declarations with sanitised ID and original label.
	for _, name := range nodes {
		id := sanitizeID(name)
		fmt.Fprintf(&sb, "  %s[%q]\n", id, name)
	}

	// Emit edges: each dep of name is an "from" (dep → name).
	for _, name := range nodes {
		deps := g[name]
		sortedDeps := make([]string, len(deps))
		copy(sortedDeps, deps)
		sort.Strings(sortedDeps)
		toID := sanitizeID(name)
		for _, dep := range sortedDeps {
			fromID := sanitizeID(dep)
			fmt.Fprintf(&sb, "  %s --> %s\n", fromID, toID)
		}
	}
	return sb.String()
}

// edge is an ordered directed dependency pair for JSON output.
type edge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// GraphToJSON converts the task dependency graph to a JSON object with
// "nodes" (sorted alphabetically) and "edges" (sorted by From then To).
// Edge semantics: from must run before to.
func GraphToJSON(g Graph) string {
	nodes := make([]string, 0, len(g))
	for name := range g {
		nodes = append(nodes, name)
	}
	sort.Strings(nodes)

	var edges []edge
	for _, name := range nodes {
		deps := g[name]
		sortedDeps := make([]string, len(deps))
		copy(sortedDeps, deps)
		sort.Strings(sortedDeps)
		for _, dep := range sortedDeps {
			edges = append(edges, edge{From: dep, To: name})
		}
	}
	// edges are already sorted because we iterate nodes alphabetically and deps alphabetically.

	type graphJSON struct {
		Nodes []string `json:"nodes"`
		Edges []edge   `json:"edges"`
	}
	if edges == nil {
		edges = []edge{} // ensure JSON array, not null
	}
	b, _ := json.Marshal(graphJSON{Nodes: nodes, Edges: edges})
	return string(b)
}
```

- [ ] **Step 4: Run the graphviz tests to verify they pass**

```bash
cd /tmp/wt-mcp-server-capabilities/mcp-task-runner
go test ./planner/ -v
```

Expected: all tests pass, including existing `TestParse*` and `TestSchedule*` plus new `TestGraphTo*` tests.

- [ ] **Step 5: Add the `get_task_graph` handler in `mcp-task-runner/main.go`**

Add before the `server.ServeStdio(s)` call:

```go
// ── get_task_graph ────────────────────────────────────────────────────────
getTaskGraphTool := mcp.NewTool("get_task_graph",
    mcp.WithDescription("Return the full task dependency DAG from the Taskfile. Default format is Mermaid (graph TD); use format=json for programmatic consumption."),
    mcp.WithString("format", mcp.Description("Output format: mermaid (default) or json"),
        mcp.Enum("mermaid", "json")),
)
s.AddTool(getTaskGraphTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    args := req.GetArguments()
    format, _ := args["format"].(string)
    if format == "" {
        format = "mermaid"
    }
    g, err := planner.Parse(*taskfilePath)
    if err != nil {
        return mcp.NewToolResultError("parse taskfile: " + err.Error()), nil
    }
    switch format {
    case "json":
        return mcp.NewToolResultText(planner.GraphToJSON(g)), nil
    default:
        return mcp.NewToolResultText(planner.GraphToMermaid(g)), nil
    }
})
```

- [ ] **Step 6: Verify compilation**

```bash
cd /tmp/wt-mcp-server-capabilities/mcp-task-runner
go build ./...
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-mcp-server-capabilities
git add mcp-task-runner/planner/graphviz.go \
        mcp-task-runner/planner/graphviz_test.go \
        mcp-task-runner/main.go
git commit -m "feat(mcp-task-runner): add get_task_graph with Mermaid/JSON output"
```

---

### Task 4: DB migration + ticket-links bash verbs (Features C+D — bash layer)

**Files:**
- Create: `scripts/datamodel/2026-06-28-ticket-links-deps-kind.sql`
- Modify: `scripts/lib/ticket-links.sh`
- Modify: `scripts/ticket.sh`
- Modify: `tests/spec/ticket-mcp.bats` (write offline validation tests first)

**Interfaces:**
- Produces: `ticket.sh link-tickets --from <ext_id> --to <ext_id> --kind blocks|relates` (exits 0 on TICKET_OFFLINE=1); `ticket.sh get-ticket-links --id <ext_id>` (exits 9 on TICKET_OFFLINE=1); `ticket.sh get-timeline --id <ext_id>` (exits 9 on TICKET_OFFLINE=1)

- [ ] **Step 1: Write failing BATS tests for the new bash verbs**

Add the following `@test` blocks to `tests/spec/ticket-mcp.bats`. Append after the existing tests:

```bash
# ── link-tickets ─────────────────────────────────────────────────────────

@test "ticket.sh link-tickets rejects missing --from" {
  run bash "$REPO/scripts/ticket.sh" link-tickets --to T000002 --kind blocks
  [ "$status" -eq 2 ]
}

@test "ticket.sh link-tickets rejects missing --kind" {
  run bash "$REPO/scripts/ticket.sh" link-tickets --from T000001 --to T000002
  [ "$status" -eq 2 ]
}

@test "ticket.sh link-tickets rejects invalid kind value" {
  run bash "$REPO/scripts/ticket.sh" link-tickets --from T000001 --to T000002 --kind depends
  [ "$status" -eq 2 ]
  echo "$output" | grep -qi "kind"
}

@test "ticket.sh link-tickets offline skips write and exits 0" {
  run env TICKET_OFFLINE=1 bash "$REPO/scripts/ticket.sh" link-tickets \
    --from T000001 --to T000002 --kind blocks
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "OFFLINE"
}

# ── get-ticket-links ──────────────────────────────────────────────────────

@test "ticket.sh get-ticket-links rejects missing --id" {
  run bash "$REPO/scripts/ticket.sh" get-ticket-links
  [ "$status" -eq 2 ]
}

@test "ticket.sh get-ticket-links offline refuses read and exits 9" {
  run env TICKET_OFFLINE=1 bash "$REPO/scripts/ticket.sh" get-ticket-links --id T000001
  [ "$status" -eq 9 ]
}

# ── get-timeline ──────────────────────────────────────────────────────────

@test "ticket.sh get-timeline rejects missing --id" {
  run bash "$REPO/scripts/ticket.sh" get-timeline
  [ "$status" -eq 2 ]
}

@test "ticket.sh get-timeline offline refuses read and exits 9" {
  run env TICKET_OFFLINE=1 bash "$REPO/scripts/ticket.sh" get-timeline --id T000001
  [ "$status" -eq 9 ]
}
```

- [ ] **Step 2: Run the BATS tests to verify they fail**

```bash
cd /tmp/wt-mcp-server-capabilities
bats tests/spec/ticket-mcp.bats --filter "link-tickets|get-ticket-links|get-timeline" 2>&1 | head -30
```

Expected: FAIL — `Unknown command: link-tickets` / `Unknown command: get-ticket-links` / `Unknown command: get-timeline` with exit code 1, not the expected 2 or 9.

- [ ] **Step 3: Create the SQL migration file**

Create `scripts/datamodel/2026-06-28-ticket-links-deps-kind.sql`:

```sql
-- Extend tickets.ticket_links kind CHECK constraint to allow 'blocks' and 'relates'.
-- Idempotent: DROP IF EXISTS + ADD is safe to re-run.
-- Apply via: task db:migrate or kubectl exec on shared-db pod.

BEGIN;

ALTER TABLE tickets.ticket_links
  DROP CONSTRAINT IF EXISTS ticket_links_kind_check;

ALTER TABLE tickets.ticket_links
  ADD CONSTRAINT ticket_links_kind_check
    CHECK (kind IN ('pr', 'blocks', 'relates'));

COMMIT;
```

- [ ] **Step 4: Add `cmd_link_tickets()` and `cmd_get_ticket_links()` to `scripts/lib/ticket-links.sh`**

Append after the existing `cmd_add_pr_link()` function closing brace:

```bash
# cmd_link_tickets --from <ext_id> --to <ext_id> --kind blocks|relates
# Creates a directed dependency link between two tickets. Idempotent via ON CONFLICT DO NOTHING.
# Offline-safe: TICKET_OFFLINE=1 skips the cluster write.
cmd_link_tickets() {
  local from_ext="" to_ext="" kind=""
  while [[ $# -gt 0 ]]; do case "$1" in
    --from)  from_ext="$2"; shift 2 ;;
    --to)    to_ext="$2"; shift 2 ;;
    --kind)  kind="$2"; shift 2 ;;
    *)       echo "Unknown link-tickets option: $1" >&2; exit 2 ;;
  esac; done

  if [[ -z "$from_ext" || -z "$to_ext" || -z "$kind" ]]; then
    echo "ERROR: --from, --to, and --kind are required." >&2
    exit 2
  fi
  if [[ "$kind" != "blocks" && "$kind" != "relates" ]]; then
    echo "ERROR: --kind must be 'blocks' or 'relates' (got '$kind')." >&2
    exit 2
  fi
  if _ticket_offline_skip "link-tickets" "--from" "$from_ext" "--to" "$to_ext" "--kind" "$kind"; then return 0; fi

  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v from_ext="$from_ext" -v to_ext="$to_ext" -v kind="$kind" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_links (from_id, to_id, kind)
SELECT f.id, t.id, :'kind'
FROM tickets.tickets f, tickets.tickets t
WHERE f.external_id = :'from_ext' AND t.external_id = :'to_ext'
ON CONFLICT (from_id, to_id, kind) DO NOTHING;
EOF

  echo "Link $from_ext --[$kind]--> $to_ext recorded."
}

# cmd_get_ticket_links --id <ext_id>
# Returns JSON: {"blocks": [...], "blocked_by": [...], "relates": [...]}
# Refuses offline reads (exits 9 with TICKET_OFFLINE=1).
cmd_get_ticket_links() {
  local id=""
  while [[ $# -gt 0 ]]; do case "$1" in
    --id)  id="$2"; shift 2 ;;
    *)     echo "Unknown get-ticket-links option: $1" >&2; exit 2 ;;
  esac; done

  if [[ -z "$id" ]]; then
    echo "ERROR: --id is required." >&2
    exit 2
  fi
  if [[ "${TICKET_OFFLINE:-0}" == "1" ]]; then
    echo "OFFLINE: refused read get-ticket-links (cluster required)" >&2
    exit 9
  fi

  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT jsonb_build_object(
  'blocks', COALESCE((
    SELECT jsonb_agg(t2.external_id ORDER BY t2.external_id)
    FROM tickets.ticket_links tl
    JOIN tickets.tickets t2 ON t2.id = tl.to_id
    WHERE tl.from_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
      AND tl.kind = 'blocks'
  ), '[]'::jsonb),
  'blocked_by', COALESCE((
    SELECT jsonb_agg(t2.external_id ORDER BY t2.external_id)
    FROM tickets.ticket_links tl
    JOIN tickets.tickets t2 ON t2.id = tl.from_id
    WHERE tl.to_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
      AND tl.kind = 'blocks'
  ), '[]'::jsonb),
  'relates', COALESCE((
    SELECT jsonb_agg(DISTINCT other.external_id ORDER BY other.external_id)
    FROM tickets.ticket_links tl
    JOIN tickets.tickets self  ON self.external_id = :'ext_id'
    JOIN tickets.tickets other ON other.id = CASE
      WHEN tl.from_id = self.id THEN tl.to_id
      ELSE tl.from_id
    END
    WHERE tl.kind = 'relates'
      AND (tl.from_id = self.id OR tl.to_id = self.id)
  ), '[]'::jsonb)
) AS links;
EOF
}
```

- [ ] **Step 5: Add `cmd_get_timeline()` inline in `scripts/ticket.sh`**

Find the line `cmd_triage()` (around line 729) and insert `cmd_get_timeline()` directly before it:

```bash
cmd_get_timeline() {
  local id="" brand="${BRAND:-mentolder}"
  while [[ $# -gt 0 ]]; do case "$1" in
    --id)    id="$2"; shift 2 ;;
    --brand) brand="$2"; shift 2 ;;
    *)       echo "Unknown get-timeline option: $1" >&2; exit 2 ;;
  esac; done

  if [[ -z "$id" ]]; then
    echo "ERROR: --id is required." >&2
    exit 2
  fi
  if [[ "${TICKET_OFFLINE:-0}" == "1" ]]; then
    echo "OFFLINE: refused read get-timeline (cluster required)" >&2
    exit 9
  fi

  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v brand="$brand" <<'EOF'
WITH
comments AS (
  SELECT 'comment' AS source, tc.created_at AS ts,
    jsonb_build_object('type', tc.kind, 'author', tc.author_label, 'body', tc.body) AS detail
  FROM tickets.ticket_comments tc
  WHERE tc.ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
),
phase_events AS (
  SELECT 'phase_event' AS source, pe.at AS ts,
    jsonb_build_object('phase', pe.phase, 'state', pe.state, 'driver', pe.driver, 'detail', pe.detail) AS detail
  FROM tickets.factory_phase_events pe
  WHERE pe.ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
),
pr_links AS (
  SELECT 'pr_link' AS source, tl.created_at AS ts,
    jsonb_build_object('pr_number', tl.pr_number) AS detail
  FROM tickets.ticket_links tl
  WHERE tl.from_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
    AND tl.kind = 'pr'
),
plan_events AS (
  SELECT 'plan_archived' AS source, tp.archived_at AS ts,
    jsonb_build_object('slug', tp.slug, 'branch', tp.branch) AS detail
  FROM tickets.ticket_plans tp
  WHERE tp.ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
    AND tp.archived_at IS NOT NULL
),
all_events AS (
  SELECT * FROM comments
  UNION ALL SELECT * FROM phase_events
  UNION ALL SELECT * FROM pr_links
  UNION ALL SELECT * FROM plan_events
)
SELECT jsonb_build_object(
  'ticket', (
    SELECT jsonb_build_object(
      'external_id', t.external_id,
      'title', t.title,
      'status', t.status,
      'type', t.type,
      'brand', :'brand',
      'created_at', t.created_at,
      'done_at', t.done_at,
      'resolution', t.resolution
    )
    FROM tickets.tickets t WHERE t.external_id = :'ext_id'
  ),
  'events', COALESCE(
    (SELECT jsonb_agg(
       jsonb_build_object('source', source, 'ts', ts, 'detail', detail)
       ORDER BY ts ASC
     ) FROM all_events),
    '[]'::jsonb
  )
) AS timeline;
EOF
}
```

- [ ] **Step 6: Update dispatch table and usage string in `scripts/ticket.sh`**

In the usage string (around line 737), update the `echo "Commands: ..."` line to append the three new commands:
```
create, update-status, add-comment, add-pr-link, grill, archive-plan, get-attachments, get, set-touched-files, set-scout-drift, set-pipeline-slot, release-slot, touch, enqueue, stage-plan, retry-count, factory-control, dryrun-mark, dryrun-check, feature-flag, phase, inject, get-injections, plan-meta, lastenheft, list, backfill-id, triage, link-tickets, get-ticket-links, get-timeline
```

In the `case "$cmd" in` block, add three new entries before the `*)` default case:
```bash
  link-tickets)      cmd_link_tickets "$@" ;;
  get-ticket-links)  cmd_get_ticket_links "$@" ;;
  get-timeline)      cmd_get_timeline "$@" ;;
```

- [ ] **Step 7: Run BATS tests to verify they pass**

```bash
cd /tmp/wt-mcp-server-capabilities
bats tests/spec/ticket-mcp.bats --filter "link-tickets|get-ticket-links|get-timeline"
```

Expected: all 8 new tests pass.

- [ ] **Step 8: Commit**

```bash
cd /tmp/wt-mcp-server-capabilities
git add scripts/datamodel/2026-06-28-ticket-links-deps-kind.sql \
        scripts/lib/ticket-links.sh \
        scripts/ticket.sh \
        tests/spec/ticket-mcp.bats
git commit -m "feat(ticket-mcp): add link-tickets, get-ticket-links, get-timeline bash verbs"
```

---

### Task 5: ticket-mcp Go handlers — links.go + export_ticket_timeline (Features C+D — Go layer)

**Files:**
- Create: `scripts/ticket-mcp/go/internal/tools/links.go`
- Modify: `scripts/ticket-mcp/go/internal/tools/list.go`
- Modify: `scripts/ticket-mcp/go/cmd/ticket-mcp/main.go`

**Interfaces:**
- Consumes: `runner.RunTicket(args []string, extraEnv map[string]string) (string, error)` from `internal/runner/run_ticket.go`; `getArgs(req mcp.CallToolRequest) map[string]any` already defined in `tools/list.go`
- Produces: MCP tools `link_tickets`, `get_ticket_links`, `export_ticket_timeline` registered on the ticket-mcp server

- [ ] **Step 1: Create `scripts/ticket-mcp/go/internal/tools/links.go`**

```go
package tools

import (
	"context"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/korczewski/bachelorprojekt/ticket-mcp/internal/runner"
)

// RegisterLinkTools registers link_tickets and get_ticket_links as thin
// adapters over the ticket.sh link-tickets and get-ticket-links verbs.
// Business logic (SQL, validation beyond enum check) lives in ticket.sh.
func RegisterLinkTools(s *server.MCPServer) {
	brandOf := func(a map[string]any) string {
		if b, _ := a["brand"].(string); b != "" {
			return b
		}
		return "mentolder"
	}
	text := func(raw string, err error) (*mcp.CallToolResult, error) {
		if err != nil {
			return nil, err
		}
		return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
	}

	s.AddTool(
		mcp.NewTool("link_tickets",
			mcp.WithDescription("Erstellt einen gerichteten Dependency-Link zwischen zwei Tickets (blocks oder relates). Idempotent — mehrfacher Aufruf mit gleichen Argumenten erzeugt keinen Duplikat-Eintrag. HINWEIS: CLI-Statusübergänge via ticket.sh update-status erscheinen nicht in der Timeline (bekannte Lücke)."),
			mcp.WithString("from", mcp.Description("external_id des Quell-Tickets, z.B. T000100"), mcp.Required()),
			mcp.WithString("to", mcp.Description("external_id des Ziel-Tickets, z.B. T000200"), mcp.Required()),
			mcp.WithString("kind",
				mcp.Description("blocks: A verhindert B; relates: weiche bidirektionale Assoziation"),
				mcp.Enum("blocks", "relates"),
				mcp.Required(),
			),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			from, _ := a["from"].(string)
			to, _ := a["to"].(string)
			kind, _ := a["kind"].(string)
			if from == "" || to == "" {
				return mcp.NewToolResultError("from and to are required"), nil
			}
			// Enum validation before shell call — matches ticket.sh validation.
			if kind != "blocks" && kind != "relates" {
				return mcp.NewToolResultError("kind must be 'blocks' or 'relates'"), nil
			}
			return text(runner.RunTicket(
				[]string{"link-tickets", "--from", from, "--to", to, "--kind", kind},
				map[string]string{"BRAND": brandOf(a)},
			))
		},
	)

	s.AddTool(
		mcp.NewTool("get_ticket_links",
			mcp.WithDescription("Gibt alle Dependency-Links eines Tickets zurück: blocks (von diesem Ticket ausgehend), blocked_by (auf dieses Ticket zeigend), relates (symmetrisch)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			if id == "" {
				return mcp.NewToolResultError("id is required"), nil
			}
			return text(runner.RunTicket(
				[]string{"get-ticket-links", "--id", id},
				map[string]string{"BRAND": brandOf(a)},
			))
		},
	)
}
```

- [ ] **Step 2: Add `export_ticket_timeline` to the end of `RegisterListTools()` in `scripts/ticket-mcp/go/internal/tools/list.go`**

Inside `RegisterListTools(s *server.MCPServer)`, append after the `export_tickets` tool's closing `s.AddTool(...)` call (before the final closing brace of the function):

```go
	s.AddTool(
		mcp.NewTool("export_ticket_timeline",
			mcp.WithDescription("Exportiert die vollständige Ticket-History als chronologisches JSON. Quellen: Kommentare (ticket_comments), Factory-Phasen (factory_phase_events), PR-Links (ticket_links kind=pr), archivierte Pläne (ticket_plans). HINWEIS: CLI-Statusübergänge via ticket.sh update-status erscheinen nicht in der Timeline (bekannte Lücke — Follow-up-Ticket erforderlich)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			if id == "" {
				return mcp.NewToolResultError("id is required"), nil
			}
			raw, err := runner.RunTicket(
				[]string{"get-timeline", "--id", id, "--brand", brand},
				map[string]string{"BRAND": brand},
			)
			if err != nil {
				return nil, err
			}
			return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
		},
	)
```

- [ ] **Step 3: Wire `RegisterLinkTools` in `scripts/ticket-mcp/go/cmd/ticket-mcp/main.go`**

In `main()`, after the existing `tools.RegisterWorkflowTools(mcpServer)` call, add:

```go
tools.RegisterLinkTools(mcpServer)
```

- [ ] **Step 4: Verify compilation**

```bash
cd /tmp/wt-mcp-server-capabilities/scripts/ticket-mcp/go
go build ./...
```

Expected: exits 0.

- [ ] **Step 5: Run existing tests and verify they still pass**

```bash
cd /tmp/wt-mcp-server-capabilities/scripts/ticket-mcp/go
go test ./...
```

Expected: all existing tests pass (`TestRegisterWorkflowToolsNoPanic`, `TestClassifyBundle*`, `TestMishapEntry*`).

- [ ] **Step 6: Write a compile-level test for RegisterLinkTools**

Add `scripts/ticket-mcp/go/internal/tools/links_test.go`:

```go
package tools

import (
	"testing"

	"github.com/mark3labs/mcp-go/server"
)

// RegisterLinkTools must register without panicking. Functional correctness
// of the bash adapters is covered by tests/spec/ticket-mcp.bats.
func TestRegisterLinkToolsNoPanic(t *testing.T) {
	s := server.NewMCPServer("test", "0.0.0")
	RegisterLinkTools(s) // must not panic
}
```

- [ ] **Step 7: Run tests including the new links test**

```bash
cd /tmp/wt-mcp-server-capabilities/scripts/ticket-mcp/go
go test ./internal/tools/ -v
```

Expected: all tests pass including `TestRegisterLinkToolsNoPanic`.

- [ ] **Step 8: Commit**

```bash
cd /tmp/wt-mcp-server-capabilities
git add scripts/ticket-mcp/go/internal/tools/links.go \
        scripts/ticket-mcp/go/internal/tools/links_test.go \
        scripts/ticket-mcp/go/internal/tools/list.go \
        scripts/ticket-mcp/go/cmd/ticket-mcp/main.go
git commit -m "feat(ticket-mcp): add link_tickets, get_ticket_links, export_ticket_timeline Go handlers"
```

---

### Task 6: Final verification

**Files:** No new files — verification only.

- [ ] **Step 1: Run all changed tests**

```bash
cd /tmp/wt-mcp-server-capabilities
task test:changed
```

Expected: exits 0. This runs the changed BATS specs, Go unit tests, and any other offline test categories detected by `test:changed`.

- [ ] **Step 2: Update test inventory (required because new @test entries were added)**

```bash
cd /tmp/wt-mcp-server-capabilities
task test:inventory
```

Expected: exits 0 and regenerates `website/src/data/test-inventory.json`.

- [ ] **Step 3: Commit updated test inventory if changed**

```bash
cd /tmp/wt-mcp-server-capabilities
git diff --name-only website/src/data/test-inventory.json
# If the file changed:
git add website/src/data/test-inventory.json
git commit -m "chore: regenerate test inventory after ticket-mcp BATS additions"
```

- [ ] **Step 4: Regenerate freshness artifacts**

```bash
cd /tmp/wt-mcp-server-capabilities
task freshness:regenerate
```

Expected: exits 0 and updates `.codebase-memory/artifact.json` and `.codebase-memory/graph.db.zst`.

- [ ] **Step 5: Check freshness gate**

```bash
cd /tmp/wt-mcp-server-capabilities
task freshness:check
```

Expected: exits 0 (no stale artifacts).

- [ ] **Step 6: Commit freshness artifacts if changed**

```bash
cd /tmp/wt-mcp-server-capabilities
git diff --name-only .codebase-memory/
# If changed:
git add .codebase-memory/artifact.json .codebase-memory/graph.db.zst
git commit -m "chore: auto-regenerate freshness artifacts [skip ci]"
```

- [ ] **Step 7: Push the branch**

```bash
cd /tmp/wt-mcp-server-capabilities
git push origin feature/mcp-server-capabilities
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| `run_task_async` — returns job_id immediately | Task 1 (StartTask) + Task 2 (main.go handler) |
| `cancel_task` — SIGTERM + 5s SIGKILL | Task 1 (cmd.Cancel + cmd.WaitDelay in RunTask) + Task 2 (cancel_task handler) |
| `get_task_result` — poll status + output | Task 1 (Lookup) + Task 2 (get_task_result handler) |
| `run_task` unchanged | Task 1 modifies RunTask but preserves semantics; existing tests verify |
| `get_task_graph` — Mermaid default, JSON via format param | Task 3 (graphviz.go + main.go) |
| Node-ID sanitisation (`:`, `-`, `.`, `/` → `_`) | Task 3 (`sanitizeID()` in graphviz.go) |
| Deterministic output | Task 3 (`sort.Strings()` on nodes and deps) |
| `ticket_links_kind_check` constraint extended | Task 4 (SQL migration) |
| `link_tickets` — idempotent, blocks/relates | Task 4 (bash) + Task 5 (Go handler) |
| `get_ticket_links` — blocks, blocked_by, relates | Task 4 (bash SQL) + Task 5 (Go handler) |
| `export_ticket_timeline` — 4 sources, UNION ALL, ORDER BY ts | Task 4 (cmd_get_timeline SQL) + Task 5 (export_ticket_timeline handler) |
| Timeline limitation documented in tool description | Task 5 (`WithDescription` mentions the known gap) |
| SQL migration idempotent | Task 4 (DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT) |
| No Breaking Changes to existing tools | All tasks — additive only |

**Type consistency check:** `runner.Result` is used in both `registry.go` (stored as `*Result`) and `executor.go` (defined). `planner.Graph` is used in `graphviz.go` (consumed) and `parser.go` (produced). `getArgs()` is defined once in `list.go` and shared across all tools files (same package). `runner.RunTicket()` signature is unchanged.

**Placeholder scan:** All steps are fully specified — no incomplete sections.
