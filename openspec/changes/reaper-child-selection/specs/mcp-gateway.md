## MODIFIED Requirements

### Requirement: MCP Postgres Bridge Child-Process Containment
<!-- bats: mcp-gateway.bats -->

The system SHALL prevent the `postgres` container of the `claude-code-mcp-monolith`
Deployment from accumulating unbounded `mcp-server-postgres` child processes, so that
per-request process spawning by `supergateway --stateless` cannot drive the container
cgroup into an OOMKill.

The reaper SHALL select only genuine child processes as kill candidates. It SHALL NOT
select the `supergateway` parent process, its own subshell, or any other process that
merely carries the string `mcp-server-postgres` somewhere in its command line.

The reaper's candidate selection SHALL be verifiable by an automated test against a
synthetic process tree, so that a selection defect cannot pass CI as a green build.

#### Scenario: Reaper selektiert ausschliesslich echte Children *(BATS)*

- **GIVEN** ein Prozessbaum, in dem `supergateway` als PID 1 den gesuchten Namen in
  seinem `--stdio`-Argument fuehrt, eine Reaper-Subshell die cmdline des Start-Skripts
  geerbt hat und mehrere echte Children als `node /usr/local/bin/mcp-server-postgres`
  mit `ppid=1` laufen
- **WHEN** die Auswahllogik des Reapers gegen diesen Baum ausgefuehrt wird
- **THEN** enthaelt die Kandidatenliste ausschliesslich die echten Children, und weder
  PID 1 noch die Reaper-Subshell erscheinen darin

#### Scenario: Auswahl haengt an argv[1], nicht an der vollen cmdline *(BATS)*

- **GIVEN** der Parent traegt den gesuchten Namen erst in `argv[2]`, das Start-Skript
  ebenfalls erst in `argv[2]`, und nur echte Children tragen ihn in `argv[1]`
- **WHEN** das Start-Kommando des `postgres`-Containers geprueft wird
- **THEN** selektiert es Kandidaten ueber `argv[1]` und schliesst zusaetzlich `pid = 1`
  sowie die eigene PID explizit aus

#### Scenario: Mengengrenze faengt einen Request-Burst ab *(BATS)*

- **GIVEN** Children entstehen in Schueben, sodass innerhalb der Altersschwelle mehr
  entstehen koennen, als das Speicherlimit traegt
- **WHEN** die Zahl lebender Children eine konfigurierte Obergrenze ueberschreitet
- **THEN** beendet der Reaper die aeltesten Children, bis die Obergrenze wieder
  eingehalten ist, auch wenn diese juenger als die Altersschwelle sind

#### Scenario: Altersschwelle liegt ueber dem Query-Timeout *(BATS)*

- **GIVEN** ein legitimer Langlaeufer darf nicht von der Altersstufe getroffen werden
- **WHEN** Altersschwelle und `statement_timeout` aus dem Manifest verglichen werden
- **THEN** liegt die Altersschwelle echt ueber dem Query-Timeout

#### Scenario: Auswahllogik ist gegen ein Fixture ausfuehrbar *(BATS)*

- **GIVEN** die Reaper-Schleife liest den Prozessbaum unter einem konfigurierbaren
  Wurzelpfad statt hart unter `/proc`
- **WHEN** ein Test diesen Wurzelpfad auf ein Fixture-Verzeichnis umbiegt
- **THEN** laesst sich die Auswahl ohne laufenden Container pruefen, und der
  Produktions-Default bleibt `/proc`

#### Scenario: Auswahl wird gegen echtes procfs geprueft, nicht nur gegen ein Fixture *(BATS)*

- **GIVEN** ein Fixture aus regulaeren Dateien bildet procfs-Semantik nicht ab — dort
  meldet `/proc/<pid>/cmdline` `st_size = 0` trotz Inhalt, sodass ein groessenbasierter
  Guard im Fixture gruen liefe und im Container stumm nichts selektierte
- **WHEN** die Auswahllogik zusaetzlich in einem Container mit echten Prozessen und
  echtem procfs ausgefuehrt wird
- **THEN** stirbt genau der als `mcp-server-postgres` laufende Kindprozess, waehrend der
  Parent und die Reaper-Subshell weiterlaufen

#### Scenario: Paketversionen sind gepinnt *(BATS)*

- **GIVEN** das Start-Kommando des `postgres`-Containers installiert `supergateway`
  und `@modelcontextprotocol/server-postgres` zur Laufzeit
- **WHEN** die Installationszeile geprueft wird
- **THEN** traegt jedes Paket eine explizite Version (`name@x.y.z`), sodass das
  Laufzeitverhalten reproduzierbar ist und nicht vom jeweils aktuellen npm-Release abhaengt

#### Scenario: Memory-Limit macht einen Regress schnell sichtbar *(BATS)*

- **GIVEN** der Leak fuellte bei 2Gi rund 10 Stunden, bevor er sichtbar wurde, und ein
  Child kostet im cgroup rund 13 MB statt der urspruenglich angenommenen 54 MB
- **WHEN** das `resources.limits.memory` des `postgres`-Containers geprueft wird
- **THEN** liegt es unterhalb von 2Gi, sodass ein erneutes Prozess-Wachstum in Stunden
  statt Tagen auffaellt, und oberhalb des gemessenen Bedarfs des Normalbetriebs

#### Scenario: Child-Count ist beobachtbar *(BATS)*

- **GIVEN** ein OOMKill erreicht den Aufrufer nur als "transport dropped mid-call"
- **WHEN** das Start-Kommando des `postgres`-Containers geprueft wird
- **THEN** enthaelt es eine periodische Ausgabe von Child-Count und RSS-Summe auf stdout,
  sodass der Anstieg in den Container-Logs vor dem Kill erkennbar ist
