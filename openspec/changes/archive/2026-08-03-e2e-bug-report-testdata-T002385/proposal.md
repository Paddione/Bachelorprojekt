# Proposal: e2e-bug-report-testdata-T002385

## Why

Der E2E-Test FA-26 (bug-report-form) POSTet gegen die Live-Brand-API und erzeugt dabei reale Ticket-Zeilen in `tickets.tickets`. Titel und Description sind wörtlich der Testfall-Payload — kein Test-Suffix, kein Indicator.

## What

- E2E-Test so umstellen, dass er einen erkennbaren Test-Indikator setzt (z.B. Titel-Präfix "[E2E]")
- ODER Test-Daten nach dem Testlauf aufräumen (DELETE /api/admin/tickets/:id)
- T002384 als Test-Daten-Ticket schließen

_Ticket: T002385_
