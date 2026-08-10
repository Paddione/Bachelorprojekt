# Design: One-Command Dev-Environment

## Architektur

```
task dev:up
  │
  ├─► [1] Pre-Flight: Docker, kubectl, go-task, pnpm vorhanden?
  │
  ├─► [2] k3d-Cluster: cluster anlegen/starten
  │      └─ k3d cluster create sdlc --config k3d/sdlc-cluster.yaml
  │      └─ kubectl wait --for=condition=Ready nodes --all
  │      └─ task workspace:deploy ENV=local  (Manifeste deployen)
  │
  ├─► [3] llm-proxy: Backend-Services starten
  │      └─ systemctl --user start llm-proxy.service
  │      └─ systemctl --user start llama-gemma26.service
  │      └─ systemctl --user start llama-qwen30.service
  │      └─ curl health-check auf jeden Port
  │
  ├─► [4] bge-Embedding + Rerank: lokal starten
  │      └─ systemctl --user start bge-mcp.service
  │      └─ curl health-check :13005
  │
  ├─► [5] PostgreSQL: DB-Container + Migrationen
  │      └─ kubectl wait pod -l app=shared-db (im k3d)
  │      └─ task db:migrate (Migrationen ausführen)
  │
  ├─► [6] Frontend: Astro dev server
  │      └─ BUILD_TARGET=sdlc pnpm dev (website/)
  │      └─ curl http://localhost:4321/sdlc → 200
  │
  └─► [7] Health-Check: Gesamtstatus
         └─ task dev:health → JSON-Report


task dev:down
  │
  ├─► pnpm dev stoppen (SIGTERM)
  ├─► systemctl --user stop llm-*.service bge-mcp.service
  └─► k3d cluster stop sdlc
```

## Dateien

| Datei | Zweck |
|-------|-------|
| `Taskfile.sdlc.yml` | dev:up, dev:down, dev:health, dev:status Targets |
| `k3d/sdlc-cluster.yaml` | k3d-Cluster-Konfiguration (lokal, SDLC-only) |
| `scripts/sdlc/dev-up.sh` | Orchestrierungs-Skript (Reihenfolge, Error-Handling) |
| `scripts/sdlc/health-check.sh` | Health-Check pro Komponente |
| `tests/spec/sdlc-isolation/dev-up.bats` | Integrationstest |

## Taskfile-Targets

```yaml
# Taskfile.sdlc.yml
tasks:
  dev:up:
    desc: Startet den kompletten lokalen SDLC-Stack
    cmds:
      - task: sdlc:preflight
      - task: sdlc:cluster
      - task: sdlc:llm
      - task: sdlc:bge
      - task: sdlc:db
      - task: sdlc:frontend
      - task: dev:health

  dev:down:
    desc: Fährt den SDLC-Stack sauber herunter
    cmds:
      - task: sdlc:frontend:stop
      - task: sdlc:llm:stop
      - task: sdlc:bge:stop
      - task: sdlc:cluster:stop

  dev:health:
    desc: Health-Check aller Komponenten
    cmds:
      - bash scripts/sdlc/health-check.sh

  dev:status:
    desc: Zeigt Status aller SDLC-Komponenten
    cmds:
      - bash scripts/sdlc/status.sh
```

## Verifikation

```bash
task dev:up    # startet alles
task dev:health  # → alle Komponenten grün
task dev:down    # fährt alles herunter
```
