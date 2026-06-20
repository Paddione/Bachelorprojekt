# MCP Task Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Go MCP server that plans and executes go-task tasks in parallel across brands, with OpenTelemetry traces and logs sent to the existing Loki/Grafana stack.

**Architecture:** Local WSL binary (stdio transport) registered in `.mcp.json`. Runs on the WSL host — the only place with access to the Taskfile, local kubeconfig, Docker, and Kustomize overlays. OTel spans + logs are sent to the cluster's OTel Collector via a new portforward on `localhost:4317`. In-cluster execution was rejected because tasks reference host-local files.

**Tech Stack:** Go 1.23, `github.com/mark3labs/mcp-go v0.55.0`, OTel Go SDK v1.33, `task` binary already at `/usr/local/bin/task`.

## Global Constraints

- Go 1.23 required — install via `snap install go --classic` if `go version` fails
- Module path: `github.com/paddione/mcp-task-runner`
- All source files in `mcp-task-runner/` at repo root
- stdio MCP transport — no HTTP server port
- OTel endpoint: `localhost:4317` (portforward to `monitoring/otel-collector`)
- OTel failures are **fail-open** — task execution never aborts on telemetry errors
- Taskfile resolved from caller's working directory (`Taskfile.yml` in repo root)
- `task` binary: `/usr/local/bin/task` (already installed)
- Tests mock `task` via PATH prepend — no cluster required
- Commit after every task

---

## File Map

| File | Responsibility |
|---|---|
| `mcp-task-runner/main.go` | MCP server bootstrap, tool registration, stdio serve |
| `mcp-task-runner/planner/parser.go` | `task --list-all --json` → dependency Graph |
| `mcp-task-runner/planner/parser_test.go` | Parser unit tests with fake task binary |
| `mcp-task-runner/planner/scheduler.go` | Kahn's algorithm → parallel Groups |
| `mcp-task-runner/planner/scheduler_test.go` | Scheduler unit tests |
| `mcp-task-runner/runner/executor.go` | `exec.Command` + `sync.WaitGroup` parallel execution |
| `mcp-task-runner/runner/executor_test.go` | Executor tests (parallel + fail-fast) |
| `mcp-task-runner/runner/streamer.go` | `io.Reader` → OTel LogRecords line-by-line |
| `mcp-task-runner/telemetry/otel.go` | OTel SDK init, `NewSpan`, `EmitLog` |
| `mcp-task-runner/go.mod` | Module definition |
| `mcp-task-runner/Makefile` | `make build`, `make test`, `make install` |
| `scripts/mcp-portforward.sh` | Add OTel portforward (port 4317) |
| `.mcp.json` | Add `mcp-task-runner` stdio entry |
| `.claude/skills/references/mcp-tool-guide.md` | New row for mcp-task-runner |
| `tests/spec/mcp-task-runner.bats` | BATS integration tests |

---

### Task 1: Prerequisites + Go module scaffold

**Files:**
- Create: `mcp-task-runner/go.mod`
- Create: `mcp-task-runner/Makefile`

**Interfaces:**
- Produces: module `github.com/paddione/mcp-task-runner` importable by all subsequent tasks

- [ ] **Step 1: Check Go installation**

```bash
go version
```

Expected: `go version go1.23.x linux/amd64`. If missing:

```bash
snap install go --classic
# or: wget -qO- https://go.dev/dl/go1.23.10.linux-amd64.tar.gz | sudo tar -C /usr/local -xz
# then add to ~/.bashrc: export PATH=$PATH:/usr/local/go/bin
source ~/.bashrc
go version
```

- [ ] **Step 2: Create module directory**

```bash
mkdir -p mcp-task-runner
```

- [ ] **Step 3: Write go.mod**

```
module github.com/paddione/mcp-task-runner

go 1.23

require (
	github.com/mark3labs/mcp-go v0.55.0
	go.opentelemetry.io/otel v1.33.0
	go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc v0.9.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc v1.33.0
	go.opentelemetry.io/otel/log v0.9.0
	go.opentelemetry.io/otel/sdk v1.33.0
	go.opentelemetry.io/otel/sdk/log v0.9.0
	go.opentelemetry.io/otel/trace v1.33.0
	google.golang.org/grpc v1.69.2
)
```

- [ ] **Step 4: Write Makefile**

```makefile
BIN := mcp-task-runner
BUILD_DIR := bin

.PHONY: build test install clean

build:
	go build -o $(BUILD_DIR)/$(BIN) .

test:
	go test ./... -v

install: build
	cp $(BUILD_DIR)/$(BIN) /usr/local/bin/$(BIN)

clean:
	rm -rf $(BUILD_DIR)
```

- [ ] **Step 5: Fetch dependencies**

```bash
cd mcp-task-runner && go mod tidy
```

Expected: `go.sum` generated, no errors.

- [ ] **Step 6: Commit**

```bash
git add mcp-task-runner/go.mod mcp-task-runner/go.sum mcp-task-runner/Makefile
git commit -m "feat(mcp-task-runner): go module scaffold"
```

---

### Task 2: OTel telemetry package

**Files:**
- Create: `mcp-task-runner/telemetry/otel.go`

**Interfaces:**
- Produces:
  - `telemetry.Init(ctx context.Context, endpoint string) (shutdown func(), err error)`
  - `telemetry.NewSpan(ctx context.Context, name string) (context.Context, trace.Span)`
  - `telemetry.EmitLog(ctx context.Context, body string, attrs ...attribute.KeyValue)`
- Consumed by: `runner/executor.go`, `runner/streamer.go`, `main.go`

- [ ] **Step 1: Write telemetry/otel.go**

```go
package telemetry

import (
	"context"
	"fmt"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	otellog "go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/log/global"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var tracer trace.Tracer
var logger otellog.Logger

// Init connects to the OTel Collector and initialises trace + log providers.
// Returns a shutdown function. On connection failure it returns fail-open (nil error, no-op shutdown).
func Init(ctx context.Context, endpoint string) (func(), error) {
	conn, err := grpc.NewClient(endpoint,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "otel: cannot connect to %s: %v (continuing without telemetry)\n", endpoint, err)
		return func() {}, nil
	}

	traceExp, err := otlptracegrpc.New(ctx, otlptracegrpc.WithGRPCConn(conn))
	if err != nil {
		fmt.Fprintf(os.Stderr, "otel: trace exporter: %v\n", err)
		return func() {}, nil
	}
	tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(traceExp))
	otel.SetTracerProvider(tp)
	tracer = tp.Tracer("mcp-task-runner")

	logExp, err := otlploggrpc.New(ctx, otlploggrpc.WithGRPCConn(conn))
	if err != nil {
		fmt.Fprintf(os.Stderr, "otel: log exporter: %v (logs go to stderr only)\n", err)
	} else {
		lp := sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewBatchProcessor(logExp)))
		global.SetLoggerProvider(lp)
		logger = lp.Logger("mcp-task-runner")
	}

	return func() { tp.Shutdown(ctx) }, nil //nolint:errcheck
}

// NewSpan creates a child span. Falls back to a no-op span if OTel is not initialised.
func NewSpan(ctx context.Context, name string) (context.Context, trace.Span) {
	if tracer == nil {
		return ctx, trace.SpanFromContext(ctx)
	}
	return tracer.Start(ctx, name)
}

// EmitLog emits a structured log record. Falls back to stderr when logger is nil.
func EmitLog(ctx context.Context, body string, attrs ...attribute.KeyValue) {
	if logger == nil {
		fmt.Fprintln(os.Stderr, body)
		return
	}
	var r otellog.Record
	r.SetBody(otellog.StringValue(body))
	kvs := make([]otellog.KeyValue, len(attrs))
	for i, a := range attrs {
		kvs[i] = otellog.String(string(a.Key), a.Value.Emit())
	}
	r.AddAttributes(kvs...)
	logger.Emit(ctx, r)
}
```

- [ ] **Step 2: Build to confirm it compiles**

```bash
cd mcp-task-runner && go build ./telemetry/...
```

Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add mcp-task-runner/telemetry/
git commit -m "feat(mcp-task-runner): OTel telemetry package (fail-open)"
```

---

### Task 3: Planner — parser + tests

**Files:**
- Create: `mcp-task-runner/planner/parser.go`
- Create: `mcp-task-runner/planner/parser_test.go`

**Interfaces:**
- Produces:
  - `type Graph map[string][]string` — task name → direct dep names
  - `var ErrCyclicDependency error`
  - `planner.Parse(taskfilePath string) (Graph, error)`
- Consumed by: `planner/scheduler.go`, `main.go`

- [ ] **Step 1: Write the failing tests first**

```go
// mcp-task-runner/planner/parser_test.go
package planner_test

import (
	"os"
	"testing"

	"github.com/paddione/mcp-task-runner/planner"
)

// writeFakeTask writes a shell script that prints the given JSON and puts it on PATH.
func writeFakeTask(t *testing.T, jsonOutput string) {
	t.Helper()
	dir := t.TempDir()
	script := "#!/bin/sh\necho '" + jsonOutput + "'"
	if err := os.WriteFile(dir+"/task", []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
}

func TestParseNoDeps(t *testing.T) {
	writeFakeTask(t, `{"tasks":[{"name":"deploy","deps":[]},{"name":"validate","deps":[]}]}`)
	g, err := planner.Parse("Taskfile.yml")
	if err != nil {
		t.Fatal(err)
	}
	if len(g) != 2 {
		t.Fatalf("want 2 tasks, got %d", len(g))
	}
	if len(g["deploy"]) != 0 {
		t.Errorf("deploy should have no deps, got %v", g["deploy"])
	}
}

func TestParseWithDeps(t *testing.T) {
	writeFakeTask(t, `{"tasks":[{"name":"deploy","deps":[]},{"name":"post-setup","deps":["deploy"]}]}`)
	g, err := planner.Parse("Taskfile.yml")
	if err != nil {
		t.Fatal(err)
	}
	deps := g["post-setup"]
	if len(deps) != 1 || deps[0] != "deploy" {
		t.Errorf("post-setup should depend on deploy, got %v", deps)
	}
}

func TestParseTaskCommandFails(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(dir+"/task", []byte("#!/bin/sh\nexit 1"), 0755)
	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
	_, err := planner.Parse("Taskfile.yml")
	if err == nil {
		t.Fatal("expected error when task exits non-zero")
	}
}

func TestParseInvalidJSON(t *testing.T) {
	writeFakeTask(t, `not-json`)
	_, err := planner.Parse("Taskfile.yml")
	if err == nil {
		t.Fatal("expected error on invalid JSON")
	}
}
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd mcp-task-runner && go test ./planner/... -v 2>&1 | head -20
```

Expected: compile error (planner package not yet defined).

- [ ] **Step 3: Write parser.go**

```go
// mcp-task-runner/planner/parser.go
package planner

import (
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
)

// ErrCyclicDependency is returned by Schedule when the requested tasks form a cycle.
var ErrCyclicDependency = errors.New("cyclic dependency detected")

// Graph maps each task name to its direct dependency names.
type Graph map[string][]string

type taskEntry struct {
	Name string   `json:"name"`
	Deps []string `json:"deps"`
}

type taskListOutput struct {
	Tasks []taskEntry `json:"tasks"`
}

// Parse runs `task --taskfile <path> --list-all --json` and returns the dependency graph.
func Parse(taskfilePath string) (Graph, error) {
	out, err := exec.Command("task", "--taskfile", taskfilePath, "--list-all", "--json").Output()
	if err != nil {
		return nil, fmt.Errorf("task --list-all --json: %w", err)
	}
	var tl taskListOutput
	if err := json.Unmarshal(out, &tl); err != nil {
		return nil, fmt.Errorf("parse task output: %w", err)
	}
	g := make(Graph, len(tl.Tasks))
	for _, t := range tl.Tasks {
		deps := t.Deps
		if deps == nil {
			deps = []string{}
		}
		g[t.Name] = deps
	}
	return g, nil
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd mcp-task-runner && go test ./planner/... -run TestParse -v
```

Expected:
```
--- PASS: TestParseNoDeps
--- PASS: TestParseWithDeps
--- PASS: TestParseTaskCommandFails
--- PASS: TestParseInvalidJSON
PASS
```

- [ ] **Step 5: Commit**

```bash
git add mcp-task-runner/planner/parser.go mcp-task-runner/planner/parser_test.go
git commit -m "feat(mcp-task-runner): taskfile parser with dep graph"
```

---

### Task 4: Planner — scheduler + tests

**Files:**
- Create: `mcp-task-runner/planner/scheduler.go`
- Create: `mcp-task-runner/planner/scheduler_test.go`

**Interfaces:**
- Produces:
  - `type TaskRequest struct { Task string; Env string }`
  - `type Group struct { Tasks []TaskRequest }`
  - `type Plan struct { Groups []Group }`
  - `planner.Schedule(graph Graph, tasks []TaskRequest) (Plan, error)` — returns `ErrCyclicDependency` on cycle
- Consumed by: `runner/executor.go`, `main.go`

- [ ] **Step 1: Write the failing tests**

```go
// mcp-task-runner/planner/scheduler_test.go
package planner_test

import (
	"errors"
	"testing"

	"github.com/paddione/mcp-task-runner/planner"
)

func TestScheduleAllParallel(t *testing.T) {
	g := planner.Graph{"deploy": {}, "validate": {}}
	tasks := []planner.TaskRequest{
		{Task: "deploy", Env: "mentolder"},
		{Task: "validate", Env: "mentolder"},
	}
	plan, err := planner.Schedule(g, tasks)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Groups) != 1 {
		t.Fatalf("want 1 group (all parallel), got %d", len(plan.Groups))
	}
	if len(plan.Groups[0].Tasks) != 2 {
		t.Errorf("want 2 tasks in group, got %d", len(plan.Groups[0].Tasks))
	}
}

func TestScheduleLinearChain(t *testing.T) {
	g := planner.Graph{"deploy": {}, "post-setup": {"deploy"}}
	tasks := []planner.TaskRequest{
		{Task: "deploy", Env: "mentolder"},
		{Task: "post-setup", Env: "mentolder"},
	}
	plan, err := planner.Schedule(g, tasks)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Groups) != 2 {
		t.Fatalf("want 2 groups (serial), got %d", len(plan.Groups))
	}
	if plan.Groups[0].Tasks[0].Task != "deploy" {
		t.Errorf("want deploy first, got %s", plan.Groups[0].Tasks[0].Task)
	}
	if plan.Groups[1].Tasks[0].Task != "post-setup" {
		t.Errorf("want post-setup second, got %s", plan.Groups[1].Tasks[0].Task)
	}
}

func TestScheduleCrossBrand(t *testing.T) {
	g := planner.Graph{"workspace:deploy": {}}
	tasks := []planner.TaskRequest{
		{Task: "workspace:deploy", Env: "mentolder"},
		{Task: "workspace:deploy", Env: "korczewski"},
	}
	plan, err := planner.Schedule(g, tasks)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Groups) != 1 {
		t.Fatalf("cross-brand tasks with no deps should be one parallel group, got %d", len(plan.Groups))
	}
	if len(plan.Groups[0].Tasks) != 2 {
		t.Errorf("want both brands in same group, got %d", len(plan.Groups[0].Tasks))
	}
}

func TestScheduleCycleDetected(t *testing.T) {
	g := planner.Graph{"a": {"b"}, "b": {"a"}}
	tasks := []planner.TaskRequest{
		{Task: "a", Env: "mentolder"},
		{Task: "b", Env: "mentolder"},
	}
	_, err := planner.Schedule(g, tasks)
	if !errors.Is(err, planner.ErrCyclicDependency) {
		t.Errorf("want ErrCyclicDependency, got %v", err)
	}
}

func TestScheduleUnknownDepIgnored(t *testing.T) {
	// A dep that's not in the requested tasks list is ignored (not scheduled).
	g := planner.Graph{"post-setup": {"deploy"}}
	tasks := []planner.TaskRequest{{Task: "post-setup", Env: "mentolder"}}
	plan, err := planner.Schedule(g, tasks)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Groups) != 1 || len(plan.Groups[0].Tasks) != 1 {
		t.Errorf("want 1 group with 1 task, got %v", plan)
	}
}
```

- [ ] **Step 2: Run — confirm compile fails**

```bash
cd mcp-task-runner && go test ./planner/... -v 2>&1 | head -10
```

Expected: undefined `TaskRequest`, `Group`, `Plan`, `Schedule`.

- [ ] **Step 3: Write scheduler.go**

```go
// mcp-task-runner/planner/scheduler.go
package planner

import "fmt"

// TaskRequest is a single {task, env} pair to execute.
type TaskRequest struct {
	Task string `json:"task"`
	Env  string `json:"env"`
}

// Group is a set of tasks that can execute in parallel.
type Group struct {
	Tasks []TaskRequest `json:"tasks"`
}

// Plan is the ordered list of Groups; each group runs after the previous one completes.
type Plan struct {
	Groups []Group `json:"groups"`
}

// Schedule applies Kahn's topological sort to the requested tasks and returns a Plan.
// Tasks on the same level (no ordering dependency between them) form one parallel Group.
// Tasks from different brands on the same level are placed in the same Group.
// Returns ErrCyclicDependency if the requested tasks contain a cycle.
func Schedule(graph Graph, tasks []TaskRequest) (Plan, error) {
	// Index requested tasks by name (first occurrence wins for dep-resolution).
	nameToIdx := make(map[string][]int, len(tasks))
	for i, t := range tasks {
		nameToIdx[t.Task] = append(nameToIdx[t.Task], i)
	}

	// Build per-index in-degree and adjacency list considering only requested tasks.
	n := len(tasks)
	inDegree := make([]int, n)
	adj := make([][]int, n) // adj[i] → indices that must run after tasks[i]

	for i, t := range tasks {
		for _, dep := range graph[t.Task] {
			for _, j := range nameToIdx[dep] {
				if j == i {
					continue
				}
				inDegree[i]++
				adj[j] = append(adj[j], i)
			}
		}
	}

	// Kahn's BFS — each wave of zero-in-degree nodes forms one parallel Group.
	queue := make([]int, 0, n)
	for i, d := range inDegree {
		if d == 0 {
			queue = append(queue, i)
		}
	}

	var plan Plan
	processed := 0
	for len(queue) > 0 {
		group := Group{Tasks: make([]TaskRequest, len(queue))}
		for k, i := range queue {
			group.Tasks[k] = tasks[i]
		}
		plan.Groups = append(plan.Groups, group)
		processed += len(queue)

		next := make([]int, 0, len(queue))
		for _, i := range queue {
			for _, j := range adj[i] {
				inDegree[j]--
				if inDegree[j] == 0 {
					next = append(next, j)
				}
			}
		}
		queue = next
	}

	if processed != n {
		return Plan{}, fmt.Errorf("%w", ErrCyclicDependency)
	}
	return plan, nil
}
```

- [ ] **Step 4: Run all planner tests**

```bash
cd mcp-task-runner && go test ./planner/... -v
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-task-runner/planner/scheduler.go mcp-task-runner/planner/scheduler_test.go
git commit -m "feat(mcp-task-runner): Kahn scheduler with brand-aware parallel grouping"
```

---

### Task 5: Runner — executor + streamer + tests

**Files:**
- Create: `mcp-task-runner/runner/streamer.go`
- Create: `mcp-task-runner/runner/executor.go`
- Create: `mcp-task-runner/runner/executor_test.go`

**Interfaces:**
- Produces:
  - `type Result struct { Task, Env string; ExitCode int; Stdout, Stderr, TraceID string }`
  - `runner.RunTask(ctx context.Context, task, env, taskfilePath string) (Result, error)`
  - `runner.ExecutePlan(ctx context.Context, plan planner.Plan, taskfilePath string) ([]Result, error)`
- Consumed by: `main.go`

- [ ] **Step 1: Write the failing tests**

```go
// mcp-task-runner/runner/executor_test.go
package runner_test

import (
	"context"
	"os"
	"testing"

	"github.com/paddione/mcp-task-runner/planner"
	"github.com/paddione/mcp-task-runner/runner"
)

func fakeTask(t *testing.T, script string) {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(dir+"/task", []byte("#!/bin/sh\n"+script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
}

func TestRunTaskSuccess(t *testing.T) {
	fakeTask(t, `echo "hello"
exit 0`)
	r, err := runner.RunTask(context.Background(), "deploy", "mentolder", "Taskfile.yml")
	if err != nil {
		t.Fatal(err)
	}
	if r.ExitCode != 0 {
		t.Errorf("want exit 0, got %d", r.ExitCode)
	}
	if r.Task != "deploy" || r.Env != "mentolder" {
		t.Errorf("wrong task/env in result: %+v", r)
	}
}

func TestRunTaskNonZeroExit(t *testing.T) {
	fakeTask(t, `exit 42`)
	r, _ := runner.RunTask(context.Background(), "deploy", "mentolder", "Taskfile.yml")
	if r.ExitCode != 42 {
		t.Errorf("want exit 42, got %d", r.ExitCode)
	}
}

func TestExecutePlanParallel(t *testing.T) {
	// Both tasks must complete; timing verification via result count.
	fakeTask(t, `sleep 0.05
exit 0`)
	plan := planner.Plan{Groups: []planner.Group{{Tasks: []planner.TaskRequest{
		{Task: "deploy", Env: "mentolder"},
		{Task: "deploy", Env: "korczewski"},
	}}}}
	results, err := runner.ExecutePlan(context.Background(), plan, "Taskfile.yml")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 {
		t.Errorf("want 2 results, got %d", len(results))
	}
}

func TestExecutePlanFailFast(t *testing.T) {
	fakeTask(t, `exit 1`)
	plan := planner.Plan{Groups: []planner.Group{
		{Tasks: []planner.TaskRequest{{Task: "deploy", Env: "mentolder"}}},
		{Tasks: []planner.TaskRequest{{Task: "post-setup", Env: "mentolder"}}},
	}}
	results, err := runner.ExecutePlan(context.Background(), plan, "Taskfile.yml")
	if err == nil {
		t.Fatal("want error on task failure")
	}
	// Only group 1 should have produced a result; group 2 was cancelled.
	if len(results) != 1 {
		t.Errorf("want 1 result (fail-fast stopped group 2), got %d", len(results))
	}
}
```

- [ ] **Step 2: Run — confirm compile error**

```bash
cd mcp-task-runner && go test ./runner/... 2>&1 | head -10
```

Expected: undefined `runner.RunTask`, `runner.ExecutePlan`, `runner.Result`.

- [ ] **Step 3: Write streamer.go**

```go
// mcp-task-runner/runner/streamer.go
package runner

import (
	"bufio"
	"context"
	"io"
	"strings"

	"go.opentelemetry.io/otel/attribute"
	"github.com/paddione/mcp-task-runner/telemetry"
)

// streamLines reads lines from r, emits each as an OTel log record, and returns full output.
func streamLines(ctx context.Context, r io.Reader, stream string, base []attribute.KeyValue) string {
	attrs := make([]attribute.KeyValue, len(base)+1)
	copy(attrs, base)
	attrs[len(base)] = attribute.String("stream", stream)
	var sb strings.Builder
	sc := bufio.NewScanner(r)
	for sc.Scan() {
		line := sc.Text()
		sb.WriteString(line + "\n")
		telemetry.EmitLog(ctx, line, attrs...)
	}
	return sb.String()
}
```

- [ ] **Step 4: Write executor.go**

```go
// mcp-task-runner/runner/executor.go
package runner

import (
	"context"
	"fmt"
	"os/exec"
	"sync"

	"go.opentelemetry.io/otel/attribute"
	"github.com/paddione/mcp-task-runner/planner"
	"github.com/paddione/mcp-task-runner/telemetry"
)

// Result holds the outcome of a single task run.
type Result struct {
	Task     string `json:"task"`
	Env      string `json:"env"`
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	TraceID  string `json:"trace_id"`
}

// RunTask executes `task <name> ENV=<env>` and returns a Result with OTel instrumentation.
func RunTask(ctx context.Context, task, env, taskfilePath string) (Result, error) {
	ctx, span := telemetry.NewSpan(ctx, "run_task")
	defer span.End()

	attrs := []attribute.KeyValue{
		attribute.String("task.name", task),
		attribute.String("task.env", env),
		attribute.String("task.brand", env),
	}
	span.SetAttributes(attrs...)

	cmd := exec.CommandContext(ctx, "task", "--taskfile", taskfilePath, task, "ENV="+env)
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return Result{Task: task, Env: env, ExitCode: 1}, fmt.Errorf("stdout pipe: %w", err)
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return Result{Task: task, Env: env, ExitCode: 1}, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return Result{Task: task, Env: env, ExitCode: 1}, fmt.Errorf("start: %w", err)
	}

	var stdoutBuf, stderrBuf string
	var streamWg sync.WaitGroup
	streamWg.Add(2)
	go func() { defer streamWg.Done(); stdoutBuf = streamLines(ctx, stdoutPipe, "stdout", attrs) }()
	go func() { defer streamWg.Done(); stderrBuf = streamLines(ctx, stderrPipe, "stderr", attrs) }()
	streamWg.Wait()

	exitCode := 0
	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}

	span.SetAttributes(attribute.Int("task.exit_code", exitCode))
	return Result{
		Task:     task,
		Env:      env,
		ExitCode: exitCode,
		Stdout:   stdoutBuf,
		Stderr:   stderrBuf,
		TraceID:  span.SpanContext().TraceID().String(),
	}, nil
}

// ExecutePlan runs plan groups in order. Within each group all tasks run in parallel.
// On any non-zero exit in a group, subsequent groups are cancelled (fail-fast).
func ExecutePlan(ctx context.Context, plan planner.Plan, taskfilePath string) ([]Result, error) {
	ctx, span := telemetry.NewSpan(ctx, "execute_plan")
	defer span.End()

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var allResults []Result

	for _, group := range plan.Groups {
		results := make([]Result, len(group.Tasks))
		var wg sync.WaitGroup

		for i, t := range group.Tasks {
			wg.Add(1)
			go func(i int, t planner.TaskRequest) {
				defer wg.Done()
				r, _ := RunTask(ctx, t.Task, t.Env, taskfilePath)
				results[i] = r
			}(i, t)
		}
		wg.Wait()

		allResults = append(allResults, results...)

		for _, r := range results {
			if r.ExitCode != 0 {
				cancel()
				return allResults, fmt.Errorf("task %s (env=%s) exited %d", r.Task, r.Env, r.ExitCode)
			}
		}
	}
	return allResults, nil
}
```

- [ ] **Step 5: Run all runner tests**

```bash
cd mcp-task-runner && go test ./runner/... -v
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp-task-runner/runner/
git commit -m "feat(mcp-task-runner): parallel executor with OTel + fail-fast"
```

---

### Task 6: MCP server (main.go)

**Files:**
- Create: `mcp-task-runner/main.go`

**Interfaces:**
- Consumes: `planner.Parse`, `planner.Schedule`, `planner.Plan`, `runner.RunTask`, `runner.ExecutePlan`, `telemetry.Init`
- Produces: stdio MCP server exposing `plan_tasks`, `run_task`, `execute_plan`

- [ ] **Step 1: Write main.go**

```go
// mcp-task-runner/main.go
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/paddione/mcp-task-runner/planner"
	"github.com/paddione/mcp-task-runner/runner"
	"github.com/paddione/mcp-task-runner/telemetry"
)

func main() {
	otelEndpoint := flag.String("otel-endpoint", "localhost:4317", "OTel Collector gRPC endpoint")
	taskfilePath := flag.String("taskfile", "Taskfile.yml", "Path to Taskfile.yml")
	flag.Parse()

	ctx := context.Background()
	shutdown, err := telemetry.Init(ctx, *otelEndpoint)
	if err != nil {
		fmt.Fprintf(os.Stderr, "otel: %v\n", err)
	}
	defer shutdown()

	s := server.NewMCPServer(
		"mcp-task-runner",
		"1.0.0",
		server.WithToolCapabilities(true),
	)

	// ── plan_tasks ────────────────────────────────────────────────────────────
	planTasksTool := mcp.NewTool("plan_tasks",
		mcp.WithDescription("Parse Taskfile deps and return a parallel execution plan"),
		mcp.WithArray("tasks",
			mcp.Required(),
			mcp.WithDescription("Array of {task: string, env: string} objects"),
		),
	)
	s.AddTool(planTasksTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		type input struct {
			Task string `json:"task"`
			Env  string `json:"env"`
		}
		raw, _ := json.Marshal(req.Params.Arguments["tasks"])
		var inputs []input
		if err := json.Unmarshal(raw, &inputs); err != nil {
			return mcp.NewToolResultError("invalid tasks: " + err.Error()), nil
		}

		graph, err := planner.Parse(*taskfilePath)
		if err != nil {
			return mcp.NewToolResultError("parse taskfile: " + err.Error()), nil
		}

		reqs := make([]planner.TaskRequest, len(inputs))
		for i, in := range inputs {
			reqs[i] = planner.TaskRequest{Task: in.Task, Env: in.Env}
		}
		plan, err := planner.Schedule(graph, reqs)
		if err != nil {
			return mcp.NewToolResultError("schedule: " + err.Error()), nil
		}

		b, _ := json.Marshal(plan)
		return mcp.NewToolResultText(string(b)), nil
	})

	// ── run_task ──────────────────────────────────────────────────────────────
	runTaskTool := mcp.NewTool("run_task",
		mcp.WithDescription("Execute a single go-task task with OTel tracing"),
		mcp.WithString("task", mcp.Required(), mcp.WithDescription("Task name, e.g. workspace:deploy")),
		mcp.WithString("env", mcp.Required(), mcp.WithDescription("ENV value, e.g. mentolder")),
	)
	s.AddTool(runTaskTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		task, _ := req.Params.Arguments["task"].(string)
		env, _ := req.Params.Arguments["env"].(string)
		if task == "" || env == "" {
			return mcp.NewToolResultError("task and env are required"), nil
		}
		result, err := runner.RunTask(ctx, task, env, *taskfilePath)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		b, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(b)), nil
	})

	// ── execute_plan ──────────────────────────────────────────────────────────
	executePlanTool := mcp.NewTool("execute_plan",
		mcp.WithDescription("Execute a plan returned by plan_tasks; groups run in parallel, fail-fast on error"),
		mcp.WithObject("plan", mcp.Required(), mcp.WithDescription("Plan object from plan_tasks")),
	)
	s.AddTool(executePlanTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, _ := json.Marshal(req.Params.Arguments["plan"])
		var plan planner.Plan
		if err := json.Unmarshal(raw, &plan); err != nil {
			return mcp.NewToolResultError("invalid plan: " + err.Error()), nil
		}
		results, execErr := runner.ExecutePlan(ctx, plan, *taskfilePath)
		b, _ := json.Marshal(results)
		if execErr != nil {
			return mcp.NewToolResultText(string(b) + "\n[error] " + execErr.Error()), nil
		}
		return mcp.NewToolResultText(string(b)), nil
	})

	if err := server.ServeStdio(s); err != nil {
		log.Fatalf("mcp-task-runner: %v", err)
	}
}
```

- [ ] **Step 2: Build the binary**

```bash
cd mcp-task-runner && go build -o bin/mcp-task-runner .
```

Expected: `bin/mcp-task-runner` created, exit 0.

- [ ] **Step 3: Smoke test — list tools**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | ./bin/mcp-task-runner 2>/dev/null
```

Expected: JSON response listing `plan_tasks`, `run_task`, `execute_plan`.

- [ ] **Step 4: Install binary**

```bash
cd mcp-task-runner && make install
```

Expected: `/usr/local/bin/mcp-task-runner` exists.

- [ ] **Step 5: Commit**

```bash
git add mcp-task-runner/main.go
git commit -m "feat(mcp-task-runner): MCP server with plan_tasks/run_task/execute_plan"
```

---

### Task 7: Portforward + .mcp.json + tool-guide

**Files:**
- Modify: `scripts/mcp-portforward.sh`
- Modify: `.mcp.json`
- Modify: `.claude/skills/references/mcp-tool-guide.md`

**Interfaces:**
- Produces: OTel reachable at `localhost:4317`; `mcp-task-runner` callable from Claude Code

- [ ] **Step 1: Add OTel portforward to mcp-portforward.sh**

In `scripts/mcp-portforward.sh`, add a second `PIDFILE` and `start_otel()` function. Insert after the `PIDFILE_MONOLITH` line:

```bash
PIDFILE_OTEL="/tmp/mcp-portforward-otel.pid"
```

Add this function after `start_monolith()`:

```bash
start_otel() {
  if [ -f "$PIDFILE_OTEL" ] && kill -0 "$(cat "$PIDFILE_OTEL")" 2>/dev/null; then
    echo "OTel port-forward already running (PID $(cat "$PIDFILE_OTEL"))"
    return
  fi
  nohup kubectl --context k3d-korczewski-dev port-forward \
    -n monitoring svc/otel-collector \
    4317:4317 \
    >> /tmp/mcp-portforward.log 2>&1 &
  echo $! > "$PIDFILE_OTEL"
  echo "  OTel started (PID $(cat "$PIDFILE_OTEL"))"
}
```

In the `start` block, add `start_otel` after `start_monolith`:

```bash
  start_monolith
  start_otel
```

Update the ready message:

```bash
  echo "  otel:     grpc://localhost:4317"
```

In the `stop` block, add `"$PIDFILE_OTEL"` to the `for pidfile in` loop:

```bash
  for pidfile in "$PIDFILE_MONOLITH" "$PIDFILE_OTEL"; do
```

Add `pkill -f "port-forward.*otel-collector"` after the monolith pkill.

In the `status` block, add 4317 to the port list:

```bash
  for port in 18080 13000 13001 13002 4317; do
```

And add to the health check loop:

```bash
  # OTel uses gRPC, not HTTP — just check socket
  if ss -tlnp 2>/dev/null | grep -q ":4317 "; then
    echo "  otel (localhost:4317): LISTENING"
  else
    echo "  otel (localhost:4317): DOWN"
  fi
```

- [ ] **Step 2: Verify portforward script is valid bash**

```bash
bash -n scripts/mcp-portforward.sh && echo "syntax OK"
```

Expected: `syntax OK`.

- [ ] **Step 3: Add mcp-task-runner to .mcp.json**

In `.mcp.json`, add to `mcpServers`:

```json
"mcp-task-runner": {
  "command": "mcp-task-runner",
  "args": [
    "--otel-endpoint", "localhost:4317",
    "--taskfile", "/home/patrick/Bachelorprojekt/Taskfile.yml"
  ]
}
```

Note the absolute path to Taskfile.yml — required because Claude Code may invoke the binary from any working directory.

- [ ] **Step 4: Verify .mcp.json is valid JSON**

```bash
python3 -c "import json,sys; json.load(open('.mcp.json')); print('valid')"
```

Expected: `valid`.

- [ ] **Step 5: Add row to mcp-tool-guide.md**

In `.claude/skills/references/mcp-tool-guide.md`, add to the server table:

```markdown
| `mcp-task-runner` | stdio (local binary) | `plan_tasks`, `run_task`, `execute_plan` | go-task parallel ausführen + OTel-Logging; OTel via `localhost:4317` (portforward) |
```

- [ ] **Step 6: Commit**

```bash
git add scripts/mcp-portforward.sh .mcp.json .claude/skills/references/mcp-tool-guide.md
git commit -m "feat(mcp-task-runner): wire portforward + .mcp.json + tool-guide"
```

---

### Task 8: BATS integration tests

**Files:**
- Create: `tests/spec/mcp-task-runner.bats`

**Interfaces:**
- Consumes: `/usr/local/bin/mcp-task-runner` (installed in Task 6)
- Produces: `./tests/runner.sh local MCP-TASK-RUNNER` green

- [ ] **Step 1: Write the BATS test file**

```bash
#!/usr/bin/env bats
# tests/spec/mcp-task-runner.bats
# SSOT: openspec/changes/mcp-task-runner/proposal.md

# ── Helpers ───────────────────────────────────────────────────────────────────

BINARY="${BATS_TEST_DIRNAME}/../../mcp-task-runner/bin/mcp-task-runner"
TASKFILE="${BATS_TEST_DIRNAME}/../../Taskfile.yml"

# Send a single JSON-RPC request to the binary via stdin and capture stdout.
mcp_call() {
  local method="$1"
  local params="$2"
  printf '{"jsonrpc":"2.0","id":1,"method":"%s","params":%s}\n' "$method" "$params" \
    | "$BINARY" --taskfile "$TASKFILE" 2>/dev/null
}

# Write a fake `task` binary into a temp dir and prepend it to PATH.
setup_fake_task() {
  local script="$1"
  FAKE_TASK_DIR="$(mktemp -d)"
  printf '#!/bin/sh\n%s\n' "$script" > "$FAKE_TASK_DIR/task"
  chmod +x "$FAKE_TASK_DIR/task"
  export PATH="$FAKE_TASK_DIR:$PATH"
}

teardown() {
  [ -n "${FAKE_TASK_DIR:-}" ] && rm -rf "$FAKE_TASK_DIR"
}

# ── Tests ─────────────────────────────────────────────────────────────────────

@test "binary exists and lists three tools" {
  [ -x "$BINARY" ]
  run bash -c "echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}' | $BINARY 2>/dev/null"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"plan_tasks"'
  echo "$output" | grep -q '"run_task"'
  echo "$output" | grep -q '"execute_plan"'
}

@test "plan_tasks groups same-brand independent tasks in one parallel group" {
  setup_fake_task 'echo "{\"tasks\":[{\"name\":\"workspace:deploy\",\"deps\":[]},{\"name\":\"workspace:validate\",\"deps\":[]}]}"'
  run mcp_call "tools/call" \
    '{"name":"plan_tasks","arguments":{"tasks":[{"task":"workspace:deploy","env":"mentolder"},{"task":"workspace:validate","env":"mentolder"}]}}'
  [ "$status" -eq 0 ]
  # Plan must contain exactly 1 group
  echo "$output" | python3 -c "
import json,sys
data = json.loads(sys.stdin.read())
content = json.loads(data['result']['content'][0]['text'])
assert len(content['groups']) == 1, f'expected 1 group, got {len(content[\"groups\"])}'
assert len(content['groups'][0]['tasks']) == 2, 'expected 2 tasks in group'
"
}

@test "plan_tasks sequences dependent tasks into separate groups" {
  setup_fake_task 'echo "{\"tasks\":[{\"name\":\"workspace:deploy\",\"deps\":[]},{\"name\":\"workspace:post-setup\",\"deps\":[\"workspace:deploy\"]}]}"'
  run mcp_call "tools/call" \
    '{"name":"plan_tasks","arguments":{"tasks":[{"task":"workspace:deploy","env":"mentolder"},{"task":"workspace:post-setup","env":"mentolder"}]}}'
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c "
import json,sys
data = json.loads(sys.stdin.read())
content = json.loads(data['result']['content'][0]['text'])
assert len(content['groups']) == 2, f'expected 2 groups, got {len(content[\"groups\"])}'
assert content['groups'][0]['tasks'][0]['task'] == 'workspace:deploy'
assert content['groups'][1]['tasks'][0]['task'] == 'workspace:post-setup'
"
}

@test "run_task returns exit_code and task name" {
  setup_fake_task 'exit 0'
  run mcp_call "tools/call" \
    '{"name":"run_task","arguments":{"task":"workspace:deploy","env":"mentolder"}}'
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c "
import json,sys
data = json.loads(sys.stdin.read())
r = json.loads(data['result']['content'][0]['text'])
assert r['exit_code'] == 0
assert r['task'] == 'workspace:deploy'
assert r['env'] == 'mentolder'
"
}

@test "execute_plan aborts serial group after failure in group 1" {
  setup_fake_task 'exit 1'
  # Build a 2-group plan manually (no dep parsing needed here)
  PLAN='{"groups":[{"tasks":[{"task":"workspace:deploy","env":"mentolder"}]},{"tasks":[{"task":"workspace:post-setup","env":"mentolder"}]}]}'
  run mcp_call "tools/call" \
    "{\"name\":\"execute_plan\",\"arguments\":{\"plan\":$PLAN}}"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c "
import json,sys
data = json.loads(sys.stdin.read())
text = data['result']['content'][0]['text']
results = json.loads(text.split('\n')[0])
# Only group 1 ran — 1 result
assert len(results) == 1, f'expected 1 result (fail-fast), got {len(results)}'
assert results[0]['exit_code'] == 1
"
}
```

- [ ] **Step 2: Run the tests**

```bash
./tests/runner.sh local MCP-TASK-RUNNER 2>&1
```

If `runner.sh` doesn't know `MCP-TASK-RUNNER`, check how it discovers test files:

```bash
grep -n "spec/" tests/runner.sh | head -5
```

Adjust the test ID to match the runner's convention (may be `mcp-task-runner` lowercase).

- [ ] **Step 3: Regenerate test inventory**

```bash
task test:inventory
```

Expected: `website/src/data/test-inventory.json` updated (or unchanged if not tracked there).

- [ ] **Step 4: Commit**

```bash
git add tests/spec/mcp-task-runner.bats
git commit -m "test(mcp-task-runner): BATS integration tests (4 cases)"
```

---

### Task 9: Final verification

**Files:** none (gate only)

- [ ] **Step 1: Full Go test suite**

```bash
cd mcp-task-runner && go test ./... -v
```

Expected: all tests PASS, 0 failures.

- [ ] **Step 2: Build clean binary**

```bash
cd mcp-task-runner && make clean && make build
```

Expected: `bin/mcp-task-runner` ~15 MB or less.

- [ ] **Step 3: CI gate**

```bash
task test:all
task freshness:check
```

Expected: green.

- [ ] **Step 4: OpenSpec validation**

```bash
bash scripts/openspec.sh validate 2>/dev/null || npx openspec-mcp validate 2>/dev/null || echo "validate via: task openspec:validate"
task openspec:validate
```

Expected: `mcp-task-runner` change validates clean.

- [ ] **Step 5: Smoke test with real Taskfile**

Start portforward:
```bash
bash scripts/mcp-portforward.sh start
```

Run a plan against the real Taskfile:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"plan_tasks","arguments":{"tasks":[{"task":"workspace:validate","env":"dev"}]}}}' \
  | mcp-task-runner --taskfile /home/patrick/Bachelorprojekt/Taskfile.yml 2>/dev/null
```

Expected: JSON plan with at least one group and one task.

- [ ] **Step 6: Final commit**

```bash
git add -u
git commit -m "chore(mcp-task-runner): final verification pass"
```
