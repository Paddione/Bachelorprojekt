---
ticket_id: T000989
plan_ref: openspec/changes/cockpit-bulk-status/tasks.md
status: active
date: 2026-06-20
---

# Spec: Cockpit: Ticket-Status Bulk-Änderung

## Kern-Nutzerflow

Patrick aktiviert den Bulk-Modus (Checkbox-Spalte erscheint). Er wählt bis zu 10 Tickets per Checkbox aus, klickt „Status ändern", wählt den neuen Status. Aktion wird sofort ausgeführt — ein Toast zeigt „N Tickets auf X gesetzt" mit Soft-Undo-Button (5s sichtbar). Ein aggregierter Kommentar wird an jedem der N Tickets angelegt: „Bulk-Status-Wechsel von <old> → <new> durch Patrick am <date>".

## Akzeptanzkriterien

1. Bulk-Modus-Toggle aktiviert Checkbox-Spalte in Ticket-Liste
2. Maximal 10 Tickets pro Batch auswählbar (11. Checkbox blockiert mit Hinweis)
3. Nach Status-Änderung: Toast mit „Rückgängig"-Button (5s Frist)
4. Pro betroffenem Ticket ein Comment-Eintrag mit Bulk-Action-Metadaten
5. Undo stellt alle N Tickets auf den vorherigen Status zurück

## Edge Cases

- Ticket während Bulk-Aktion von anderem User geändert: Nur Tickets mit unverändertem Ausgangsstatus werden geändert, andere übersprungen + Hinweis
- Undo nach Undo-Frist: Nicht möglich — Toast verschwunden
- Bulk-Aktion auf Ticket mit abhängigen Sub-Tickets: Nur Parent wird geändert, Sub-Tickets unangetastet

## Fehlerfall-Behandlung

- 5 von 10 Tickets ändern sich, 5 nicht (DB-Fehler): Partielles Ergebnis, Patrick bekommt klare Aufstellung was ging / was nicht
- Undo schlägt fehl: persistentes Banner „Undo fehlgeschlagen — manuell prüfen"

## Erfolgsmetrik

- Bulk-Aktion in ≤10s für 10 Tickets durchführbar
- Undo-Rate <5% (indikator dass Patrick sich meist sicher ist)

## Technische Constraints

- Nur mentolder-Brand (erstmal)
- Batch-Limit 10 (konfigurierbar in code, nicht user-facing)
- Aggregierter Comment (kein individueller ausführlicher Audit-Eintrag)

## Betroffene Dateien

- `website/src/components/admin/Cockpit/TicketList.svelte` — Bulk-Modus + Checkbox-Spalte
- `website/src/pages/api/admin/tickets/bulk-status.ts` — neuer Endpoint
- Neue `website/src/lib/bulk-status.ts` — Transaction-Logik, Undo-State
