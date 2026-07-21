---
title: "Feature-Produkt-Zuordnung: Backfill + parent_id-API"
date: 2026-07-21
ticket_id: ""
plan_ref: ""
status: draft
domains: [website, db, ops, test, security]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Feature-Produkt-Zuordnung: Backfill + parent_id-API

## Problem

Im Ticket-Cockpit (`website/src/lib/tickets/cockpit-db.ts`) landet jedes `type='feature'`-Ticket
ohne `parent_id` im synthetischen Bucket `NO_PRODUCT_ID` ("Ohne Produkt"). Eine DB-Prüfung zeigt:
**ausnahmslos jedes** Feature-Ticket (297 bei mentolder, 4 bei korczewski) hat `parent_id = NULL`.
Grund: Die 16 existierenden `type='project'`-Tickets sind alle bereits `archived` (alte
System-Test-Container T000219–T000230 und ein paar Epics) — es gibt keine lebende
Produkt-Taxonomie. Zusätzlich bieten weder `create_ticket` noch `prepare_feature`
(ticket-mcp) einen Parameter, um `parent_id` beim Anlegen zu setzen; der einzige Schreibpfad
dafür ist der generische Admin-API-Update (`admin.ts` `patchAdminTicket`), der im normalen
Ticket-Erstellungsfluss nie benutzt wird.

## Ziel

1. Neue aktive Produkt-Taxonomie anlegen und alle bestehenden parentless Features dorthin
   zuordnen (einmaliger Backfill).
2. `product_id`-Parameter in `create_ticket`/`prepare_feature` ergänzen, damit neu erstellte
   Features direkt verlinkt werden können und der Bucket nicht weiter wächst.

## Nicht-Ziele

- Kein automatisches Re-Parenting der 16 archivierten Projekt-Tickets.
- Keine Live-LLM-API-Integration in Produktions-Skripten — die Klassifizierung der
  Bestandsdaten ist ein einmaliger, zur Implementierungszeit generierter Datensatz.
- Kein Pflichtfeld: `product_id` bleibt optional; unverlinkte Features fallen weiterhin
  auf den "Ohne Produkt"-Bucket zurück (kein Zwang, aber keine unbeabsichtigte Lücke mehr).

## Produkt-Taxonomie

Je Brand (mentolder, korczewski — separat wegen Brand-Scoping in `parent_id`/Query-Filtern)
werden 7 neue `type='project'`-Tickets angelegt, Status `in_progress` (aktiv, nicht archiviert):

1. Website
2. Infra/Deployment
3. AI/Software-Factory
4. Ticket-System/Cockpit
5. Auth/Security/DSGVO
6. Dev-Tooling (OpenSpec/CI/Testing/Docs)
7. Sonstiges/Unklassifiziert (Fallback-Bucket für nicht eindeutig zuordenbare Features)

## Backfill-Datenfluss

1. **Mapping-Datei generieren** (Implementierungszeit, durch Subagent): Alle 301 parentless
   Features (`external_id`, `title`, `areas`) werden gelesen und je Ticket einer der 7 Kategorien
   zugeordnet (Titel- und `areas`-basierte Klassifizierung). Nicht eindeutig zuordenbare oder
   niedrig-konfidente Fälle bekommen `product_slug: "sonstiges"` statt einer geratenen Zuordnung.
   Output: `scripts/one-shot/2026-07-21-feature-product-backfill-mapping.json`
   (`[{ external_id, brand, product_slug, confidence }]`).
2. **Apply-Skript** (Vorbild: `scripts/migrate-projects-to-tickets.mjs` — Node/mjs,
   `--dry-run` default, `--apply`-Flag, idempotent):
   - Legt je Brand die 7 Produkt-Tickets an (falls nicht vorhanden, Lookup per Titel+Brand).
   - Liest die Mapping-Datei und setzt je Feature `UPDATE tickets.tickets SET parent_id = <product-uuid> WHERE external_id = $1 AND parent_id IS NULL`.
   - Zweiter Lauf: keine Änderungen (bereits gesetzte `parent_id` werden nicht überschrieben).

## API-Änderungen

- `scripts/vda/ticket/create.sh`: neue Option `--product-id <uuid-or-external_id>`. Vor dem
  INSERT: Lookup `SELECT type, brand FROM tickets.tickets WHERE id::text = $1 OR external_id = $1`.
  Fehler bei `type <> 'project'` ("product_id must reference a project ticket") oder
  Brand-Mismatch. Bei Erfolg: Wert fließt als `parent_id` ins bestehende INSERT
  (`scripts/vda/ticket/create.sh:55-58`).
- `scripts/ticket-mcp/go/internal/tools/workflow.go` (`create_ticket`): neuer optionaler
  String-Parameter `product_id`, durchgereicht als `--product-id`.
- `scripts/ticket-mcp/go/internal/tools/planning.go` (`prepare_feature`): neuer optionaler
  Parameter `product_id`. Da `prepare_feature` auf einem existierenden Ticket arbeitet, wird
  vor dem bestehenden `plan-meta set`-Aufruf ein `ticket.sh update --id <id> --parent-id <product_id>`
  (neues Update-Flag, gleiche Type/Brand-Validierung wie im create-Pfad) ausgeführt.
- **Konsistenz-Fix `website/src/lib/tickets/admin.ts`**: Die bestehende `parentId`-Validierung
  in `createAdminTicket` (Zeile ~422, prüft aktuell nur Brand-Match) bekommt denselben
  `type='project'`-Check ergänzt, damit der Admin-API-Pfad nicht länger laxer ist als der neue
  CLI/MCP-Pfad.

## Fehlerfälle

- `product_id` verweist auf nicht-existentes Ticket → Fehler.
- `product_id` verweist auf `type <> 'project'` → Fehler ("product_id must reference a project ticket").
- `product_id`-Ticket gehört zu anderem Brand → Fehler (analog admin.ts-Verhalten).
- Zyklus-Fall bleibt irrelevant (Features werden nie Parent eines Projects); bestehender
  Zyklus-Schutz-Trigger (`tables/tickets.ts:305-330`) bleibt zusätzliches Netz.

## Testing

- BATS (`tests/spec/ticket-system.bats` oder passende Spec-Datei):
  - `ticket.sh create --type feature --product-id <valid-project>` setzt `parent_id`.
  - `--product-id <task-id>` (falscher Type) schlägt fehl.
  - `--product-id <other-brand-project>` schlägt fehl.
- Vitest (`website/src/lib/tickets/admin.test.ts`): neuer Fall "throws when parentId does not
  resolve to type='project'".
- Backfill-Apply-Skript: Test, der nach `--apply` prüft, dass alle 301 vormals parentless
  Features `parent_id` mit `type='project'` im selben Brand haben (0 orphans); zweiter Lauf ist
  idempotent (keine Diffs) — analog `tests/unit/tickets-projects-migration.bats`.

## Task-Reihenfolge

1. Produkt-Tickets anlegen (7 × mentolder, 7 × korczewski).
2. Mapping-Datei generieren (Klassifizierung der 301 Bestandsfeatures).
3. Backfill-Apply-Skript schreiben + ausführen (`--dry-run` zuerst, dann `--apply`).
4. API-Erweiterung: `create.sh` + ticket-mcp Go-Tools + admin.ts Konsistenz-Fix + Tests.
