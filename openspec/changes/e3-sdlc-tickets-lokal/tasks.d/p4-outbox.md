---
title: "p4-outbox — Kunden-Bugmeldungen ueber eine Outbox in die lokale DB"
ticket_id: T002626
domains: [db, website]
status: active
---

# p4-outbox — Kunden-Bugmeldungen ueber eine Outbox in die lokale DB

Schliesst die letzte Luecke: Bugmeldungen entstehen auf der Produktionswebsite, die nach dem
Umzug kein `tickets.tickets` mehr zum Schreiben hat. GitHub weiss von ihnen nichts, der Poller
kann sie also nicht holen — sie brauchen einen eigenen Weg. Setzt p3 voraus (der Poller ist
der Leser).

## File Structure

| Datei | Rolle | S1-Budget |
|---|---|---|
| `migrations/2026-08-08-bug-report-outbox.sql` | neu — Outbox-Tabelle auf fleet | n/a |
| `website/src/lib/sdlc/inbox/bug-outbox.ts` | neu — Schreibpfad in die Outbox | `.ts` / 900, Budget 900 |
| `website/src/lib/sdlc/inbox/bug-outbox.test.ts` | neu — Vitest | `.ts` / 900, Budget 900 |
| `website/src/lib/messaging-db.ts` | geaendert — schreibt in die Outbox statt ins Ticket | `.ts` / 900, Bestand 296, Budget 604 |

## Aufgaben

### 1. `public.bug_report_outbox` anlegen

Auf fleet, im `public`-Schema — dort, wo `inbox_items` bereits liegt. Struktur und
Retry-Semantik nach dem Vorbild `public.systemtest_failure_outbox`: fachliche Nutzdaten,
`retry_count`, `retry_after`, `last_error`, `created_at`, sowie eine Markierung fuer bereits
verarbeitete Zeilen.

Das Muster wird uebernommen, nicht neu erfunden. `website/src/lib/sdlc/systemtest/
failure-bridge.ts` (`enqueueOutboxRetry`, Z. 329) zeigt die etablierte Form; sie ist im Repo
getestet und verstanden.

### 2. Schreibpfad umstellen

`website/src/lib/messaging-db.ts` erzeugt heute bei einer Kunden-Bugmeldung direkt ein Ticket
(ueber `tickets/transition.ts`) und haengt es per `inbox_items.bug_ticket_id` an. Nach dem
Umzug existiert das Ziel dort nicht mehr.

Der neue Pfad schreibt in die Outbox. `inbox_items.bug_ticket_id` bleibt als Spalte bestehen
und wird nachgetragen, sobald der Poller das Ticket lokal erzeugt hat — die Ruecklieferung der
Ticket-Referenz ist Teil der Verarbeitung, nicht ihr Nebenprodukt. Ohne sie verliert die
Website die Anzeige, welche Meldung zu welchem Ticket gehoert.

**Best-effort-Verhalten beibehalten:** Schlaegt der Outbox-Schreibvorgang fehl, darf die
Bugmeldung selbst trotzdem gespeichert werden — genau wie heute beim Ticket-Pfad. Eine
verlorene Kundennachricht waere schlimmer als eine fehlende Ticket-Verknuepfung.

### 3. Poller-Seite ergaenzen

`scripts/factory/github-poller.sh` (aus p3) bekommt eine vierte Aufgabe: Outbox lesen, Ticket
lokal erzeugen, Zeile als verarbeitet markieren, Ticket-Referenz nach `inbox_items` zurueck-
schreiben. Gelesen wird ueber denselben `kubectl exec`-Weg gegen fleet, den `ticket.sh` heute
nutzt.

Eine nicht verarbeitbare Zeile behaelt ihren Fehlertext und ihr `retry_after` und blockiert die
Folgezeilen nicht — sonst legt eine einzige kaputte Meldung den gesamten Kanal still.

## Verifikation dieses Partials

```bash
cd website && pnpm vitest run src/lib/sdlc/inbox/bug-outbox.test.ts
```

Erwartet: die Vitest-Faelle decken den Normalfall (Meldung landet in der Outbox), den
Fehlerfall (Outbox-Schreibfehler laesst die Meldung selbst bestehen) und die Idempotenz
(dieselbe Zeile zweimal verarbeitet erzeugt ein Ticket, nicht zwei).
