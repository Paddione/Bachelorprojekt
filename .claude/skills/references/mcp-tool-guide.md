# MCP-Tool-Guide

SSOT für die MCP-native Tool-Nutzung in Skills und Subagents. Skills verlinken hierher statt die
Tabellen zu duplizieren. Pro Server: **Tools · Wann bevorzugen · Fallback**. Die mechanische
CI-Guard `tests/spec/mcp-tooling.bats` prüft, dass (1) jeder skill-kritische `ticket.sh`-Verb einen
`ticket-mcp`-Wrapper hat und (2) **jedes** im Go-Quellcode exponierte `ticket-mcp`-Tool hier gelistet
ist. Wer ein Tool ergänzt/entfernt, pflegt diese Datei mit — sonst wird CI rot.

Registriert in `.mcp.json` (Claude Code) und `.opencode/opencode.jsonc` (opencode).

---

## Globale Invarianten (gelten für ALLE Server)

> **`mcp__mcp-postgres__query` ist READ-ONLY und nimmt NUR `sql`.** Kein `connectionString`-Argument
> — die Verbindung ist serverseitig fest (`localhost:13001`, als `website`-User). INSERT/UPDATE/DELETE
> gehen NICHT über dieses Tool.

> **Writes/DDL/Superuser bleiben kubectl.** Schreibende SQL (INSERT/UPDATE/DELETE/UPSERT), DDL als
> `postgres`-Superuser und sämtliche Cluster-Mutationen (`kubectl apply`, `rollout restart`, scale,
> delete, Sealed Secrets, RBAC) laufen über `kubectl exec … psql` bzw. `kubectl`, **nie** über ein
> MCP-Read-Tool. Ticket-Lifecycle-Writes gehen über die `ticket-mcp`-Wrapper (die shellen zu
> `ticket.sh`, dem sanktionierten Write-Pfad) — nicht über `mcp-postgres`.

> **Prod-Write-Guard [T001954].** Schreibende SQL-Operationen (CREATE, INSERT, UPDATE, DELETE,
> ALTER, DROP, TRUNCATE) gegen Produktions-Namespaces (`mentolder`, `workspace-korczewski`) sind
> für Subagenten verboten. Der Guard `scripts/prod-write-guard.sh check <namespace> <sql>`
> prüft vor jeder Schreiboperation. Main-Session-Operatoren können mit
> `--confirm-prod-write` überschreiben (wird geloggt). Subagenten haben keinen Zugriff auf
> dieses Flag (bash-Write-Permission fehlt).

### Verfügbarkeits-Check (Portforward-Guard — vor MCP-Nutzung prüfen)

Das MCP-Tool ist direkt verfügbar, wenn der Server läuft. Schneller Health-Check (Beispiel
`mcp-postgres` auf `:13001`, `factory-mcp` auf `:13003` mit `/health`):

```bash
# Generischer JSON-RPC-Probe (mcp-postgres/-kubernetes):
curl -s --max-time 2 -o /dev/null -w '%{http_code}' \
  -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hc","version":"1"}}}' \
  http://localhost:13001/mcp
# 200 → MCP erreichbar; alles andere → Skript-/kubectl-Fallback nutzen.

# factory-mcp hat einen dedizierten Health-Endpoint:
curl -sf --max-time 2 http://127.0.0.1:13003/health && echo " → factory-mcp up"
```

Schlägt der MCP-Zugriff fehl oder ist der Cluster-Kontext nicht gesetzt → **Fallback** (der jeweilige
`psql`-/`kubectl`-/Skript-Block im Skill).

---

## `mcp-postgres` — Read-only SQL

- **Endpoint:** `http://localhost:13001/mcp`
- **Tool:** `mcp__mcp-postgres__query` (Param: **nur** `sql`)
- **Wann bevorzugen:** Read-only SELECTs gegen `tickets.*`, `knowledge.*`, `v_timeline` — Ticket-Pool,
  staged-plans, planning-Count, Timeline-/DoR-Reads.
- **Fallback (Reads) & Pflichtweg für Writes** — das MCP-Query-Tool ist read-only; schreibende
  Statements (INSERT/UPDATE/DELETE) laufen immer über diesen `psql()`-Helper (SSOT — Skills
  verlinken hierher statt ihn zu duplizieren):
  ```bash
  PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)
  psql() { kubectl exec "$PGPOD" -n workspace --context fleet -c postgres -- psql -U website -d website "$@"; }
  ```
- ⚠️ **Prod-Write-Guard:** Vor jedem schreibenden `psql()`-Aufruf gegen prod-Namespaces
  (`mentolder`, `workspace-korczewski`) den Guard aufrufen:
  `bash scripts/prod-write-guard.sh check <namespace> "<SQL>"`. Subagenten werden automatisch
  blockiert; Main-Operatoren nutzen `--confirm-prod-write` für bewusste Overrides.
- ⚠️ `tickets.ticket_plans`: nie `SELECT *` oder die `content`-Spalte über die ganze Tabelle (MB-Transfer
  über `kubectl exec` → Timeout). Immer Metadaten (`id`, `ticket_id`, `slug`, `branch`, `pr_number`,
  `archived_at`) oder gezielt nach `ticket_id`/`slug` filtern.

## `mcp-kubernetes` — k8s-Status/Read

- **Endpoint:** `http://localhost:18080/mcp`
- **Tools (Auswahl):** `mcp__mcp-kubernetes__pods_list_in_namespace`, `pods_list`, `pods_log`,
  `pods_get`, `resources_get`, `resources_list`, `events_list`, `namespaces_list`.
- **Wann bevorzugen:** strukturierte Status-/Read-Operationen (Pod-Liste, Logs, Describe, Events).
- **Fallback:** `task workspace:status` / `task workspace:logs` bzw. `kubectl get/logs/describe`.
- **Mutations bleiben kubectl:** `pods_delete`, `resources_create_or_update`, `resources_scale`,
  `resources_delete` existieren, aber Manifest-Mutationen laufen bewusst über `kubectl apply` /
  Taskfile-Deploys (siehe globale Invariante).

## `ticket-mcp` — Ticket-Lifecycle (Go-Adapter über `ticket.sh`)

- **Transport:** lokales Go-Binary `scripts/ticket-mcp/ticket-mcp-go` (stdio; optional HTTP via
  `TICKET_MCP_HTTP=1` auf `:13004`). Dünne Adapter — `ticket.sh` ist die Business-Logik-SSOT.
- **Wann bevorzugen:** alle Ticket-Reads + Lifecycle-Writes (die Wrapper shellen zu `ticket.sh`).
- **Fallback:** der jeweilige `./scripts/ticket.sh <verb>` / `./scripts/vda.sh ticket <verb>`-Aufruf.

**Alle Tools (Go-SSOT — diese Liste deckt den Guardrail ab):**

| Gruppe | Tools |
|---|---|
| List/Get | `list_tickets`, `get_ticket`, `export_tickets`, `backfill_ticket_id` |
| Triage/Planning | `triage_ticket`, `set_plan_meta`, `set_readiness_flag`, `prepare_feature` |
| Lifecycle | `transition_status`, `add_comment`, `update_fields` |
| Workflow | `record_phase_event`, `record_grill_answers`, `stage_plan`, `create_ticket`, `enqueue_ticket`, `set_touched_files`, `get_attachments`, `archive_plan`, `add_pr_link` |
| Mishap | `report_mishap`, `get_mishap_buffer`, `flush_mishap_buffer` |
| Links/Timeline | `link_tickets`, `get_ticket_links`, `export_ticket_timeline` |

> `create_ticket` gibt `external_id|uuid` zurück (Skills parsen `cut -d'|' -f1`). `record_phase_event`
> ist positional (`phase <id> <phase> <state>`); `get_attachments` braucht `out_dir`; `archive_plan`
> braucht `slug`+`branch`+`plan_file`. `report_mishap` akzeptiert `type ∈ {broken, degraded,
> suspicious, security, drift, process}`.

## `factory-mcp` — Software-Factory (HTTP, Daemon erforderlich)

- **Endpoint:** `http://localhost:13003/mcp` (StreamableHTTP), Health: `GET http://127.0.0.1:13003/health`.
- **Tools:** `factory_status`, `factory_queue`, `factory_enqueue`, `factory_trigger`, `factory_recent`,
  `openspec_find_similar`.
- **Wann bevorzugen:** Factory-Queue-Status, Backlog-Übersicht, manuelles Anstoßen eines Ticks,
  OpenSpec-Ähnlichkeitssuche. **Voraussetzung:** der Daemon `:13003` läuft (Health-Guard zuerst).
- **Fallback (Daemon down):** Status/Queue → `mcp__mcp-postgres__query`/`psql` auf
  `tickets.tickets WHERE status IN ('backlog','plan_staged')`; Tick → `bash scripts/factory/wakeup.sh`.

## `mcp-task-runner` — go-task-Ausführung + OTel

- **Transport:** lokales Binary (`mcp-task-runner`), OTel-Endpoint `localhost:4317`.
- **Tools:** `plan_tasks`, `run_task`, `execute_plan`, `run_task_async`, `cancel_task`, `get_task_result`, `get_task_graph`.
- **Wann bevorzugen:** go-task-Targets parallel ausführen mit strukturiertem OTel-Logging.
- **Fallback:** `task <target>` direkt in der Shell.

## `task-master-ai` — Task-Management (KI-gestützt)

- **Transport:** lokales Binary (`task-master-ai`), stdio.
- **Tools:** `task_manager`, `add_task`, `update_task`, `list_tasks`.
- **Wann bevorzugen:** Aufgabenverwaltung mit KI-Kontextanalyse.
- **Fallback:** manuelle Notiz / Ticketsystem.

## `codebase-memory-mcp` — Code-Wissensgraph

- **Transport:** lokales Binary (`codebase-memory-mcp`), stdio.
- **Tools:** `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `search_code`, `get_architecture`, `index_repository`.
- **Wann bevorzugen:** strukturelle Code-Suche und Abhängigkeitsanalyse — vor grep/glob.
- **Fallback:** `grep` / `rg` / `glob` für einfache Textsuche.
