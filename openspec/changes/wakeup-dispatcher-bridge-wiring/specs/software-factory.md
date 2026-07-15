## Purpose
Behebt einen Bug (T001845): `wakeup.sh` zwang das Modell bei jedem Dispatcher-Tick zu einem
`Workflow(dispatcher.js)`-Tool-Call, was gegen ein lokales Modell mit nicht-standardkonformer
Tool-Call-Syntax brach. `wakeup.sh` ruft den Dispatcher-Tick jetzt direkt über
`dispatcher-bridge.sh` in Bash auf — ohne LLM/Tool-Call-Umweg für den Tick selbst.

## MODIFIED Requirements

### Requirement: Dispatcher-Tick-Execution

The system SHALL execute exactly one Dispatcher tick per Timer-Aktivierung via `wakeup.sh`
under a `flock`-Sperre, sodass simultane Ticks ausgeschlossen sind. Der Timer re-armt erst
nach Tick-Ende (`OnUnitInactiveSec=10min`), und `RuntimeMaxSec=900s` killt hängende Runs.
`wakeup.sh` SHALL den Tick über `scripts/factory/dispatcher-bridge.sh` (Bash, kein
LLM/Tool-Call für den Tick selbst) dispatchen, statt das Modell zu einem
`Workflow(dispatcher.js)`-Tool-Call zu zwingen.

#### Scenario: Normaler Tick ohne parallele Instanz
- **GIVEN** der systemd-Timer `factory.timer` feuert
- **WHEN** keine andere Factory-Instanz läuft (`/tmp/factory-tick.lock` frei)
- **THEN** `wakeup.sh` erwirbt die flock-Sperre, entsperrt git-crypt und ruft
  `dispatcher-bridge.sh` mit dem präparierten `prep_file` auf

#### Scenario: Paralleler Start während laufendem Tick
- **GIVEN** ein Factory-Tick ist aktiv (flock-Sperre gehalten)
- **WHEN** der Timer erneut feuert (z.B. nach Reboot mit `Persistent=true`)
- **THEN** `wakeup.sh` beendet sich ohne Aktion (flock blockiert); kein doppelter Dispatch

#### Scenario: Leere Queue erfordert keinen LLM/Tool-Call
- **GIVEN** beide Brand-Queues sind leer (kein Ticket zum Dispatchen)
- **WHEN** `wakeup.sh` den Tick über `dispatcher-bridge.sh` startet
- **THEN** `dispatcher-bridge.sh` beendet sich mit Exit 0, ohne `claude`/`Workflow`
  aufzurufen — der Tick bleibt rein Bash-basiert
