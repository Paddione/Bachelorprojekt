## Why

Der aktuelle E2E-Test für das Bug-Report-Formular erzeugt in der Testumgebung ein wiederkehrendes Ticket ohne ausreichenden Kontext. Dies führt zu einer unübersichtlichen Ticket-Backlog. Zudem besteht das Risiko, dass der Test in Produktionsumgebungen (erkennbar am Vorhandensein von `CRON_SECRET`) echte Tickets erstellt, was nicht erwünscht ist.

## What Changes

- Aktualisierung der Testbeschreibung in `tests/e2e/specs/fa-26-bug-report-form.spec.ts`, um spezifischer zu sein.
- Anpassung der Testlogik, um die Ausführung zu überspringen, wenn `CRON_SECRET` vorhanden ist (Produktionsumgebung), um die Erstellung realer Tickets zu verhindern.

## Capabilities

### New Capabilities

### Modified Capabilities
- `bug-report-e2e`: Die Testanforderungen für das Bug-Report-Formular werden angepasst, um spezifischer zu sein und in der Produktion sicher zu laufen.

## Impact

- `tests/e2e/specs/fa-26-bug-report-form.spec.ts`
- Ticket-Backlog (Reduktion von Rauschen)
- Produktionsumgebung (Sicherheit vor automatischen Ticket-Erstellungen)
