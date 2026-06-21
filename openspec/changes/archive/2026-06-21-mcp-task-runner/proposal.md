# Proposal: mcp-task-runner

_Ticket: (neu)_

## Why

Claude Code-Skills und Agenten starten go-task-Tasks heute über `bash scripts/task-oracle.sh` + direkte Shell-Befehle — ohne strukturiertes Logging, ohne Parallelisierung, ohne Observability. Bei Deployments beider Brands (mentolder + korczewski) werden Tasks seriell ausgeführt, obwohl sie unabhängig sind. Fehler tauchen nur als unstrukturierter stderr-Text auf und sind in Loki nicht querybar.

Der bestehende OTel-Stack (Collector → Loki → Grafana) ist vollständig deployed, wird aber von Task-Ausführungen nicht genutzt.

## What

Neuer `mcp-task-runner` Go-Container im bestehenden `claude-code-mcp-ops`-Pod (neben `mcp-kubernetes` + `mcp-postgres`) mit drei MCP-Tools:

### `plan_tasks`
- Input: `[{task: string, env: string}]`
- Parsed `Taskfile.yml` via `task --list-all --json` → baut DAG der Abhängigkeiten
- Topologische Sortierung (Kahn's Algorithm) → Parallelgruppen
- Tasks gleicher Brand ohne Dep untereinander → parallel; verschiedene Brands → parallel
- Output: Execution-Plan-Objekt (Gruppen + Abhängigkeiten)

### `run_task`
- Input: `task: string, env: string`
- Führt `task <name> ENV=<env>` via `exec.Command` aus
- Stdout/stderr → OTel LogRecords mit Attributes: `task.name`, `task.env`, `task.brand`, `task.exit_code`
- Root-Span pro Aufruf; Output: `{exit_code, stdout, stderr, trace_id}`

### `execute_plan`
- Input: Plan-Objekt (direkt vom Client zurückgegeben)
- Führt Parallelgruppen via `sync.WaitGroup` + Goroutinen aus
- Fail-fast: eine fehlgeschlagene Task (exit ≠ 0) bricht nachfolgende serielle Gruppen ab; laufende parallele Tasks in derselben Gruppe laufen durch
- OTel-Trace: Root-Span `execute_plan` + Child-Span pro Task
- Output: aggregiertes Ergebnis aller Tasks

### Deployment

- Container-Image: `ghcr.io/paddione/mcp-task-runner:latest` (Go, `~15 MB`)
- Port: `3002` im Pod; Portforward `localhost:13002 → 3002` via `scripts/mcp-portforward.sh`
- Taskfile gemountet als Volume (hostPath oder emptyDir + Init-Container — ConfigMap allein fragil bei großen Files)
- OTel-Endpoint: `otel-collector.monitoring.svc:4317` (gRPC)
- CI: `build-mcp-task-runner.yml` — Build + Push bei Änderungen in `mcp-task-runner/**`

### `.mcp.json`-Eintrag

```json
"mcp-task-runner": {
  "url": "http://localhost:13002/mcp",
  "transport": "streamable-http"
}
```

## Alternatives Considered

- **Node.js** (konsistent mit mcp-postgres): ausgeschlossen — parallele Child-Process-Koordination in Node.js umständlicher als Goroutinen
- **Python + FastMCP**: gutes Async-Modell, aber anderer Stack und größeres Image; kein Mehrwert gegenüber Go
- **Promtail-only Logging** (stdout-basiert): kein strukturiertes Logging mit Task-Attributen, keine Traces

## Impact

- [ ] Breaking changes — nein
- [ ] Database migrations — nein
- [ ] API changes — neues MCP-Tool (additiv); `scripts/mcp-portforward.sh` + `.mcp.json` + `mcp-tool-guide.md` erweitert
