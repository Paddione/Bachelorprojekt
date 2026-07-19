---
status: planning
slug: fix-e2e-kontaktformular
related_tickets: [T001956]
---

# Tasks: Fix E2E Smoke Test "Kontaktformular"

## Task 1: Root-Cause-Analyse
- [ ] Live-API-Endpoint `/api/contact` manuell testen (curl mit gültigen Daten)
- [ ] Rate-Limiter-Config prüfen (`checkRateLimit` mit5 Requests/60s)
- [ ] `createInboxItem` auf Fehler prüfen (DB-Verbindung, Schema)
- [ ] `sendAdminNotification` auf Fehler prüfen (catch-Handler)
- [ ] Test-Runner-Logs der fehlgeschlagenen CI-Runs analysieren (Run 29682467122, 29682590273)

## Task 2: Fix anwenden
- [ ] Basierend auf Root-Cause den passenden Fix implementieren
- [ ] Bei Rate-Limiting: Test-Submissions von Rate-Limit ausnehmen
- [ ] Bei Backend-Fehler: `createInboxItem`/`sendAdminNotification` reparieren

## Task 3: Test validieren
- [ ] E2E-Test lokal gegen Dev-Cluster laufen lassen
- [ ] E2E-Test gegen Live-Seite manuell validieren

## Task 4: CI-Gate prüfen
- [ ] Prüfen ob E2E ein required Check ist (`gh-axi pr list --state merged --limit 5`)
- [ ] Falls nicht required: Ticket erstellen für CI-Gate-Hinzufugung
