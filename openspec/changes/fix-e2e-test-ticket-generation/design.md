## Context

Der aktuelle E2E-Test `tests/e2e/specs/fa-26-bug-report-form.spec.ts` erzeugt ein wiederkehrendes Ticket ohne ausreichend Kontext, wenn die `CRON_SECRET` fehlt. Zudem wird der Test aktuell ausgeführt, wenn das Secret vorhanden ist, was in Produktionsumgebungen zu echten Ticket-Erstellungen führen kann.

## Goals / Non-Goals

**Goals:**
- Die Testlogik anpassen, sodass der Test übersprungen wird, wenn `CRON_SECRET` vorhanden ist (Produktionsumgebung).
- Die Testbeschreibung spezifischer gestalten, um die Übersichtlichkeit der Tickets zu verbessern.

**Non-Goals:**
- Änderungen an der eigentlichen API-Logik des Bug-Reports.
- Einführung neuer Testfälle.

## Decisions

- **Skip-Logik**: Die Bedingung in `test.skip` wird umgekehrt. Statt `!markerAvailable()` wird `markerAvailable()` verwendet. Damit wird der Test in Umgebungen, in denen das Secret vorhanden ist (Produktion), übersprungen.
- **Beschreibung**: Die `description` des Testfalls wird auf "Automatischer E2E-Test für Bug-Report-Formular: Seite lädt nicht korrekt." aktualisiert.

## Risks / Trade-offs

- [Risk] Der Test wird in Umgebungen übersprungen, in denen das Secret vorhanden ist. → Mitigation: Der Fokus liegt auf der lokalen Entwicklung und der Verifizierung des API-Contracts in Nicht-Produktionsumgebungen.
