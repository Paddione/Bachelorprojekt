# Delta: mishap-tracking

## MODIFIED Requirements

### Requirement: Factory-Fix-Tickets verwenden nicht plan_staged ohne Plan

Factory-Fix-Tickets, die von `mishap.go` aus nicht-kritischen Mishaps erzeugt werden, MÜSSEN
`status=triage` verwenden. `status=plan_staged` ist ausschließlich Tickets vorbehalten, die via
`stage-plan.sh` mit validiertem `--plan` und `--branch` gestaged wurden.

#### Scenario: drift-Mishap erzeugt triage-Ticket

- **GIVEN** ein nicht-kritischer Mishap vom Typ `drift` wird via `report_mishap` gemeldet
- **AND** der Buffer-Schwellwert (10) ist erreicht
- **WHEN** `buildFactoryFixTicketArgs` die Ticket-Args baut
- **THEN** das Ticket hat `--status triage`
- **AND** das Ticket hat NICHT `--status plan_staged`

#### Scenario: Rollup-Container bleibt plan_staged

- **GIVEN** der Mishap-Rollup-Container wird via `buildCreateRollupTicketArgs` angelegt
- **WHEN** die Args gebaut werden
- **THEN** der Container hat `--status plan_staged` (unverändert)
- **AND** der Container wird weiterhin von `mishap-rollup.sh` verwaltet

#### Scenario: Incident-Tickets unverändert

- **GIVEN** ein Incident-Mishap (`broken`, `security`) wird gemeldet
- **WHEN** `buildIncidentTicketArgs` die Ticket-Args baut
- **THEN** das Ticket hat `--status triage` (unverändert)
- **AND** `--attention-mode needs_human` (unverändert)
