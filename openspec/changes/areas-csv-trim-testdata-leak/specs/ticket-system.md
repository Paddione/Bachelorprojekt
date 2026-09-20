## ADDED Requirements

### Requirement: DB-gestuetzte BATS-Tests raeumen im selben Kontext auf, in den sie schreiben

BATS-Tests unter `tests/spec/ticket-system/`, die per `scripts/ticket.sh create` (oder einen
anderen Schreib-Unterbefehl) Zeilen in der Ticket-DB anlegen, MUESSEN ihren Aufraeum-Kontext
(`kubectl --context ...`) aus derselben Variable und demselben Default ableiten, den
`scripts/ticket.sh` selbst fuer den Schreibzugriff verwendet
(`scripts/vda/ticket/_ticket-core.sh`: `CTX="${TICKET_CTX:-fleet}"`). Ein abweichender
Kontext im Teardown fuehrt zu einem Teardown, der ohne Fehler durchlaeuft, aber keine Zeile
trifft.

#### Scenario: areas-csv-trim.bats hinterlaesst nach einem Lauf keine Testzeile in der Ziel-DB

- **GIVEN** `tests/spec/ticket-system/areas-csv-trim.bats` legt ueber `scripts/ticket.sh create`
  eine Zeile mit dem Titel `T004894 areas-csv-trim testrow` an
- **WHEN** der Test durchlaeuft (inklusive Teardown)
- **THEN** liefert eine Abfrage nach diesem Titel gegen den Kontext, in den `ticket.sh`
  tatsaechlich geschrieben hat (`${TICKET_CTX:-fleet}`), null Zeilen
