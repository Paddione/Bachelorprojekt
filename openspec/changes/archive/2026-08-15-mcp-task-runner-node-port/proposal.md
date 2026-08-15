# Proposal: mcp-task-runner-node-port

## Why

Der MCP-Server `mcp-task-runner` existiert derzeit als kompilierte Go-Binary unter `/usr/local/bin/mcp-task-runner` (Quellcode in `mcp-task-runner/`).
Dies führt in der Praxis zu folgenden Problemen:
1. **Laufzeit- und Inode-Drift:** Hintergrundprozesse (z. B. langlebige stdio-Sessions) halten den Inode-Handle einer gelöschten oder ersetzten Binary (`/proc/<pid>/exe (deleted)`). Bei Code-Updates oder Rebuilds laufen alte Prozesse weiter und führen alten Code aus, was zu wiederholten Drift-Mishaps führte (T003825, T004897, T006362).
2. **Kompilierungsaufwand & Build-Schritte:** Änderungen erfordern `go build` und eine Installation ins Host-Dateisystem (`/usr/local/bin`), was in CI und bei schnellen Iterationen friktionsbehaftet ist.
3. **Uneinheitlicher Stack:** Die übrigen MCP-Server im Repo (`bge-mcp`, `mcp-postgres-local.mjs`) sind bereits native Node.js/ESM-Skripte.

## What

Portierung des `mcp-task-runner` MCP-Servers von Go zu einem Node.js/ESM-Skript (`scripts/mcp-task-runner/server.mjs`):
1. **Tool-Parität:** Implementierung aller 7 bestehenden MCP-Tools (`plan_tasks`, `run_task`, `execute_plan`, `get_task_graph`, `run_task_async`, `cancel_task`, `get_task_result`) gemäß `openspec/specs/mcp-task-runner.md`.
2. **DAG & Taskfile-Parser:** YAML-Parsing (`js-yaml`) von `Taskfile.yml` und inkludierten Namespaces (`includes:`) sowie topologische Sortierung (Kahn-Algorithmus) zur Sequenzierung paralleler Gruppen.
3. **Prozesssteuerung & Lifecycle:** Asynchrone Job-Registry für `run_task_async`, `cancel_task` mit SIGTERM und 5s-SIGKILL-Eskalation, `get_task_result`.
4. **Registry & Wrapper:** CLI-Wrapper `mcp-task-runner` / Symlink auf das Skript, Anpassung der Server-Definition in `docs/agent-guide/registry/mcp.yaml` und Sync via `task mcp:sync`.
5. **Ablösung der Go-Codebasis:** Archivierung/Entfernung von `mcp-task-runner/`.

_Ticket: T006664_
