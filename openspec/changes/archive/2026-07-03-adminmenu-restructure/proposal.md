## Why

Das Admin-Seitenmenü hat über die Zeit zu viele Items angesammelt: redundante Links (Mitglieder, Mandate, Kontierung), eine flache Werkstatt-Sektion mit 8 gleichwertigen Einträgen und Dev-/Infrastruktur-Tools, die Nicht-Entwickler verwirren. Die Navigation muss auf das Wesentliche reduziert werden — klarere Hierarchie, kürzere Sidebar, Werkzeuge dort wo sie hingehören (Dashboard statt Sidebar).

## What Changes

- **Entfernt aus Sidebar:** Mitglieder, Mandate, Kontierung (Nav-Links weg, Pages bleiben erreichbar)
- **Ersetzt in Sidebar:** Sitzungen (`/admin/coaching/sessions`) → Studio (`/admin/coaching/studio`)
- **Werkstatt-Sektion:** 8 Items + 1 neues (Content-DB) hinter einem aufklappbaren Akkordeon
- **Verschoben auf Dashboard:** Plattform Hub, Dev Status, DORA, Repo Health als Shortcut-Karten
- **Neu:** Content-DB-Seite (`/admin/content-db`) — aggregierte Ansicht von Fragebögen-Templates, Vorlagen und Verträgen
- **Prod-Guard:** X-E2E-Test-Header wird in `NODE_ENV=production` ignoriert → kein Testdaten-Leak in Postfach
- **Einmaliger Cleanup:** `DELETE FROM inbox_items WHERE is_test_data = true`

## Capabilities

### New Capabilities

- `admin-nav-accordion`: Werkstatt-Sektion als aufklappbares Akkordeon in der Admin-Sidebar (kein Svelte — reiner Script-Block in Astro)
- `admin-content-db`: Neue Admin-Seite `/admin/content-db` mit aggregierter Übersicht aller schriftlichen Content-Assets (Fragebögen-Templates, Vorlagen, Verträge)

### Modified Capabilities

- `website-core`: Admin-Sidebar-Navigation strukturell verändert (Items entfernt/verschoben/ersetzt); Dashboard-Shortcuts erweitert
- `questionnaire-system`: `listQTemplates()` öffentlich exponiert für Content-DB-Aggregation
- `chat-inbox`: API-Endpunkte (`/api/contact`, `/api/booking`, `/api/bug-report`, `/api/portal/messages`) erhalten Prod-Guard gegen `is_test_data`-Leak

## Impact

- `website/src/components/admin/AdminSidebarNav.astro` — Hauptdatei der Änderung
- `website/src/components/admin/AdminShortcuts.svelte` — neue Infrastruktur-Gruppe
- `website/src/pages/admin/content-db.astro` + `ContentDb.svelte` — neue Seite
- `website/src/lib/questionnaire-db.ts` — neuer Export `listQTemplates()`
- API-Endpunkte: `/api/contact.ts`, `/api/booking.ts`, `/api/bug-report.ts`, `/api/portal/messages.ts`
- `scripts/cleanup-test-inbox.sh` — einmaliger DB-Cleanup
- Keine Datenbank-Schema-Änderungen; keine Breaking Changes für externe Consumers
