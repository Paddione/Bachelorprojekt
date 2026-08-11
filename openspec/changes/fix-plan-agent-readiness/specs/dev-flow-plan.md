## MODIFIED Requirements

### Requirement: Readiness-Flag-Verifikation (Read-After-Write)

Der Plan-Agent SHALL nach dem Setzen von Readiness-Flags die tatsaechlichen DB-Werte verifizieren,
bevor er Erfolg meldet. Die Rueckmeldung MUSS die DB-Wahrheit abbilden, nicht die beabsichtigten Werte.

#### Scenario: Readiness-Flags werden gesetzt und verifiziert

- **GIVEN** der Plan-Agent hat `set_readiness_flag` fuer alle vier DoR-Flags aufgerufen
  (`spec_skizziert`, `abhaengigkeiten_klar`, `offene_fragen_geklaert`, `aufwand_geschaetzt`)
- **WHEN** er eine Read-After-Write-Abfrage ausfuehrt (`SELECT readiness FROM tickets.tickets WHERE external_id = $TICKET_ID`)
- **THEN** alle vier DoR-Flags muessen den Wert `true` in der DB haben
- **AND** der Ticket-Status MUSS `plan_staged` sein

#### Scenario: Diskrepanz wird als Fehler gemeldet

- **GIVEN** ein Readiness-Flag wurde per `set_readiness_flag` gesetzt
- **WHEN** die Read-After-Write-Abfrage zeigt einen abweichenden Wert (z.B. `false` statt `true`)
- **THEN** der Plan-Agent MUSS mit Exit-Code 1 abbrechen
- **AND** die Fehlermeldung MUSS das betroffene Flag und den IST-Wert nennen
- **AND** die Rueckmeldung DARF NICHT die beabsichtigten Werte als DB-Wahrheit durchreichen

#### Scenario: Status wird verifiziert

- **GIVEN** der Plan-Agent hat `stage-plan` aufgerufen
- **WHEN** er eine Status-Abfrage ausfuehrt (`SELECT status FROM tickets.tickets WHERE external_id = $TICKET_ID`)
- **THEN** der Ticket-Status MUSS `plan_staged` sein
- **AND** bei Abweichung MUSS der Agent mit Exit-Code 1 abbrechen und den IST-Status melden
