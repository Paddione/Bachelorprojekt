# Proposal: areas-csv-trim-testdata-leak

## Why

`tests/spec/ticket-system/areas-csv-trim.bats` legt bei jedem Lauf eine Ticketzeile mit
`ticket.sh create` an. Der Teardown loescht sie ueber `kubectl exec ... --context
"${FACTORY_CTX:-devmesh}"`, waehrend `ticket.sh create` selbst ihren Schreibkontext ueber
`${TICKET_CTX:-fleet}` aufloest (`scripts/vda/ticket/_ticket-core.sh:11`). Beide Variablen
sind verschieden benannt und haben verschiedene Defaults, der Test schreibt also nach
`fleet`, der Teardown loescht gegen `devmesh` — er meldet Erfolg und trifft nichts. Jeder
Lauf hinterlaesst zwei neue Zeilen in der echten Ticket-SSOT (fleet); vier davon standen
2026-09-20 als offene Tickets in der Triage-Liste (T900241, T900242, T900244, T900245,
inzwischen manuell als obsolete geschlossen). `tests/spec/ticket-system/backfill-id-sequence.bats`
hat denselben Einzeiler und denselben Aufrufpfad.

## What

`CTX="${FACTORY_CTX:-devmesh}"` wird in beiden Dateien durch `CTX="${TICKET_CTX:-fleet}"`
ersetzt — dieselbe Kontext-Aufloesung, die `scripts/ticket.sh` selbst benutzt — damit
Teardown/`psql_q` denselben Kontext treffen, in den `ticket.sh` tatsaechlich schreibt. Ein
neuer Test in `areas-csv-trim.bats` prueft nach einem vollstaendigen Lauf direkt gegen die
tatsaechliche Ziel-DB, dass keine Zeile mit dem Testtitel uebrigbleibt (Positiv-Anker statt
"Teardown lief fehlerfrei"). `scripts/ticket.sh` selbst wird nicht angefasst.

_Ticket: T900250_
