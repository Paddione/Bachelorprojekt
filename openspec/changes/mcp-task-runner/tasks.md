# Tasks: mcp-task-runner

> MCP-Server für parallele go-task-Ausführung mit OpenTelemetry-Logging.
> Neuer Go-Container im `claude-code-mcp-ops`-Pod, Port 3002.

## Task 1: Go-Modul + Projektstruktur

Legt das Go-Modul und die Paketstruktur an.

### Requirement: Grundgerüst
- `mcp-task-runner/go.mod` mit `module github.com/paddione/mcp-task-runner`
- Pakete: `main`, `planner`, `runner`, `telemetry`
- Dependencies: `github.com/mark3labs/mcp-go`, `go.opentelemetry.io/otel`, `go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc`, `go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc`
- `mcp-task-runner/Dockerfile` — Multi-Stage Build (`golang:1.23-alpine` → `alpine:3.20`), statisch gelinktes Binary; `task` (go-task) Binary ebenfalls ins Final-Image kopiert (nötig für `plan_tasks`)

**Acceptance Criteria:**
- `go build ./...` in `mcp-task-runner/` läuft ohne Fehler
- `docker build mcp-task-runner/` erzeugt Image ≤ 30 MB

## Task 2: OTel SDK Setup (`telemetry/otel.go`)

Initialisiert TracerProvider + LoggerProvider gegen den OTel Collector.

### Requirement: OTel Bootstrap
- `telemetry.Init(ctx, endpoint string)` konfiguriert OTLP-gRPC-Exporter für Traces + Logs
- `telemetry.NewSpan(ctx, name string)` liefert `(context.Context, trace.Span)`
- `telemetry.EmitLog(ctx, body string, attrs ...attribute.KeyValue)` schreibt OTel LogRecord
- Graceful Shutdown via zurückgegebenem `func()`
- Fail-open: wenn Collector nicht erreichbar → kein Panic, Fallback auf stderr

**Acceptance Criteria:**
- Unit-Test mit Mock-Exporter prüft dass Spans + LogRecords emittiert werden
- Fehlerfall (kein Collector) → Server startet trotzdem

## Task 3: Taskfile-Parser + DAG (`planner/parser.go`)

Parsed `task --list-all --json` und baut einen Dependency-Graph.

### Requirement: DAG-Aufbau
- `planner.Parse(taskfilePath string) (Graph, error)` ruft `task --list-all --json --taskfile <path>` auf
- Parst `deps[]` pro Task → gerichteter azyklischer Graph
- Erkennt zirkuläre Abhängigkeiten → gibt `ErrCyclicDependency` zurück

**Acceptance Criteria:**
- `planner/parser_test.go` mit gemocktem JSON: drei Cases — keine Deps (alles parallel), lineare Kette (seriell), Zyklus (Fehler)
- `go test ./planner/...` grün

## Task 4: Scheduler + Parallelgruppen (`planner/scheduler.go`)

Topologische Sortierung → Parallelgruppen mit Brand-Optimierung.

### Requirement: Kahn's Algorithm + Brand-Grouping
- `planner.Schedule(graph Graph, tasks []TaskRequest) (Plan, error)`
- Kahn's Algorithm → Ebenen (Nodes ohne ausstehende Deps = eine Ebene)
- Tasks gleicher Brand (env) auf gleicher Ebene → eine Parallelgruppe
- Tasks verschiedener Brands → ebenfalls parallel (cross-brand)
- Plan-Objekt: `{groups: [{parallel: [{task, env}]}]}`

**Acceptance Criteria:**
- `planner/scheduler_test.go`: `deploy ENV=mentolder` + `deploy ENV=korczewski` → eine Parallelgruppe; `post-setup` (dep auf `deploy`) → eigene Folgegruppe
- `go test ./planner/...` grün

## Task 5: Task-Executor (`runner/executor.go` + `runner/streamer.go`)

Führt einzelne Tasks aus und streamt Output als OTel LogRecords.

### Requirement: exec.Command + Goroutinen
- `runner.RunTask(ctx context.Context, task, env string) (Result, error)`
- `exec.Command("task", task, "ENV="+env)` mit gesetztem `TASKFILE` env var
- stdout/stderr via `io.Pipe` → `streamer.Stream(ctx, pipe, attrs)` → OTel LogRecords
- Child-Span mit `task.name`, `task.env`, `task.brand` (= env), `task.exit_code`
- `runner.ExecutePlan(ctx context.Context, plan Plan) ([]Result, error)`
  - Pro Gruppe: `sync.WaitGroup` über alle Tasks
  - Bei exit ≠ 0 in Gruppe: `cancel()` für nachfolgende Gruppen (fail-fast)

**Acceptance Criteria:**
- `runner/executor_test.go` mit Mock-Commands: parallele Ausführung verifiziert (beide starten vor erstem Ende); Fail-fast: Gruppe 2 wird nicht gestartet wenn Gruppe 1 fehlschlägt
- `go test ./runner/...` grün

## Task 6: MCP-Server + drei Tools (`main.go`)

Bindet die drei MCP-Tools über `mcp-go`.

### Requirement: MCP-Tool-Definitionen
- `plan_tasks(tasks: [{task: string, env: string}])` → JSON-Plan
- `run_task(task: string, env: string)` → `{exit_code, stdout, stderr, trace_id}`
- `execute_plan(plan: object)` → `[{task, env, exit_code, trace_id}]`
- Server lauscht auf `--port` (default 3002) als Streamable-HTTP MCP
- `--otel-endpoint` Flag für Collector-Adresse
- `--taskfile` Flag für Pfad (default `/workspace/Taskfile.yml`)

**Acceptance Criteria:**
- `go build -o mcp-task-runner .` erzeugt Binary
- Manueller `curl`-Test gegen lokales Binary: `plan_tasks` gibt validen Plan zurück

## Task 7: Kubernetes-Manifest + ConfigMap-Mount

Erweitert `k3d/claude-code-mcp-ops.yaml` um den neuen Container.

### Requirement: Pod-Erweiterung
- Neuer Container `mcp-task-runner` in `k3d/claude-code-mcp-ops.yaml`
- `image: ghcr.io/paddione/mcp-task-runner:latest`
- `args: ["--port", "3002", "--otel-endpoint", "otel-collector.monitoring.svc:4317", "--taskfile", "/workspace/Taskfile.yml"]`
- Volume: `Taskfile.yml` aus ConfigMap `taskfile-config` (neu in `k3d/claude-code-mcp-ops.yaml`) gemountet read-only unter `/workspace/Taskfile.yml`
- Resources: `requests: {memory: 32Mi, cpu: 50m}`, `limits: {memory: 128Mi, cpu: 500m}`
- Port 3002 als `containerPort`

**Acceptance Criteria:**
- `task workspace:validate` grün
- `kustomize build k3d/` enthält den neuen Container

## Task 8: Portforward + `.mcp.json` + Tool-Guide

Verdrahtet den neuen MCP-Server in die lokale Infrastruktur.

### Requirement: Lokale Erreichbarkeit
- `scripts/mcp-portforward.sh`: Port-Eintrag `13002:3002` für `mcp-task-runner` ergänzt (analog zu `13001:3001`)
- `.mcp.json`: Eintrag `"mcp-task-runner": {"url": "http://localhost:13002/mcp", "transport": "streamable-http"}`
- `.claude/skills/references/mcp-tool-guide.md`: neue Tabellenzeile für `mcp-task-runner` mit Tools + Anwendungsfall

**Acceptance Criteria:**
- `bash scripts/mcp-portforward.sh status` zeigt `mcp-task-runner` als konfigurierten Eintrag
- `.mcp.json` valides JSON

## Task 9: CI — `build-mcp-task-runner.yml`

Neuer GitHub Actions Workflow für automatisches Image-Build.

### Requirement: Build-Workflow
- Trigger: `push` auf `main` wenn `mcp-task-runner/**` geändert (analog `build-brett.yml`)
- `docker buildx build --platform linux/amd64 -t ghcr.io/paddione/mcp-task-runner:latest mcp-task-runner/`
- Push zu `ghcr.io` mit `GITHUB_TOKEN`

**Acceptance Criteria:**
- `.github/workflows/build-mcp-task-runner.yml` vorhanden und valides YAML
- `act` Dry-Run schlägt nicht fehl

## Task 10: BATS-Integrationstests (`tests/spec/mcp-task-runner.bats`)

### Requirement: BATS-Tests für drei Tools
- `@test "plan_tasks groups same-brand tasks in parallel"` — zwei Tasks gleicher Brand → eine Parallelgruppe
- `@test "plan_tasks sequences dependent tasks"` — Task mit Dep → Folgegruppe
- `@test "run_task returns exit_code and trace_id"` — Mock-Task → strukturiertes JSON-Output
- `@test "execute_plan aborts serial group on task failure"` — Gruppe 1 fehlschlägt → Gruppe 2 nicht gestartet
- Tests laufen ohne echten Cluster (task wird gemockt via `PATH`-Prepend)

**Acceptance Criteria:**
- `./tests/runner.sh local MCP-TASK-RUNNER` grün
- `task test:inventory` regeneriert und `test-inventory.json` committed

## Task 11: Abschlussverifikation (PFLICHT)

### Requirement: CI-equivalent Gate

**Acceptance Criteria:**
```bash
task test:changed
task freshness:regenerate
task freshness:check
task test:inventory
bash scripts/openspec.sh validate
```
- Alle Befehle grün; `test-inventory.json` committed; OpenSpec-Change validiert sauber
