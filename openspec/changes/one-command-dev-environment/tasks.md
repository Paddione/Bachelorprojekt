# Tasks: One-Command Dev-Environment

> **Ticket:** T002650 | **Typ:** project (EPIC) | **Kinder:** T002655, T002656

## EPIC-Koordination

- [ ] 1. `Taskfile.sdlc.yml` — dev:up, dev:down, dev:health, dev:status Targets
  - Includes aus root Taskfile.yml
  - Pre-Flight-Checks (Docker, kubectl, go-task, pnpm)
- [ ] 2. `k3d/sdlc-cluster.yaml` — lokale k3d-Cluster-Konfiguration
  - Nur SDLC-Komponenten (nicht Produktion)
  - Port-Mappings für llm-proxy, bge, PostgreSQL, Frontend
- [ ] 3. `scripts/sdlc/dev-up.sh` — Orchestrierung
  - Sequenzielle Ausführung mit Error-Handling
  - Timeout pro Schritt (Cluster: 120s, LLM: 60s, DB: 30s)
  - Progress-Output
- [ ] 4. `scripts/sdlc/health-check.sh` — Health-Check
  - Pro Komponente: HTTP-Health-Endpoint oder kubectl-Status
  - JSON-Output: `{"cluster":"ok","llm":"ok","bge":"degraded","db":"ok","frontend":"ok"}`
  - Exit-Code: 0 wenn alles ok, 1 wenn degraded, 2 wenn down
- [ ] 5. Kind-Ticket T002655 — `task dev:up`/`task dev:down` CLI-Integration
- [ ] 6. Kind-Ticket T002656 — llm-proxy Systemd-Unit + Health-Check
- [ ] 7. `tests/spec/sdlc-isolation/dev-up.bats` — Integrationstest
  - Mock-Prüfung: Pre-Flight, Taskfile-Syntax, Health-Check-Format
  - Kein echter k3d-Cluster-Start (zu langsam für CI)

## Abhängigkeiten

```
T002650 (dieser EPIC)
  ├── T002655 (task dev:up/dev:down) — Kind, CLI-Implementierung
  └── T002656 (llm-proxy starten)     — Kind, Systemd-Integration
```

## Verifikation

```bash
task dev:health
task dev:status
```
