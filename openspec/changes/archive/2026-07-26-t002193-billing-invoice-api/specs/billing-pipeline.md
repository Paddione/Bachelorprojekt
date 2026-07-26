# billing-pipeline — Delta-Spec (T002193)

## Purpose

Härtet die Zahlungserfassung im Admin-Billing-UI ab: ein fehlgeschlagener
`fetch` (Netzwerkfehler, abgebrochene Verbindung, Auth-Redirect-Loop) beim
Erfassen einer Zahlung darf den "Speichern"-Button nicht dauerhaft im
"Speichert…"-Zustand hängen lassen.

## MODIFIED Requirements

### Requirement: Invoice Lifecycle — Partial and Full Payment via UI and API
<!-- e2e: fa-21-billing.spec.ts -->

The system SHALL transition an invoice from `open` to `partially_paid` after a partial payment and to `paid` after the remaining balance is settled; the admin invoice list SHALL reflect these status changes. If the `POST /api/admin/billing/:id/payments` request itself fails (network error, rejected fetch, or a non-JSON/redirect response caused by an expired session), the `RecordPaymentModal` SHALL re-enable the "Speichern" button and surface a Netzwerkfehler message instead of remaining stuck in the saving state.

#### Scenario: Teilzahlung dann Vollzahlung schaltet Status korrekt um *(E2E)*
- **GIVEN** ein authentifizierter Admin und eine finalisierte Rechnung über 100 EUR
- **WHEN** zunächst 40 EUR via `POST /api/admin/billing/:id/payments` erfasst werden und danach 60 EUR
- **THEN** zeigt die Zeile in `/admin/rechnungen` nach der ersten Zahlung „Teilbezahlt" und nach der zweiten Zahlung „Bezahlt"

#### Scenario: Überzahlung via API wird abgelehnt *(E2E)*
- **GIVEN** ein authentifizierter Admin und eine finalisierte Rechnung über 100 EUR mit 80 EUR Vorbelastung
- **WHEN** eine weitere Zahlung von 50 EUR via `POST /api/admin/billing/:id/payments` versucht wird
- **THEN** antwortet der Endpunkt mit HTTP 400 und die Antwort enthält den Text „exceeds outstanding"

#### Scenario: Fetch-Rejection blockiert den Speichern-Button nicht mehr
- **GIVEN** das Admin-Billing-UI mit geöffnetem `RecordPaymentModal`
- **WHEN** der `fetch`-Aufruf gegen `/api/admin/billing/:id/payments` mit einer Exception fehlschlägt (Netzwerkfehler oder Auth-Redirect-Loop)
- **THEN** wird `saving` wieder auf `false` gesetzt und der Button ist erneut klickbar
- **AND** wird die Fehlermeldung „Netzwerkfehler — Zahlung konnte nicht gespeichert werden." angezeigt
