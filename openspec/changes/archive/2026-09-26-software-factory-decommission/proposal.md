# Proposal: software-factory-decommission

## Why

Die autonome Software Factory (Dispatch-Timer, Wakeup-Listener, 6-Phasen-Pipelines, Kubernetes-Runner-Container, MCP-Server und zugehörige Datenbank-Tabellen) wird vollständig stillgelegt und aus dem Repository zurückgebaut.

Entwicklungsaufgaben und Ticket-Abarbeitung werden standardmäßig interaktiv und agentisch über `dev-flow-plan`, `dev-flow-execute` und `dev-flow-chore` gesteuert. Das autonome Hintergrund-Subsystem bindet erhebliche Ressourcen (laufende systemd-Units `factory.timer` und `factory-mcp.service`, periodische Ticks alle 10 Minuten, In-Cluster-Runner und PVCs, gesonderte MCP-Dienste) und birgt Risiken für Drift und unerwünschte automatische Ticket-Mutationen.

_Ticket: T900399_

## What Changes

1. **Systemd Services & Daemons deaktivieren & entfernen:**
   - Deaktivierung und Stopp von `factory.timer`, `factory.service` und `factory-mcp.service`.
   - Entfernen der Unit-Dateien in `scripts/factory/` (`factory.service`, `factory.timer`, `scripts/factory/mcp-go/factory-mcp.service`).
   - Entfernen der Unit-Installations- und Kontroll-Tasks in `taskfiles/Taskfile.factory.yml` und `taskfiles/Taskfile.agents.yml`.

2. **Kubernetes-Manifeste & Cluster-Ressourcen bereinigen:**
   - Löschung der Dev-Stack-Manifeste:
     - `k3d/dev-stack/factory-runner.yaml` (Deployment, Service, PVC `factory-runner-workdir`, CronJob `factory-tick`)
     - `k3d/dev-stack/factory-runner-netpol.yaml`
     - `k3d/dev-stack/factory-runner-bootstrap.yaml`
     - `k3d/dev-stack/factory-runner-secrets-patch.yaml`
   - Bereinigung von `k3d/dev-stack/kustomization.yaml` (Entfernen aller Factory-Runner-Einträge und Patches).
   - Bereinigung von `k3d/dev-pod/deployment.yaml` (Entfernen des `factory-runner-secrets`-Mounts).
   - Bereinigung des Dashboards `k3d/monitoring/grafana-dashboards/factory-otel.json`.

3. **Datenbank-Entkopplung & Migrations-Runner:**
   - **Wichtige Entkopplung:** `scripts/migrate-factory.mjs` und `task factory:migrate` werden als allgemeiner DB-Migrations-Runner für `migrations/*.sql` von `task workspace:deploy` genutzt. Wir benennen `scripts/migrate-factory.mjs` in `scripts/migrate-db.mjs` um und führen `task db:migrate` ein (unter Beibehaltung von `task factory:migrate` als delegierender Alias, um Deployment-Pipelines nicht zu brechen).
   - Erstellung einer Migration `scripts/migrations/2026-09-26-factory-decommission.sql` zum sauberen Ablegen bzw. Droppen der Factory-spezifischen Tabellen und Views:
     - `tickets.v_factory_metrics`
     - `tickets.factory_control`
     - `tickets.factory_model_slots`
     - `tickets.factory_phase_events`
     - `tickets.factory_run_budget`
     - Spalten `pipeline_slot`, `pipeline_slot_meta`, `slot_count` in `tickets.tickets` werden bereinigt oder als deprecated belassen.

4. **Skripte & CLI-Tools abbauen:**
   - Löschen des Verzeichnisses `scripts/factory/` (Dispatcher, Pipeline, Schedule, Watchdog, mcp-go, Budget-Estimator, Usage-Report).
   - Löschen von `scripts/vda/factory.sh`, `scripts/vda/factory-prep.sh` und `scripts/vda/factory/`.
   - Löschen von `scripts/factory-mcp-node/`, `scripts/factory-task-packet.sh`, `scripts/finetune/collect_factory_traces.py` und `scripts/llm/measure-factory-context.mjs`.
   - Bereinigung von `scripts/ticket.sh` (Entfernen des Subcommands `factory-control`).

5. **Tool-Registry & MCP-Konfiguration:**
   - Entfernen von `factory-mcp-node` und `factory-mcp` aus:
     - `docs/agent-guide/registry/mcp.yaml`
     - `docs/agent-guide/registry/capabilities.yaml`
     - `docs/agent-guide/registry/skills.yaml`
     - `docs/agent-guide/registry/tools.yaml`
     - `docs/agent-guide/registry/goals.yaml`
     - `docs/agent-guide/registry/networks.yaml`
     - `docs/agent-guide/registry/agents.yaml`
   - Ausführen von `task mcp:sync`, um `~/.gemini/config/mcp_config.json` und `.mcp.json` driftfrei zu aktualisieren.

6. **SDLC Cockpit & Website:**
   - Bereinigen oder Absichern der SDLC-Cockpit-Endpunkte in `components/website/` (`/sdlc/api/factory-floor`, `factory-control`, `factory/force-tick`), sodass das Cockpit ohne die gelöschten Factory-Tabellen fehlerfrei lädt und keine 500er wirft.

7. **Taskfiles & Tests:**
   - Löschung von `taskfiles/Taskfile.factory.yml` und Entfernen des `factory:` Includes in `Taskfile.yml`.
   - Bereinigung von `Taskfile.yml` (Entfernen von `test:factory`, `test:unit:factory-*`, und der automatischen `RUN_FACTORY`-Triggern in `test:changed`).
   - Bereinigung / Löschung der veralteten Factory-Testdateien in `tests/spec/software-factory/`, `tests/spec/factory-*.bats`, `tests/unit/factory-*.bats`.
   - Bereitstellung eines neuen Decommissioning-Guards `tests/spec/software-factory/decommission-guard.bats`, der sicherstellt, dass weder Factory-Units aktiv sind, noch Factory-Runner im Dev-Stack konfiguriert sind.

8. **OpenSpec SSOT-Specs:**
   - Ablösung bzw. Bereinigung von `openspec/specs/software-factory.md` und der Sub-Specs (`factory-*.md`).

## Non-Goals

- Keine Änderung am eigentlichen Ticket-System (`tickets.tickets`) über die Entfernung der Factory-spezifischen Slot-Spalten hinaus.
- Keine Beeinträchtigung von `task workspace:deploy` oder der Bereitstellung von `shared-db` (gewährleistet durch die Entkopplung von `migrate-db.mjs`).
- Keine Änderungen an archivierten OpenSpec-Changes.

## Impact

- **Services**: `factory.timer`, `factory.service`, `factory-mcp.service` werden gestoppt und deinstalliert.
- **K8s**: Keine Runner-Pods oder Hintergrund-CronJobs im Namespace `workspace-dev` / `workspace`.
- **DB**: Tabellen `tickets.factory_*` werden gedroppt; Migrationssystem bleibt unter neutralem Namen `db:migrate` erhalten.
- **Agents**: Keine Factory-MCP-Tools mehr im Agenten-Toolset.
