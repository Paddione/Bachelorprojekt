# Proposal: mcp-postgres-multistatement

## Why

Beim repo-hygiene-Lauf 2026-08-14 lieferte ein `mcp__mcp-postgres__query`-Aufruf
mit vier durch Semikolon getrennten Statements `[]` zurück — ununterscheidbar
von einem leeren Ergebnis. COUNT-Queries liefern immer mindestens eine Zeile,
daher ist `[]` nachweislich kein Messwert. Das ist die verifizierte Instanz der
Runbook-Grundregel „leere Antwort muss von negativer unterscheidbar sein"
(repo-hygiene-ops §3): Der Adapter soll Multi-Statement ablehnen (Fehler)
statt ein leeres Array zu liefern.

## What

- `scripts/mcp-gateway/mcp-postgres-local.mjs`: Multi-Statement-Erkennung mit
  JSON-RPC-Fehler statt leerem Array — präventiv vor der Ausführung (Semikolon
  mit nachfolgendem Inhalt, außerhalb von String-Literalen und Kommentaren;
  Trailing Semicolon bleibt erlaubt) plus defensive Absicherung nach der
  Ausführung (pg liefert bei Multi-Statement ein Array von Results).
- BATS-Tests `tests/spec/mcp-gateway/mcp-postgres-multistatement.bats`
  (Rot-Grün-Test mit DB-Guard, CI-wirksamer Test des präventiven Pfads ohne DB).
- Requirement-Delta auf `openspec/specs/mcp-gateway.md`.

_Ticket: T006293_
