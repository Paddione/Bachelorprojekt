# Proposal: fa-bug-notify-e2e-seed

## Why

Der nightly E2E-Test `fa-bugs-notifications.spec.ts` (FA-bug-notify, läuft gegen
beide Brands auf `fleet`) seedet sein Test-Ticket über die öffentliche
`POST /api/bug-report`-Route. Dieser Pfad hat kein sofortiges Cleanup — das
Ticket bleibt bis zum nächsten, verzögerten Purge-Sweep-Bracket
(`tickets.fn_purge_test_data()`) live in der DB, mit einem fix verdrahteten,
nichtssagenden Titel. In diesem Zeitfenster landet die Test-Fixture als
normal aussehendes, aktionables Ticket im `triage`-Queue — Agenten/Menschen
untersuchen es fälschlich als echtes Ticket (siehe T001751, gefunden während
dieser Untersuchung). Der frühere Fix T001210 (Title-Dedupe-Guard) bekämpfte
nur das Symptom (mehrere gleichnamige Tickets), nicht die Ursache.

## What

`fa-bugs-notifications.spec.ts` wird auf das bereits etablierte
Direct-DB-Seed-Muster umgestellt (siehe `fa-fragebogen.spec.ts`, T000703):
Ticket-Erzeugung per direktem `INSERT INTO tickets.tickets (...) is_test_data=true`
statt `POST /api/bug-report`, plus `afterEach`-Cleanup, das die Zeile per
`external_id` sofort löscht — Erfolg wie Fehlschlag. Der serverseitige
Purge-Sweep bleibt nur noch Backstop für den Crash-Fall.

_Ticket: T001754_
