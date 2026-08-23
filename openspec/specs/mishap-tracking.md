# mishap-tracking

## Purpose

Verfolgung von Ausführungs-Frictions (Mishaps) über den `mishap-tracker`-Skill und die
ticket-mcp-Mishap-Werkzeuge: kritische Vorfälle (`incident`, `broken`, `security`) erzeugen
sofort ein menschlich zu triagendes Ticket; nicht-kritische Einträge laufen über einen
persistenten Buffer, dessen Abflusspfade ausschließlich protokollieren und verwerfen —
ohne Sammel-Container, ohne Ticket-Konvertierung [T014104]. Mishaps mit Ticket-Kontext
landen als Kommentar am Verursacher-Ticket.

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

#### Scenario: Incident-Tickets unverändert

- **GIVEN** ein Incident-Mishap (`broken`, `security`) wird gemeldet
- **WHEN** `buildIncidentTicketArgs` die Ticket-Args baut
- **THEN** das Ticket hat `--status triage` (unverändert)
- **AND** `--attention-mode needs_human` (unverändert)

### Requirement: Der Mishap-Buffer aggregiert, er konvertiert nicht

Beim Erreichen des Buffer-Schwellwerts MUST `report_mishap` die gepufferten Einträge
ausschließlich auf stderr protokollieren und verwerfen. Es MUST NOT für einzelne Buffer-Einträge
eigenständige Tickets angelegt werden, und es MUST NOT einen Sammel-Container-Append geben —
ein Rollup-Container existiert seit T014104 nicht mehr. Dasselbe gilt für `FlushStaleBuffer`
und den manuellen `flush_mishap_buffer`. Damit verhalten sich alle drei Abflusspfade
(Schwelle, Watchdog, manueller Flush) gleich und entsprechen der Zusage des
`mishap-tracker`-Skills.

Incident-Mishaps (`incident`, `broken`, `security`) sind davon nicht berührt: sie gehen am
Buffer vorbei und legen weiterhin je ein Ticket über `createIncidentTicket` an.

#### Scenario: Schwellwert erreicht — Protokollierung und Verwerfen, keine Konvertierung

- **GIVEN** zehn nicht-kritische Mishaps sind über `report_mishap` gemeldet worden
- **AND** `ticket.sh` ist durch einen protokollierenden Stub ersetzt (`TICKET_SH`, `TICKET_MCP_REPO_ROOT`)
- **WHEN** der Buffer-Schwellwert erreicht wird
- **THEN** werden alle zehn Einträge auf stderr protokolliert
- **AND** das Aufruflog enthält null Aufrufe mit `create --type fix`
- **AND** das Aufruflog enthält null Aufrufe mit `rollup-container`
- **AND** der Buffer enthält danach nur die nach dem Schwellwert gemeldeten Einträge

#### Scenario: Watchdog-Flush verhält sich wie der Schwellwert-Pfad

- **GIVEN** ein überalteter Buffer wird von `FlushStaleBuffer` verarbeitet
- **WHEN** der Flush ausgeführt wird
- **THEN** werden alle Einträge auf stderr protokolliert und verworfen
- **AND** das Aufruflog enthält null Aufrufe mit `create --type fix`
- **AND** das Aufruflog enthält null Aufrufe mit `rollup-container`

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

### Requirement: Nicht-kritische Mishaps werden am Verursacher-Ticket vermerkt

Ein nicht-kritischer Mishap, der während der Bearbeitung eines Tickets auftritt, SHALL als
Kommentar an genau dieses Ticket geschrieben werden. Es SHALL kein Sammel-Container, kein
Zyklus-Plan und kein eigenes Folge-Ticket dafür erzeugt werden.

Fehlt der Ticket-Kontext, SHALL der Mishap auf stderr protokolliert und verworfen werden. Das
Fehlen eines Ticket-Kontexts SHALL NICHT dazu führen, dass ein Ticket angelegt wird.

#### Scenario: Mishap mit Ticket-Kontext landet als Kommentar

- **GIVEN** `scripts/hooks/mishap-tracker.sh` läuft am Ende eines dev-flow-Skills
- **AND** die Umgebung trägt eine Ticket-ID des bearbeiteten Tickets
- **AND** ein nicht-kritischer Mishap-Eintrag liegt vor
- **WHEN** der Tracker den Eintrag verarbeitet
- **THEN** ruft er `ticket.sh comment` mit genau dieser Ticket-ID auf
- **AND** legt kein weiteres Ticket an

#### Scenario: Mishap ohne Ticket-Kontext erzeugt kein Ticket

- **GIVEN** `scripts/hooks/mishap-tracker.sh` läuft ohne Ticket-ID in der Umgebung
- **AND** ein nicht-kritischer Mishap-Eintrag liegt vor
- **WHEN** der Tracker den Eintrag verarbeitet
- **THEN** wird der Eintrag auf stderr protokolliert
- **AND** es wird kein Ticket und kein Container angelegt
- **AND** der Exit-Code ist 0

### Requirement: Kein Automat erzeugt Mishap-Sammelcontainer

Es SHALL keinen periodisch laufenden Prozess geben, der ein Sammel-Ticket für Mishaps anlegt,
einen Plan daraus generiert oder Einträge über Zyklen hinweg weiterreicht. Insbesondere SHALL
`scripts/factory/wakeup.sh` keinen Rollup-Generator aufrufen und `scripts/ticket.sh` kein
Kommando bereitstellen, das bei erfolgloser Suche ein Sammel-Ticket anlegt.

#### Scenario: wakeup.sh ruft keinen Rollup-Generator

- **GIVEN** das Repository auf `main`
- **WHEN** `scripts/factory/wakeup.sh` nach `mishap-rollup` durchsucht wird
- **THEN** enthält die Datei keinen Aufruf eines Rollup-Generators

#### Scenario: ticket.sh kennt kein rollup-container-Kommando

- **GIVEN** das Repository auf `main`
- **WHEN** `scripts/ticket.sh rollup-container` aufgerufen wird
- **THEN** ist der Exit-Code ungleich 0
- **AND** es wird kein Ticket mit dem Titel `Mishap Rollup — fortlaufende Sammlung` angelegt

<!-- merged from change delta mishap-tracking.md (8c4f04290a92) -->