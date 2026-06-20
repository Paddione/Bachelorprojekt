---
domains: [infra, mcp, observability]
status: planning
---

# Design: MCP Task Runner

_Datum: 2026-06-20_

## Kontext

Claude Code-Skills und Agenten führen go-task-Tasks heute über Shell-Befehle ohne strukturiertes Logging und ohne Parallelisierung aus. Bei Deployments beider Brands (mentolder + korczewski) werden Tasks seriell ausgeführt, obwohl sie unabhängig sind. Der bestehende OTel-Stack (Collector → Loki → Grafana) bleibt von Task-Ausführungen ungenutzt.

## Ziel

Neuer `mcp-task-runner` Go-MCP-Server im bestehenden `claude-code-mcp-ops`-Pod mit drei Tools: parallele Planung, Einzel-Ausführung und Plan-Ausführung — alle mit OTel-Traces und strukturiertem Log-Output.

## Architektur

```
claude-code-mcp-ops Pod
├── mcp-kubernetes  (port 8080, bestehend)
├── mcp-postgres    (port 3001, bestehend)
└── mcp-task-runner (port 3002, neu — Go binary ~15 MB)
        │
        ├── liest Taskfile.yml (Volume-Mount, read-only)
        ├── spawnt go-task Subprozesse (parallel via Goroutinen)
        └── OTel SDK → otel-collector.monitoring.svc:4317 (gRPC)
```

**Lokal:** `localhost:13002/mcp` via `scripts/mcp-portforward.sh` (Port `13002 → 3002`)

## MCP-Tools

### `plan_tasks`

```
Input:  [{task: string, env: string}]
Output: Plan-Objekt {groups: [{parallel: [{task, env}]}]}
```

1. `task --list-all --json --taskfile <path>` ausführen
2. `deps[]` pro Task parsen → DAG aufbauen
3. Kahn's Algorithm → Ebenen (Nodes ohne ausstehende Deps = eine Ebene)
4. Tasks gleicher Brand (env) auf einer Ebene → eine Parallelgruppe
5. Tasks verschiedener Brands → ebenfalls parallel (cross-brand)
6. Zirkuläre Deps → `ErrCyclicDependency`, kein Plan

### `run_task`

```
Input:  task: string, env: string
Output: {exit_code: int, stdout: string, stderr: string, trace_id: string}
```

- `exec.Command("task", task, "ENV="+env)` mit gesetztem `TASKFILE`
- stdout/stderr → OTel LogRecords (Attributes: `task.name`, `task.env`, `task.brand`, `task.exit_code`)
- Child-Span mit denselben Attributes
- OTel-Fehler → fail-open (kein Task-Abbruch), Fallback auf stderr

### `execute_plan`

```
Input:  Plan-Objekt (vom Client zurückgegeben nach plan_tasks)
Output: [{task, env, exit_code, trace_id}]
```

- Root-Span `execute_plan`
- Pro Gruppe: `sync.WaitGroup` — alle Tasks starten gleichzeitig via Goroutinen
- Fail-fast: exit ≠ 0 in Gruppe N → `context.cancel()` → Gruppe N+1 wird nicht gestartet
- Laufende Tasks in derselben Gruppe laufen durch (kein Kill)

## Go-Paketstruktur

```
mcp-task-runner/
├── main.go              # MCP-Server Bootstrap, Flags: --port, --otel-endpoint, --taskfile
├── planner/
│   ├── parser.go        # task --list-all --json → DAG
│   ├── parser_test.go
│   ├── scheduler.go     # Kahn's Algorithm → Parallelgruppen
│   └── scheduler_test.go
├── runner/
│   ├── executor.go      # exec.Command, sync.WaitGroup, fail-fast
│   ├── executor_test.go
│   └── streamer.go      # io.Pipe → OTel LogRecords
├── telemetry/
│   └── otel.go          # TracerProvider + LoggerProvider, Init/Shutdown, fail-open
├── go.mod
├── go.sum
└── Dockerfile           # Multi-Stage: golang:1.23-alpine → alpine:3.20
```

## Fehlerbehandlung

| Fehlerfall | Verhalten |
|---|---|
| Task exit ≠ 0 | Span.Status = Error; nachfolgende Gruppen abgebrochen; parallele Tasks laufen durch |
| OTel Collector nicht erreichbar | fail-open: Logs auf stderr; Task läuft normal weiter |
| `task --list-all --json` schlägt fehl | `plan_tasks` gibt Fehler zurück; keine Ausführung |
| Zirkuläre Abhängigkeit | `plan_tasks` gibt `ErrCyclicDependency` zurück |
| `--taskfile` nicht gefunden | Server-Start schlägt fehl (kein fail-open) |

## Kubernetes-Änderungen

- `k3d/claude-code-mcp-ops.yaml`: neuer Container + ConfigMap-Volume für `Taskfile.yml`
- `scripts/mcp-portforward.sh`: Port `13002:3002` ergänzt
- `.mcp.json`: Eintrag `mcp-task-runner`
- `.claude/skills/references/mcp-tool-guide.md`: neue Tabellenzeile
- `.github/workflows/build-mcp-task-runner.yml`: Build-Workflow (analog `build-brett.yml`)

## Testing

- **Unit**: `planner/parser_test.go`, `planner/scheduler_test.go`, `runner/executor_test.go` — Mock-Commands, keine echten Cluster-Abhängigkeiten
- **BATS**: `tests/spec/mcp-task-runner.bats` — 4 Tests via `./tests/runner.sh local MCP-TASK-RUNNER`
- **Smoke**: Nach Deploy → Grafana `monitoring.localhost` → Spans `execute_plan` mit Child-Spans sichtbar

## Nicht im Scope

- Task-Cancellation nach Start (kein SIGTERM-Forwarding)
- Persistenter Task-History-Store (kein DB-Layer)
- Web-UI für Task-Status
- Rate-Limiting / Queuing
