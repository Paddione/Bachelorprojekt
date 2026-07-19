---
status: planning
slug: fix-e2e-kontaktformular
related_tickets: [T001956]
---

# Fix E2E Smoke Test "Kontaktformular" (FA-10 T6)

## Purpose

Der Playwright-E2E-Smoke-Test T6 ("Valid form submission succeeds") schlägt reproduzierbar gegen die Live-Produktionsseite `https://web.mentolder.de` fehl. Das erwartete Erfolgselement `.cf-result.is-success` mit Text "Vielen Dank" erscheint nicht innerhalb von 60s. Der Fehler tritt auf zwei inhaltlich unabhängigen Branches identisch auf, was auf ein echtes Problem in der Live-Umgebung hindeutet.

## Requirements

1. **Root-Cause-Analyse**: Identifizieren, warum die Formular-Submission auf der Live-Seite kein Success-Element erzeugt (Rate-Limiting, Backend-Fehler, API-Endpoint-Problem)
2. **Fix anwenden**: Behebung des identifizierten Problems
3. **Test validieren**: E2E-Test Against Live-Seite grün bekommen
4. **CI-Gate prüfen**: Klären, ob E2E PR ein required Check für Auto-Merge ist

## Scenarios

### GIVEN die Live-Seite ist erreichable
- WHEN der E2E-Test T6 gegen `https://web.mentolder.de` läuft
- THEN erscheint `.cf-result.is-success` mit Text "Vielen Dank" innerhalb von 60s

### GIVEN der API-Endpoint `/api/contact` wird mit gültigen Daten aufgerufen
- WHEN die Rate-Limit-Grenze nicht überschritten ist
- THEN gibt der Endpoint 200 mit `{ success: true }` zurück

### GIVEN E2E-Test-Header `X-E2E-Test:1` und `X-Cron-Secret` sind gesetzt
- WHEN die Submission erfolgreich ist
- THEN wird die Datenbankzeile als `is_test_data=true` markiert (Purge-Bracket)
