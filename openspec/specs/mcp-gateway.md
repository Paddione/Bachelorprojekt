# mcp-gateway

<!-- baseline SSOT — aktualisiert 2026-07-27 (T002321): Monolith läuft nachweislich weiter, Dekommissionierungs-Notiz war unzutreffend -->

## Purpose

Das MCP-Gateway stellt MCP-Server (PostgreSQL, GitHub, Browser, Kubernetes) als lokale CLI-Prozesse bereit, die auf dem WSL-Host laufen und über `localhost:{port}/mcp` erreichbar sind. Die Server sind in `.mcp.json` konfiguriert. Die Absicherung im Dev-Cluster erfolgt über einen `--skip-auth-route`-Bypass auf dem `oauth2-proxy-dev`, der die vier MCP-Pfade am OIDC-Gate vorbeileitet.

> **Architektur-Notiz (korrigiert T002321):** Der `claude-code-mcp-monolith` Kubernetes-Pod (Supergateway-basiert, Manifest `k3d/default/claude-code-mcp-monolith-deploy.yaml`) läuft weiterhin aktiv im `fleet`-Cluster (Namespace `default`) — die frühere Notiz vom 2026-06-22, wonach dieser Pod ausser Betrieb genommen worden sei, war unzutreffend. Die Ablösung durch die lokalen CLI-Prozesse ist unter T002311/T002312 noch zur Entscheidung offen, nicht vollzogen. Beide Betriebsformen existieren aktuell parallel: lokale CLI-MCP-Server auf dem WSL-Host (primär genutzt) und der In-Cluster-Monolith (weiterhin ausgeliefert und aktiv).
>
> **Apply-Weg:** `k3d/default/` wird von keiner Overlay- (`prod-fleet/*`) oder Flux-Kustomization referenziert — die Ressourcen gehen **nicht** über die Flux-GitOps-Pipeline live. Änderungen an `k3d/default/claude-code-mcp-monolith-deploy.yaml` werden erst wirksam nach einem expliziten manuellen `kubectl apply -k k3d/default --context fleet`.

---

## Requirements

### Requirement: OAuth2 Proxy MCP Path Bypass

The system SHALL configure the `oauth2-proxy-dev` with a `--skip-auth-route` argument that bypasses OIDC authentication for the four MCP path prefixes (`kubernetes`, `postgres`, `github`, `browser`).

#### Scenario: Skip-Auth-Route im Dev-Stack konfiguriert

- **GIVEN** die `k3d/dev-stack/oauth2-proxy-dev.yaml` wird auf `--skip-auth-route`-Argumente geprüft
- **WHEN** die Datei auf das Argument geprüft wird
- **THEN** enthält sie `--skip-auth-route=^/(kubernetes|postgres|github|browser)`, sodass lokale CLI-MCP-Clients die OIDC-Schicht umgehen

#### Scenario: Fehlender Bypass blockiert MCP-Clients

- **GIVEN** die `k3d/dev-stack/oauth2-proxy-dev.yaml` enthält das `--skip-auth-route`-Argument nicht
- **WHEN** ein lokaler MCP-Client eine Verbindung aufbaut
- **THEN** scheitert die Verbindung am OIDC-Gate mit HTTP 302 (Redirect zu Pocket ID)

---

### Requirement: Ops Agent Output-Trust Guardrails
<!-- bats: agent-ops-output-trust.bats -->

The system SHALL maintain an explicit output-trust and shell-session-integrity discipline in the `bachelorprojekt-ops` agent system prompt so that the agent never fabricates a diagnosis from unverified shell output.

#### Scenario: Agent-Datei existiert und enthält Output-Trust-Sektion *(BATS)*
- **GIVEN** die Agent-Definition `.claude/agents/bachelorprojekt-ops.md` existiert
- **WHEN** der Dateiinhalt auf eine `## Output-Trust` / `## Shell-Session-Integrity`-Überschrift geprüft wird
- **THEN** ist eine entsprechende Sektion vorhanden

#### Scenario: Agent warnt vor echo-tem Input und stale PTY-Buffer *(BATS)*
- **GIVEN** die Agent-Definition existiert
- **WHEN** der Inhalt auf Warnungen zu echoed input oder stale PTY-Buffer geprüft wird
- **THEN** enthält die Datei explizite Hinweise auf dieses Desync-Risiko

#### Scenario: Agent verbietet das Fabricieren einer Diagnose aus unverifizierten Outputs *(BATS)*
- **GIVEN** die Agent-Definition existiert
- **WHEN** der Inhalt auf Verbote geprüft wird (never/do not fabricate/conclude/diagnose)
- **THEN** enthält die Datei ein explizites Verbot, eine Diagnose aus unverifizierten Shell-Ausgaben zu erstellen

#### Scenario: Agent schreibt triviale verifiable Probe vor *(BATS)*
- **GIVEN** die Agent-Definition existiert
- **WHEN** der Inhalt auf den Pflicht-Probe-Befehl geprüft wird
- **THEN** enthält die Datei `kubectl get nodes --context fleet` als ersten Verifizierungsschritt

#### Scenario: Agent weist an, die defekte Umgebung zu melden statt weiterzumachen *(BATS)*
- **GIVEN** die Agent-Definition existiert und die Shell-Session gibt unzuverlässige Ausgaben
- **WHEN** der Agent eine korrupte PTY-Session erkennt
- **THEN** schreibt der Agenten-Guide vor, die defekte Umgebung zu melden und abzubrechen statt eine Diagnose zu konstruieren

### Requirement: Self-built MCP servers must be referenced by PATH name, not absolute path

An MCP server built from this repository MUST be installed onto the `PATH` and referenced in
`docs/agent-guide/registry/mcp.yaml` by its command name. The registry MUST NOT contain an
absolute path under a user home directory.

An absolute path such as `/home/<user>/Bachelorprojekt/scripts/ticket-mcp/ticket-mcp-go` binds the
repository to one account and one checkout location. It also spreads: the same literal has to be
repeated in every harness config and in every task that verifies the server, so a move breaks
several files at once.

The install step MUST be best-effort rather than fatal: a host where the target directory is not
writable falls back to an already-installed binary instead of failing the task. `mcp-task-runner`
establishes this pattern.

#### Scenario: the registry references a repo-built server

- **GIVEN** `ticket-mcp` is built from `scripts/ticket-mcp/go`
- **WHEN** `docs/agent-guide/registry/mcp.yaml` declares its `command`
- **THEN** the value is the PATH name `ticket-mcp-go`, and `grep -c '/home/' ` over the registry
  returns 0

#### Scenario: the install target is not writable

- **GIVEN** a host on which `/usr/local/bin` is not writable and `sudo -n` is unavailable
- **WHEN** the build task runs
- **THEN** it reports that it keeps the pre-installed binary and exits successfully, rather than
  failing the whole task chain

#### Scenario: harness configs are regenerated from the registry

- **GIVEN** the registry command changed from an absolute path to a PATH name
- **WHEN** `task mcp:sync` runs
- **THEN** `.mcp.json`, `.opencode/opencode.jsonc` and `~/.gemini/config/mcp_config.json` carry the
  PATH name, and `task mcp:check` reports no drift

<!-- merged from change delta mcp-gateway.md (f923f3af56ea) -->

### Requirement: mcp-postgres Brand Scope Is Declared

The `mcp-postgres` client entry in the MCP registry SSOT
(`docs/agent-guide/registry/mcp.yaml`) SHALL declare which brand database the server is
bound to, so that the binding is discoverable mechanically and not only in prose. The
declaration SHALL name the brand, the target database service, and the sanctioned read
path for the other brand.

#### Scenario: Registry declares brand and target database *(BATS)*

- **GIVEN** the registry file `docs/agent-guide/registry/mcp.yaml`
- **WHEN** the `clients.mcp-postgres` entry is parsed as YAML
- **THEN** it exposes a `brand` key with the value `mentolder`
- **AND** it exposes a non-empty `database` key naming the backing service

#### Scenario: Registry names the sanctioned korczewski read path *(BATS)*

- **GIVEN** the registry file `docs/agent-guide/registry/mcp.yaml`
- **WHEN** the `clients.mcp-postgres` entry is parsed as YAML
- **THEN** it exposes a non-empty `korczewski_path` key
- **AND** that value references the `workspace-korczewski` namespace

#### Scenario: Registry metadata does not change the rendered harness configs

- **GIVEN** the added brand-scope keys sit alongside `transport`, `endpoint` and `harness`
- **WHEN** `bash scripts/mcp-sync.sh check` runs
- **THEN** it reports no drift for `.mcp.json` and `.opencode/opencode.jsonc`

### Requirement: Ticket Reads Route To The Brand-Parametrised Tool

The MCP tool guide (`.claude/skills/references/mcp-tool-guide.md`) SHALL warn that
`mcp-postgres` is brand-scoped and SHALL direct ticket reads to `ticket-mcp` with an
explicit `brand` argument, because `external_id` values are unique only per brand and a
query for another brand's id silently returns the same-named row from the bound database.

#### Scenario: Guide carries the brand-scope warning *(BATS)*

- **GIVEN** the file `.claude/skills/references/mcp-tool-guide.md`
- **WHEN** its `mcp-postgres` section is read
- **THEN** it states that the server is bound to the mentolder database only
- **AND** it names the silent-wrong-row failure mode

#### Scenario: Guide prescribes ticket-mcp with explicit brand *(BATS)*

- **GIVEN** the file `.claude/skills/references/mcp-tool-guide.md`
- **WHEN** its guidance for ticket reads is read
- **THEN** it prescribes `ticket-mcp` with an explicit `brand` argument as the path for
  ticket reads
- **AND** it references ticket `T002278` as the origin of the rule

#### Scenario: Routing table does not advertise mcp-postgres for ticket queries *(BATS)*

- **GIVEN** the agent routing table in `CLAUDE.md`
- **WHEN** the `MCP-Primär` column is read
- **THEN** no row advertises `mcp-postgres` as the path for ticket queries

<!-- merged from change delta mcp-gateway.md (1f63f5987841) -->

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

### Requirement: MCP Monolith Deployment Reality In SSOT
<!-- bats: mcp-gateway.bats -->

The SSOT spec SHALL describe the actual deployment state of the MCP servers, so that
planning does not proceed against a decommissioning that never took effect.

#### Scenario: Spec behauptet keine unzutreffende Dekommissionierung *(BATS)*

- **GIVEN** `openspec/specs/mcp-gateway.md` trug die Notiz, der `claude-code-mcp-monolith`
  sei dekommissioniert, während das Deployment-Manifest weiter im Repo liegt und der Pod läuft
- **WHEN** der Spec gegen die Existenz von `k3d/default/claude-code-mcp-monolith-deploy.yaml` geprüft wird
- **THEN** ist die Aussage über den Betriebszustand des Monolithen mit dem Vorhandensein des
  Manifests konsistent

#### Scenario: Apply-Weg des Deployments ist dokumentiert *(BATS)*

- **GIVEN** `k3d/default/` wird von keiner Overlay- oder Flux-Kustomization referenziert
- **WHEN** der Spec auf den Deploy-Weg dieses Manifests geprüft wird
- **THEN** benennt er explizit, dass die Ressourcen manuell appliziert werden und nicht über
  die Flux-Pipeline live gehen

<!-- merged from change delta mcp-gateway.md (9835fa01f526) -->

<!-- merged from change delta mcp-gateway.md (00f08145b241) -->