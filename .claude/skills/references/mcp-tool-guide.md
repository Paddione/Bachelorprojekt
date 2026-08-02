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
>
> **Konkret laufen dort auf [T002307]:** `ALTER USER`, `ALTER ROLE` und `GRANT` — sie scheitern mit
> `ERROR: cannot execute ALTER ROLE in a read-only transaction`. `mcp-postgres` klammert **jede**
> Query in eine `READ ONLY`-Transaktion; der Fehler ist also kein Rechte-, sondern ein
> Transaktionsmodus-Problem und tritt unabhängig vom DB-User auf. Der read-only-Zwang wird bewusst
> **nicht** gelockert — solche Statements gehören über `kubectl exec … psql` als `postgres`.

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

> **⚠️ Port-Forward-Integrität — der Guard oben prüft Erreichbarkeit, nicht Korrektheit [T002371-M1].**
> Der `kubectl port-forward` auf `workspace/shared-db` ist instabil und hat nachweislich **Zeilen
> mit falscher `external_id`** geliefert. Im Ursprungsfall wurde daraufhin ein UPDATE-Flag auf eine
> **nicht existierende** ID gesetzt (T002358 statt T002367) — der Schreibvorgang meldete Erfolg und
> traf nichts.
>
> Daraus folgen zwei Regeln:
>
> 1. **Schreibende Operationen laufen nicht über den Port-Forward.** Für Writes gilt der oben
>    dokumentierte `kubectl exec … psql`-Pfad.
> 2. **Ein Read, dessen Ergebnis eine Schreiboperation steuert, wird gegengeprüft** — die gelesene
>    ID gegen eine zweite Quelle abgleichen, *bevor* geschrieben wird.
>
> **Skript-Fix [T002371]:** `scripts/verify-ticket-id.sh <external_id> [brand]` prüft vor einem
> Write via kubectl exec (sicher), ob die gelesene ID existiert. Exit 0 = OK, Exit 1 = nicht
> gefunden. Vor jedem Write einfügen, der auf einer port-forward-basierten Read-Flagge basiert.

---

## `mcp-postgres` — Read-only SQL

- **Endpoint:** `http://localhost:13001/mcp`
- **Tool:** `mcp__mcp-postgres__query` (Param: **nur** `sql`)
- **Verfügbarkeits-Check — vor jedem Zugriff prüfen:** Der Server läuft als Port-Forward auf
  `workspace/shared-db` und ist nicht automatisch in jeder Session registriert. Vor dem ersten
  `mcp__mcp-postgres__query`-Aufruf die Erreichbarkeit bestätigen:
  ```bash
  curl -s --max-time 2 -o /dev/null -w '%{http_code}' \
    -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hc","version":"1"}}}' \
    http://localhost:13001/mcp
  # 200 → MCP erreichbar; alles andere → psql()-Fallback (siehe unten).
  ```
  Schlägt der Check fehl oder das Tool ist als deferred Tool nicht registriert
  (`ToolSearch({query: "select:mcp__mcp-postgres__query"})` liefert nichts) → sofort auf den
  `psql()`-Fallback umschwenken, nicht auf den MCP-Weg beharren.
- **Brand-Bindung [T002278]:** dieser Server ist **brand-gebunden** an die **mentolder**-Datenbank.
  `external_id` ist nur pro Brand eindeutig — eine Abfrage nach einer korczewski-ID liefert
  **stillschweigend die gleichnamige mentolder-Zeile** (das brand-gefilterte Query liefert leer
  und legt fälschlich nahe, der Filter sei falsch). Ticket-Reads (`tickets.*`) gehören zu
  `mcp__ticket-mcp__*` mit explizitem `brand`-Argument, **nicht** zu diesem Server.
- **Wann bevorzugen:** Read-only SELECTs gegen `knowledge.*`, `v_timeline` oder andere
  Nicht-Ticket-Tabellen. Für Ticket-Queries → `mcp__ticket-mcp__get_ticket` /
  `mcp__ticket-mcp__list_tickets` mit gesetztem `brand`.
- **Fallback (Reads) & Pflichtweg für Writes** — das MCP-Query-Tool ist read-only; schreibende
  Statements (INSERT/UPDATE/DELETE) laufen immer über diesen `psql()`-Helper (SSOT — Skills
  verlinken hierher statt ihn zu duplizieren):
  ```bash
  # --field-selector ist Pflicht [T002307]: ohne ihn kann ein Completed-Pod vorne einsortiert
  # werden und jeder folgende exec stirbt an "cannot exec into a container in a completed pod".
  PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db \
    --field-selector status.phase=Running -o name | head -1)
  psql() { kubectl exec "$PGPOD" -n workspace --context fleet -c postgres -- psql -U website -d website "$@"; }
  ```
- ⚠️ **kubectl exec Timeout [T002261]:** Schreibende `psql()`-Aufrufe über `kubectl exec` gegen
  `fleet` brauchen großzügige Timeouts (≥120s) — der Verbindungsabbau über WireGuard dauert
  messbar länger als lokaler `psql`. Ein Exit-Code 143 (SIGTERM/Timeout) bedeutet **nicht**, dass
  das `UPDATE` fehlgeschlagen sein muss — oft war das Statement bereits committed, bevor der
  Timeout den Session-Abbau trifft. Ergebnis deshalb grundsätzlich per separatem `SELECT`
  verifizieren, **nicht** am Exit-Code festmachen. Bei idempotenten
  `UPDATE … SET x = <konstante>` ist ein Wiederholungsversuch harmlos; bei `INSERT`,
  `UPDATE … SET n = n + 1` oder DDL kann er Daten verderben.
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
  `resources_delete`, `pods_exec`, `pods_run` existieren, aber Manifest-Mutationen laufen bewusst
  über `kubectl apply` / Taskfile-Deploys (siehe globale Invariante).
- ⚠️ **`pods_exec`/`pods_run` scheitern mit `cannot create resource pods/exec` — das ist das
  erwartete Ergebnis, keine Fehlkonfiguration [T002307].** Der Server läuft in-cluster unter der
  ServiceAccount `claude-code-agent`, deren ClusterRole
  (`k3d/default/claude-code-agent-clusterrole.yaml`) ausschließlich `get`/`list`/`watch` gewährt;
  erreichbar ist er über `kubectl port-forward` auf `svc/claude-code-mcp-monolith` in `default`.
  Der Weg für Exec ist `kubectl exec` mit der eigenen kubeconfig-Identität. Nachprüfbar mit:
  ```bash
  kubectl --context fleet auth can-i create pods/exec \
    --as=system:serviceaccount:default:claude-code-agent -n workspace
  ```
  Es wird bewusst **keine** RBAC-Regel ergänzt — Least Privilege ist hier die Absicht.

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

> **⚠ `stage_plan` und `archive_plan` funktionieren NICHT aus einem Worktree (T002256).**
> Beide lösen den Plan-Pfad relativ zum **Haupt-Checkout** auf, wo der Change-Ordner nur auf
> dem Branch existiert — nicht im Arbeitsverzeichnis des Aufrufers. Symptome trotz
> vorhandener, nicht-leerer Datei im Worktree:
>
> | Tool | Fehlermeldung |
> |---|---|
> | `stage_plan` | `... does not exist in git` |
> | `archive_plan` | `plan file does not exist or is empty: openspec/changes/<slug>/tasks.md` |
>
> **Regelweg aus einem Worktree ist das Skript** — nicht den MCP-Call debuggen:
>
> ```bash
> bash scripts/ticket.sh stage-plan   --id "$TICKET_ID" --branch "$BRANCH" --plan "$PLAN_FILE"
> bash scripts/ticket.sh archive-plan --id "$TICKET_ID" --slug "$SLUG" --branch "$BRANCH" \
>   --plan-file "$PLAN_FILE" --pr "$PR_NUM"
> ```
>
> Da `dev-flow-plan` und `dev-flow-execute` praktisch immer in `.worktrees/*` laufen, ist der
> Skript-Aufruf für diese beiden Tools der Normalfall und der MCP-Call die Ausnahme. Aus dem
> Haupt-Checkout heraus funktionieren beide MCP-Tools regulär.

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

## `bge-mcp` — BGE Embeddings & Reranking (Bearer-pflichtig)

- **Transport:** HTTP auf `127.0.0.1:13005/mcp` (`scripts/bge-mcp/server.mjs`, systemd-user-Unit
  `bge-mcp.service`). HTTP statt stdio, weil die llama-Web-UI beim Hinzufügen ausschließlich eine
  URL entgegennimmt.
- **Tools:** `bge_embed`, `bge_rerank`.
- **Wann bevorzugen:** lokale Vektor-Embeddings und Reranking über die bge-Paare.
- **Fallback:** direkter HTTP-Aufruf an die Paar-URLs (siehe `website/src/lib/bge-router.ts`).

**Der Server verlangt zwingend einen Bearer-Token.** Über HTTP entfällt die implizite
Authentifizierung, die stdio dadurch besitzt, dass nur der startende Prozess sprechen kann; der
Bind auf `127.0.0.1` schützt nur gegen das Netz, nicht gegen andere lokale Prozesse. Der Header
wird seit T002487 aus dem `headers`-Feld der Registry generiert — als unexpandierte
`${BGE_MCP_TOKEN}`-Referenz, damit kein Klartext in eine getrackte Datei gerät.

Betriebsvoraussetzung ist deshalb, dass die Variable in der Umgebung exportiert ist, aus der der
Harness startet:

```bash
set -a; . ~/.config/bge-mcp/server.env; set +a   # vor dem Start des Harness
```

**Diagnose bei „Server inaktiv":** Ein fehlender Token sieht aus wie ein nicht laufender Dienst.
Unterscheiden lässt sich das nur direkt am Endpunkt — `HTTP 401` mit `www-authenticate: Bearer`
heißt „läuft, aber Token fehlt", erst ein Verbindungsfehler heißt „läuft nicht":

```bash
curl -si -X POST http://localhost:13005/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' | head -3
```

**Automatisierter Check (T002504):** `bash scripts/bge-mcp/check-client-env.sh` fasst obige
Diagnose zusammen — prüft `~/.config/bge-mcp/server.env` auf Existenz + `BGE_MCP_TOKEN`, probt
den Endpunkt mit und ohne Token und unterscheidet die drei Zustände über Exit-Codes (`0` = ok,
`1` = Token fehlt/stimmt nicht, `2` = Server nicht erreichbar). Der Token-Wert wird nie
ausgegeben. BATS-Regressionsschutz: `tests/spec/mcp-gateway/client-env-check.bats`.
