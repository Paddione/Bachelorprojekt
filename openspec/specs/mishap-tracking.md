# mishap-tracking

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu mishap-tracking ergänzen._

## Requirements

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

<!-- merged from change delta mishap-tracking.md (401b41da6e36) -->

### Requirement: Der Mishap-Buffer aggregiert, er konvertiert nicht

Beim Erreichen des Buffer-Schwellwerts MUST `report_mishap` die gepufferten Einträge
ausschließlich als **einen** Kommentar an den Rollup-Container anhängen. Es MUST NOT für
einzelne Buffer-Einträge zusätzlich eigenständige Tickets angelegt werden. Dasselbe gilt für
`FlushStaleBuffer`. Damit verhalten sich alle drei Abflusspfade (Schwelle, Watchdog,
manueller `flush_mishap_buffer`) gleich und entsprechen der Zusage des `mishap-tracker`-Skills.

Incident-Mishaps (`incident`, `broken`, `security`) sind davon nicht berührt: sie gehen am
Buffer vorbei und legen weiterhin je ein Ticket über `createIncidentTicket` an.

#### Scenario: Schwellwert erreicht — ein Append, keine Einzeltickets

- **GIVEN** zehn nicht-kritische Mishaps sind über `report_mishap` gemeldet worden
- **AND** `ticket.sh` ist durch einen protokollierenden Stub ersetzt (`TICKET_SH`, `TICKET_MCP_REPO_ROOT`)
- **WHEN** der Buffer-Schwellwert erreicht wird
- **THEN** das Aufruflog enthält genau einen Rollup-Container-Append mit allen zehn Einträgen
- **AND** das Aufruflog enthält null Aufrufe mit `create --type fix`

#### Scenario: Watchdog-Flush verhält sich wie der Schwellwert-Pfad

- **GIVEN** ein überalteter Buffer wird von `FlushStaleBuffer` verarbeitet
- **WHEN** der Flush ausgeführt wird
- **THEN** das Aufruflog enthält genau einen Rollup-Container-Append
- **AND** das Aufruflog enthält null Aufrufe mit `create --type fix`

#### Scenario: Incident-Pfad bleibt unverändert

- **GIVEN** ein Mishap vom Typ `broken` wird gemeldet
- **WHEN** `report_mishap` ausgeführt wird
- **THEN** genau ein Ticket wird angelegt
- **AND** der Buffer bleibt unverändert

### Requirement: Dublettenerkennung vergleicht Komponente und Dateipfade, nicht nur Titel

Das System MUST einen Ähnlichkeitsvergleich als `ticket.sh find-similar` bereitstellen, der
zwei Tickets als Dublettenkandidaten meldet, wenn ihre `component`/`areas` übereinstimmen
UND mindestens ein in beiden Beschreibungen genannter Dateipfad übereinstimmt. Der
Titelvergleich (case-insensitiv, Whitespace-normalisiert) bleibt als eigene, vorgelagerte
Stufe erhalten.

Der Vergleich MUST NOT die Anlage eines Tickets verhindern, außer bei exakter Titelgleichheit
mit einem offenen Ticket — dieses Verhalten bleibt unverändert. Ein Treffer der Heuristik
führt zur regulären Anlage plus einer `relates_to`-Kante und einem Kommentar, der den
Kandidaten benennt. Ein automatisches Schließen oder Unterdrücken auf Ähnlichkeitsbasis
ist nicht zulässig.

Der Vergleich MUST ohne Netzzugriff auskommen. Embedding-basierte Verfahren dürfen im
unbeaufsichtigten Schreibpfad (`mishap.go`) nicht aufgerufen werden.

#### Scenario: Verschieden formulierte Titel derselben Beobachtung werden erkannt

- **GIVEN** ein Fixture-Korpus mit neun verifizierten Dublettenpaaren, deren Titel jeweils unterschiedlich formuliert sind
- **WHEN** `ticket.sh find-similar --corpus <fixture>` ausgeführt wird
- **THEN** alle neun Paare werden als Kandidaten gemeldet

#### Scenario: Verwandte, aber verschiedene Befunde werden nicht gemeldet

- **GIVEN** derselbe Fixture-Korpus enthält drei verifizierte Nicht-Dublettenpaare derselben Komponente
- **WHEN** `ticket.sh find-similar --corpus <fixture>` ausgeführt wird
- **THEN** keines dieser drei Paare wird als Kandidat gemeldet

#### Scenario: Heuristik-Treffer blockiert die Anlage nicht

- **GIVEN** ein Incident-Mishap, dessen Komponente und Dateipfad zu einem offenen Ticket passen
- **AND** die Titel unterscheiden sich
- **WHEN** `createIncidentTicket` ausgeführt wird
- **THEN** ein neues Ticket wird angelegt
- **AND** eine `relates_to`-Kante zum Kandidaten wird gesetzt

### Requirement: Die Go-Tests des ticket-mcp laufen in CI

Die Testsuite unter `scripts/ticket-mcp/go` MUST von einem Runner aufgerufen werden, den CI
ausführt. Ein Testziel, das in keinem Runner registriert ist, ist kein Gate.

#### Scenario: CI ruft die ticket-mcp-Go-Tests auf

- **GIVEN** die Go-Toolchain ist verfügbar
- **WHEN** die CI-Konfiguration und die Taskfile-Ziele ausgewertet werden
- **THEN** ein Ziel ruft die Testsuite unter `scripts/ticket-mcp/go` auf
- **AND** dieses Ziel ist aus `.github/workflows/ci.yml` erreichbar

<!-- merged from change delta mishap-tracking.md (a37f7d82bb63) -->