# ticket-ops — Delta-Spec

## Purpose

Status-SSO-Konsolidierung (T008345, Review-Findings T007955): Die Status-Validierung
des `ticket triage`-Vorgangs liest ihr Vokabular aus der Website-SSO
`components/website/src/lib/tickets/statuses.json` — derselben Datei, die
`lib/tickets/status.ts` (TicketStatus-Union) importiert. Shell-Validierung und
TypeScript-Union sind damit strukturell auf eine maschinenlesbare Quelle reduziert;
ein Hardcode in `scripts/vda/ticket/triage.sh` ist entfernt.

## ADDED Requirements

### Requirement: TRIAGE-STATUS-SSO — Triage-Status-Validierung nutzt die Website-SSO

Die Status-Validierung des `ticket triage`-Vorgangs MUSS ihr Status-Vokabular aus
`components/website/src/lib/tickets/statuses.json` beziehen und darf keine
eigene, davon abweichende Status-Liste hardcoden.

#### Scenario: Ungültiger Status wird mit SSOT-Vokabular abgelehnt

- **GIVEN** ein Aufruf von `vda.sh ticket triage --status <wert>`
- **WHEN** `<wert>` nicht in `statuses.json` enthalten ist
- **THEN** bricht der Vorgang mit Exit-Code 2 ab und die Fehlermeldung listet die SSOT-Status

#### Scenario: Gültiger Status passiert die Validierung

- **GIVEN** ein Aufruf von `vda.sh ticket triage --status planning`
- **WHEN** `planning` in `statuses.json` enthalten ist
- **THEN** wird der Status nicht als ungültig abgelehnt und die Verarbeitung läuft weiter
