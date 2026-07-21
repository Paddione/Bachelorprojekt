# Proposal: feature-product-linking

## Why

Jedes `type='feature'`-Ticket (297 mentolder, 4 korczewski) hat `parent_id = NULL` und
landet im Cockpit-Portfolio (`website/src/lib/tickets/cockpit-db.ts`) im synthetischen
Bucket `NO_PRODUCT_ID` ("Ohne Produkt"). Ursache ist nicht verlorene Datenpflege: die 16
existierenden `type='project'`-Tickets sind alle bereits `archived` (alte
System-Test-Container T000219–T000230 und Epics) — es existiert keine lebende
Produkt-Taxonomie. Zusätzlich bieten weder `create_ticket` noch `prepare_feature`
(ticket-mcp) einen Parameter zum Setzen von `parent_id` beim Anlegen; der einzige
Schreibpfad dafür ist der Admin-API-Update (`admin.ts`), der im Standard-Ticket-Fluss
nie genutzt wird.

## What

1. Neue aktive Produkt-Taxonomie (7 `type='project'`-Tickets je Brand: Website,
   Infra/Deployment, AI/Software-Factory, Ticket-System/Cockpit, Auth/Security/DSGVO,
   Dev-Tooling, Sonstiges/Unklassifiziert) anlegen und alle 301 bestehenden parentless
   Features per einmaligem, idempotentem Backfill-Skript zuordnen (LLM-klassifizierte
   Mapping-Datei + Apply-Skript, Vorbild `scripts/migrate-projects-to-tickets.mjs`).
2. `product_id`-Parameter in `create_ticket`/`prepare_feature` (ticket-mcp) sowie
   `scripts/vda/ticket/create.sh` ergänzen, inkl. `type='project'` + Brand-Validierung.
3. Konsistenz-Fix in `website/src/lib/tickets/admin.ts`: bestehende `parentId`-Validierung
   um denselben `type='project'`-Check ergänzen.

Details, Fehlerfälle und Task-Reihenfolge: siehe
`docs/superpowers/specs/2026-07-21-feature-product-linking-design.md`.

_Ticket: T002016_
