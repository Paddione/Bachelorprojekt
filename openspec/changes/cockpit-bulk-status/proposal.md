---
title: Proposal: cockpit-bulk-status
ticket_id: T000989
plan_ref: openspec/changes/cockpit-bulk-status/tasks.md
status: planning
date: 2026-06-20
---

# Proposal: Cockpit: Ticket-Status Bulk-Änderung

> Quelle: `docs/superpowers/specs/2026-06-20-cockpit-bulk-status.md` (T000989).
> Dieser Proposal übernimmt die Spec inhaltlich und gleicht die Dateipfade
> an die reale Codebase ab (siehe "Datei-Mapping (Grounding)" unten).

## Kern-Nutzerflow

Patrick aktiviert den Bulk-Modus (Checkbox-Spalte erscheint). Er wählt bis zu 10
Tickets per Checkbox aus, klickt „Status ändern", wählt den neuen Status. Aktion
wird sofort ausgeführt — ein Toast zeigt „N Tickets auf X gesetzt" mit
Soft-Undo-Button (5s sichtbar). Ein aggregierter Kommentar wird an jedem der N
Tickets angelegt: „Bulk-Status-Wechsel von <old> → <new> durch Patrick am <date>".

## Akzeptanzkriterien

1. Bulk-Modus-Toggle aktiviert Checkbox-Spalte in Ticket-Liste
2. Maximal 10 Tickets pro Batch auswählbar (11. Checkbox blockiert mit Hinweis)
3. Nach Status-Änderung: Toast mit „Rückgängig"-Button (5s Frist)
4. Pro betroffenem Ticket ein Comment-Eintrag mit Bulk-Action-Metadaten
5. Undo stellt alle N Tickets auf den vorherigen Status zurück

## Edge Cases

- Ticket während Bulk-Aktion von anderem User geändert: Nur Tickets mit
  unverändertem Ausgangsstatus werden geändert, andere übersprungen + Hinweis
- Undo nach Undo-Frist: Nicht möglich — Toast verschwunden
- Bulk-Aktion auf Ticket mit abhängigen Sub-Tickets: Nur Parent wird geändert,
  Sub-Tickets unangetastet

## Fehlerfall-Behandlung

- 5 von 10 Tickets ändern sich, 5 nicht (DB-Fehler): Partielles Ergebnis,
  Patrick bekommt klare Aufstellung was ging / was nicht
- Undo schlägt fehl: persistentes Banner „Undo fehlgeschlagen — manuell prüfen"

## Erfolgsmetrik

- Bulk-Aktion in ≤10s für 10 Tickets durchführbar
- Undo-Rate <5% (indikator dass Patrick sich meist sicher ist)

## Technische Constraints

- Nur mentolder-Brand (erstmal)
- Batch-Limit 10 (konfigurierbar in code, nicht user-facing)
- Aggregierter Comment (kein individueller ausführlicher Audit-Eintrag)

## Datei-Mapping (Grounding gegen reale Codebase)

Die Spec nannte Pfade, die in der Codebase teils anders lauten. Der
Implementierungsplan (`tasks.md`) arbeitet gegen die echten Pfade:

| Spec (ideell) | Real existierend / neu | Bemerkung |
|---------------|------------------------|-----------|
| `website/src/components/admin/Cockpit/TicketList.svelte` | `website/src/components/admin/CockpitTable.svelte` + `website/src/components/admin/BulkBar.svelte` | BulkBar + Checkbox-Auswahl über `cockpitStore.selectedTickets` existieren bereits; Bulk-Modus-Toggle und Checkbox-Spalte sind vorhanden |
| `website/src/pages/api/admin/tickets/bulk-status.ts` | neu: `website/src/pages/api/admin/tickets/bulk-status.ts` | dedizierter Endpoint (aktuell läuft Bulk über generisches `/api/admin/cockpit/batch`) |
| `website/src/lib/bulk-status.ts` | neu: `website/src/lib/bulk-status.ts` | Transaktionslogik + Undo-State |

### Bestand bereits vorhanden (wird erweitert, nicht neu gebaut)

- `website/src/components/admin/BulkBar.svelte` — `<select data-testid="bulk-status">` + `onBulkStatus`-Callback existieren.
- `website/src/components/admin/CockpitTable.svelte` — `runBatch({ status }, ids)` verdrahtet `onBulkStatus`.
- `website/src/lib/tickets/cockpit-table-actions.ts` — `runBatch()` POSTet an `/api/admin/cockpit/batch`.
- `website/src/lib/stores/cockpitStore.ts` — `selectedTickets: Set`, `toggleTicketSelection`, `clearSelection`.
- `website/src/lib/tickets/transition.ts` — `transitionTicket()` mit `ticket_comments`-Insert (Vorbild für den aggregierten Comment, `kind='status_change'`).
- `website/src/pages/api/admin/cockpit/batch.ts` + `cockpit-db.ts:batchMutate()` — aktuelles naives Batch (Limit 100, kein Undo, kein Comment, keine Concurrent-Change-Guard). Wird für Status durch den dedizierten Endpoint abgelöst; Priority/Reparent bleiben auf dem alten Pfad.

### Bestand neu zu bauen

- `website/src/lib/bulk-status.ts` — `bulkChangeStatus()` mit Batch-Limit 10, `WHERE status = $old`-Guard (überspringt konkurrierend geänderte), aggregiertem Comment pro Ticket, Undo-Token-Erzeugung; `undoBulkStatus(token)`.
- `website/src/lib/bulk-status.test.ts` — Unit-Tests für Limit, Guard, Comment, Undo.
- `website/src/pages/api/admin/tickets/bulk-status.ts` — Admin+Brand-Guard, ruft `bulkChangeStatus()`, gibt `{ changed, skipped, failed, undoToken, oldStatuses }` zurück.
- `website/src/pages/api/admin/tickets/bulk-status/undo.ts` — `POST` restauriert Old-Statuses via Undo-Token.
- `website/src/components/admin/BulkToast.svelte` + `.test.ts` — Toast „N Tickets auf X gesetzt" + „Rückgängig"-Button, 5s Auto-Dismiss.

## Betroffene Dateien (angepasst)

- `website/src/components/admin/CockpitTable.svelte` — `onBulkStatus` auf neuen Flow + BulkToast-Mount
- `website/src/components/admin/BulkBar.svelte` — 10er-Cap-Hinweis bei 11. Auswahl
- `website/src/lib/tickets/cockpit-table-actions.ts` — `bulkStatusChange()`-Helper + `undoBulkStatus()`
- `website/src/lib/stores/cockpitStore.ts` — Auswahl-Cap (max 10) in `toggleTicketSelection`
