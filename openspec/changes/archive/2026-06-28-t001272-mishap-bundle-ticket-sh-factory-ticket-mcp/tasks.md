---
title: "t001272-mishap-bundle-ticket-sh-factory-ticket-mcp — Implementation Plan"
ticket_id: T001272
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001272-mishap-bundle-ticket-sh-factory-ticket-mcp — Implementation Plan

_Ticket: T001272_

## File Structure

```
openspec/changes/t001272-mishap-bundle-ticket-sh-factory-ticket-mcp/design.md
openspec/changes/t001272-mishap-bundle-ticket-sh-factory-ticket-mcp/tasks.md
```

## Verify (RED → GREEN)

### Task 1: Verify pre-existing schema error (Mishap 1)
Run scripts/ticket.sh to update scout drift on a test ticket. Since the database columns scout_drift and scout_drift_at do not exist on the live database yet, this command must fail.

```bash
# Verify DB column error
bash scripts/ticket.sh set-scout-drift --id T001272 --drift 0.95
# expected: FAIL (relation tickets does not have column scout_drift)
```

### Task 2: Verify missing lazy MCP tools (Mishap 3)
Verify that tools like stage_plan or record_phase_event are not listable in the client's lazy-load list since their schema files are missing.

```bash
# Check if stage_plan is in lazy-loaded schemas
ls /home/patrick/.gemini/antigravity-cli/mcp/ticket-mcp/stage_plan.json
# expected: FAIL (file not found)
```

## Implementation

### Task 3: Apply the database migration for Scout Drift (Mishap 1)
Apply the database schema changes for both brands (mentolder and korczewski).

```bash
# Apply migrations to both brand databases on fleet context
kubectl exec -i deploy/shared-db -n workspace --context fleet -c postgres -- psql -U website -d website < scripts/migrations/2026-06-17-scout-drift.sql
kubectl exec -i deploy/shared-db -n workspace-korczewski --context fleet -c postgres -- psql -U website -d website < scripts/migrations/2026-06-17-scout-drift.sql
```

### Task 4: Verify migration fix
Verify that the set-scout-drift command now works without database column errors.

```bash
bash scripts/ticket.sh set-scout-drift --id T001272 --drift 0.95
# expected: PASS
```

### Task 5: Address Autopilot Balance issues (Mishap 2)
Check the ~/.config/factory/autopilot.env file to verify the configured API Key and model. Recharge the balance for the key, or switch the model to a provider/account that has sufficient credits.

### Task 6: Write missing lazy MCP schemas (Mishap 3)
Create the missing JSON files in the /home/patrick/.gemini/antigravity-cli/mcp/ticket-mcp/ directory.

Write stage_plan.json:
```json
{"name":"stage_plan","description":"Stellt ein Ticket in die Kommissionierung (status=plan_staged) mit Branch + Plan-Pfad.","parameters":{"properties":{"brand":{"description":"mentolder oder korczewski (default: mentolder)","type":"string"},"branch":{"description":"Feature/Fix-Branch","type":"string"},"id":{"description":"external_id z.B. T000123","type":"string"},"plan":{"description":"Plan-Datei-Pfad","type":"string"}},"required":["id","branch","plan"],"type":"object"}}
```

Write get_mishap_buffer.json:
```json
{"name":"get_mishap_buffer","description":"Zeigt den aktuellen Inhalt des Mishap-Buffers (noch nicht zu Tickets gebündelt).","parameters":{"properties":{},"type":"object"}}
```

Write flush_mishap_buffer.json:
```json
{"name":"flush_mishap_buffer","description":"Erzwingt ein Bundle-Ticket aus dem aktuellen Buffer — auch bei <3 Einträgen (Session-Ende).","parameters":{"properties":{"brand":{"description":"mentolder oder korczewski (default: mentolder)","type":"string"}},"type":"object"}}
```

Write archive_plan.json:
```json
{"name":"archive_plan","description":"Archiviert einen Plan und mergt den Delta-Spec in die SSOT.","parameters":{"properties":{"brand":{"description":"mentolder oder korczewski (default: mentolder)","type":"string"},"branch":{"description":"Feature/Fix-Branch","type":"string"},"id":{"description":"external_id z.B. T000123","type":"string"},"plan_file":{"description":"Pfad zur Plan-Datei","type":"string"},"pr":{"description":"Optionale PR-Nummer (integer)","type":"string"},"slug":{"description":"OpenSpec-Change-Slug","type":"string"}},"required":["id","slug","branch","plan_file"],"type":"object"}}
```

Write record_phase_event.json:
```json
{"name":"record_phase_event","description":"Schreibt ein Factory/Devflow-Phasen-Event (tickets.factory_phase_events).","parameters":{"properties":{"brand":{"description":"mentolder oder korczewski (default: mentolder)","type":"string"},"detail":{"description":"Optionaler Detailtext","type":"string"},"driver":{"description":"factory|devflow (default: factory)","enum":["factory","devflow"],"type":"string"},"id":{"description":"external_id z.B. T000123","type":"string"},"phase":{"description":"scout|design|plan|implement|verify|deploy","enum":["scout","design","plan","implement","verify","deploy"],"type":"string"},"state":{"description":"entered|done|blocked","enum":["entered","done","blocked"],"type":"string"}},"required":["id","phase","state"],"type":"object"}}
```

Write create_ticket.json:
```json
{"name":"create_ticket","description":"Legt ein Ticket an. Gibt 'external_id|uuid' zurück.","parameters":{"properties":{"areas":{"description":"Komma-separierte Bereiche z.B. auth,chat","type":"string"},"attention_mode":{"description":"auto|ai_ready|needs_human","enum":["auto","ai_ready","needs_human"],"type":"string"},"brand":{"description":"mentolder oder korczewski (default: mentolder)","type":"string"},"description":{"description":"Beschreibung (Pflicht in create.sh)","type":"string"},"priority":{"description":"hoch|mittel|niedrig (default mittel)","enum":["hoch","mittel","niedrig"],"type":"string"},"severity":{"description":"critical|major|minor|trivial","enum":["critical","major","minor","trivial"],"type":"string"},"status":{"description":"Start-Status (default triage)","type":"string"},"title":{"description":"Ticket-Titel","type":"string"},"type":{"description":"bug|feature|task|project","enum":["bug","feature","task","project"],"type":"string"}},"required":["type","title","description"],"type":"object"}}
```

Write enqueue_ticket.json:
```json
{"name":"enqueue_ticket","description":"Reiht ein Ticket in den Software-Factory-Backlog ein (type=feature, status=backlog).","parameters":{"properties":{"brand":{"description":"mentolder oder korczewski (default: mentolder)","type":"string"},"branch":{"description":"Optionaler Branch","type":"string"},"id":{"description":"external_id z.B. T000123","type":"string"},"plan":{"description":"Optionaler Plan-Pfad","type":"string"}},"required":["id"],"type":"object"}}
```

Write set_touched_files.json:
```json
{"name":"set_touched_files","description":"Setzt die touched_files eines Tickets (Konflikt-/Scope-Tracking).","parameters":{"properties":{"brand":{"description":"mentolder oder korczewski (default: mentolder)","type":"string"},"files":{"description":"Komma- oder Whitespace-getrennte Pfade","type":"string"},"id":{"description":"external_id z.B. T000123","type":"string"}},"required":["id","files"],"type":"object"}}
```

Write get_attachments.json:
```json
{"name":"get_attachments","description":"Lädt die Attachments eines Tickets in ein Zielverzeichnis (out_dir Pflicht).","parameters":{"properties":{"brand":{"description":"mentolder oder korczewski (default: mentolder)","type":"string"},"id":{"description":"external_id z.B. T000123","type":"string"},"out_dir":{"description":"Zielverzeichnis (wird angelegt)","type":"string"}},"required":["id","out_dir"],"type":"object"}}
```

Write add_pr_link.json:
```json
{"name":"add_pr_link","description":"Verknüpft eine PR-Nummer mit einem Ticket (tickets.ticket_links kind=pr).","parameters":{"properties":{"brand":{"description":"mentolder oder korczewski (default: mentolder)","type":"string"},"id":{"description":"external_id z.B. T000123","type":"string"},"pr":{"description":"PR-Nummer (integer)","type":"string"}},"required":["id","pr"],"type":"object"}}
```

Write record_grill_answers.json:
```json
{"name":"record_grill_answers","description":"Persistiert Grilling-Antworten (tickets.grilling_answers JSONB). 'answers': eine Zeile pro Antwort als qid=text.","parameters":{"properties":{"answers":{"description":"Antworten, eine pro Zeile: qid=text","type":"string"},"brand":{"description":"mentolder oder korczewski (default: mentolder)","type":"string"},"id":{"description":"external_id z.B. T000123","type":"string"},"no_comment":{"description":"Kein Timeline-Kommentar (default false)","type":"boolean"},"questionnaire":{"description":"default: coaching-sessions-v1","type":"string"}},"required":["id","answers"],"type":"object"}}
```

### Task 7: Compile the ticket-mcp Go binary (Mishap 3)
Build the Go binary to ensure that the stdio MCP server supports all registered tools.

```bash
make -C scripts/ticket-mcp/go build
```

## Final Verification

Run the mandatory CI check suite.

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
