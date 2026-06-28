## Context

Beide MCP-Server (`mcp-task-runner`, `ticket-mcp`) sind produktiv in Betrieb. `mcp-task-runner` nutzt Go + mcp-go SDK (stdio), `ticket-mcp` ist ein 15-Tool-Adapter der über `ticket.sh` → psql via `kubectl exec` läuft. Alle Änderungen sind rein additiv — keine bestehenden Schnittstellen werden verändert.

## Goals / Non-Goals

**Goals:**
- `mcp-task-runner`: Asynchrone Task-Ausführung mit Cancel-Support (3 neue Tools)
- `mcp-task-runner`: Task-Dependency-Visualisierung als Mermaid/JSON (1 neues Tool)
- `ticket-mcp`: Strukturierte FK-basierte Ticket-Dependencies (2 neue Tools)
- `ticket-mcp`: Chronologischer Ticket-History-Export aus 4 DB-Quellen (1 neues Tool)
- Vollständige Rückwärtskompatibilität aller bestehenden Tools

**Non-Goals:**
- Streaming-Output für `run_task` (eigenes Feature)
- OTel-Tracing in ticket-mcp / factory-mcp
- Rate-Limiting für parallele Ticket-Mutationen
- Job-Registry-Persistenz über Prozess-Restarts hinaus
- Status-Change-Logging in `update-status.sh` (Follow-up-Ticket)
- TTL/Expiry für JobRegistry-Einträge (MVP)

## Decisions

### D1: Async-Pattern — separates `run_task_async`-Tool statt `async`-Parameter

**Entscheidung:** Drei neue Tools (`run_task_async`, `cancel_task`, `get_task_result`) statt eines `async=true`-Parameters am bestehenden `run_task`.

**Begründung:** MCP-Tool-Schemas werden vom LLM zur Laufzeit ausgewertet. Ein Tool mit optionalem `async`-Parameter, das entweder `output: string` ODER `job_id: string` zurückgibt, verletzt den Schema-Kontrakt — das LLM kann den Return-Type nicht vorhersagen. Separate Tools mit stabilen, eindeutigen Signaturen sind robuster und besser beschreibbar.

**Alternative:** `run_task(async?: bool)` — abgelehnt wegen polymorphem Return-Shape.

### D2: Process-Termination — SIGTERM+WaitDelay+SIGKILL

**Entscheidung:** `cmd.Cancel = SIGTERM`, `cmd.WaitDelay = 5s`, danach SIGKILL via `exec.CommandContext`.

**Begründung:** `task` CLI startet selbst Subprozesse (kubectl, helm, psql). Direktes SIGKILL (Go-Default vor 1.20) lässt diese als Orphans zurück. SIGTERM gibt Subprozessen 5 Sekunden für graceful shutdown. Go 1.25.5 unterstützt `cmd.WaitDelay`.

### D3: `get_task_graph` — Mermaid als Default

**Entscheidung:** `get_task_graph(format?: "mermaid"|"json")` — Default: `"mermaid"`.

**Begründung:** Das Tool wird primär von Claude Code aufgerufen, das Mermaid direkt rendert. Der häufigste Use-Case (visuelle Übersicht) ist ohne Parameter-Angabe nutzbar. JSON für programmatische Weiterverarbeitung via `format=json`.

Node-ID-Sanitizing: alle `:`, `-`, `.`, `/` → `_` (Mermaid akzeptiert keine Sonderzeichen in IDs). Labels behalten den Originalnamen.

### D4: Ticket-Linking — implizit bidirektional, unidirektional in DB

**Entscheidung:** DB speichert `(from_id, to_id, 'blocks')` als einen Eintrag. `get_ticket_links` leitet `blocked_by` via Reverse-Query ab. `relates` ist symmetrisch via SQL UNION.

**Begründung:** Kein Duplikat-Risiko, kein Widerspruch zwischen zwei gegensätzlichen Einträgen. Konsistent mit dem bestehenden `ticket_links`-Schema (bereits so für `kind='pr'` genutzt). `UNIQUE(from_id, to_id, kind)` garantiert Idempotenz.

### D5: Timeline-Export — keine Migration, bekannte Lücke dokumentiert

**Entscheidung:** `export_ticket_timeline` nutzt die 4 bestehenden Quellen. `update-status.sh` wird NICHT in diesem PR erweitert.

**Begründung:** Das Tool ist bereits mit 4 Quellen wertvoll. Die `update-status.sh`-Erweiterung betrifft jeden CLI-Status-Transitions-Pfad und verdient ein eigenes Review-Ticket. Die Lücke (CLI-Statusübergänge fehlen in der Timeline) ist in der Spec dokumentiert.

## Risks / Trade-offs

- **JobRegistry-Wachstum** → Einträge akkumulieren ohne Bound bis Prozess-Neustart. Akzeptabel für MVP (mcp-task-runner läuft als stdio-Prozess per MCP-Session, nicht als Langzeit-Daemon). TTL als Follow-up.
- **mcp-go Concurrency** → `run_task_async` setzt voraus, dass mcp-go mehrere gleichzeitige Tool-Calls erlaubt (eine für `run_task_async`, eine für `cancel_task`). Zu verifizieren beim ersten Test.
- **ticket_links CHECK-Constraint** → Falls die Constraint in `tickets-db.ts` (TypeScript, nicht im Bash-Schema) definiert ist, muss die Migration auch dort angepasst werden. Die SQL-Migration ist idempotent (DROP IF EXISTS + ADD).
- **Timeline-Lücke** → CLI-Statusübergänge erscheinen nicht in der Timeline. Dokumentiert; Follow-up-Ticket erforderlich.

## Migration Plan

1. Idempotente SQL-Migration `2026-06-28-ticket-links-deps-kind.sql` manuell via `task db:migrate` oder beim nächsten `workspace:deploy` anwenden
2. Go-Binaries neu bauen: `cd mcp-task-runner && go build` + `cd scripts/ticket-mcp/go && go build`
3. `mcp-task-runner` Binary ersetzen (stdio — wird beim nächsten MCP-Aufruf neu gestartet)
4. `ticket-mcp` Binary ersetzen (stdio oder HTTP-Mode — Restart nötig falls HTTP-Daemon läuft)
5. Kein Kubernetes-Rollout erforderlich

## Open Questions

- Unterstützt `mark3labs/mcp-go` concurrent tool calls über stdio? → Test in Task 1 der Implementierung klären. Falls nicht: `cancel_task` braucht OS-Signal-Alternative (z.B. Watchfile-Pattern).
