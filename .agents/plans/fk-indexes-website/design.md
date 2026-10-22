---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-22
---

# fk-indexes-website — Design (Feature, selektiv)

## Ausgangslage (Audit F1, belegt)

17 fehlende volle B-Tree-Abdeckungen auf FK-Spalten (`website`-DB, alle
Constraints validiert, keine partiellen Cover-Indizes gefunden). EXPLAIN-Proben
zeigen: Child-Tabellen auf Dev leer → Seq Scan dort heute optimal, kein
messbarer Gewinn behauptet. Handlungsbedarf entsteht bei Parent-Writes.

## Selektion (Call-Path statt Pauschale)

Belegter Parent-Delete-Pfad nur für `customers`:
`components/website/src/lib/tickets/purge-fn.ts:517`
(`DELETE FROM customers c`), dazu Testdaten-Purge
(`pages/sdlc/api/testdata/purge.ts:68`). Jede dieser Deletes prüft
`SET NULL`/Restrict-Children per Seq Scan ohne Index.

Selektiert (6):
`chat_message_reads.customer_id`, `chat_messages.sender_customer_id`,
`chat_room_members.customer_id`, `chat_rooms.direct_customer_id`,
`messages.sender_customer_id`, `message_threads.customer_id`.

Bewusst zurückgestellt: `brand`-FKs (RESTRICT, Brands statisch, 2 Zeilen),
`requirements`-FKs (frozen Legacy `bachelorprojekt.*`, kein Delete-Pfad),
`coaching.*`/`document_assignments.template_id` (SET NULL/CASCADE-Eltern ohne
Bulk-Write-Pfad), `bug_tickets.brand` (frozen Legacy).

## Konvention (Prior-Art)

`feat(db): add foreign key indexes [T001830]` + Batch-Migrationen
`20260717/20260719/20260821_*fk_indexes*.sql`: Website-Runner-Datei unter
`components/website/src/db/migrations/`, `DO $$`-Block mit
`to_regclass`-Guard (Brand-übergreifend geteiltes Verzeichnis) +
`CREATE INDEX IF NOT EXISTS`, angewendet via `db:migrate`.

## Offene Laufweg-Frage (F4-Nachwirkung)

Der Katalog der devmesh-`website`-DB enthält weder `schema_migrations` noch
`factory_schema_migrations` (gezählt: 0). Task 1 verifiziert zuerst, ob
`db:migrate` auf devmesh überhaupt läuft — sonst wäre die Migration dort
toter Code und der Befund ein Deploy-Mechanik-Thema, kein Index-Thema.
