# mcp-gateway

<!-- baseline SSOT — aktualisiert 2026-07-27 (T002321): Monolith läuft nachweislich weiter, Dekommissionierungs-Notiz war unzutreffend -->

## Purpose

Das MCP-Gateway stellt MCP-Server (PostgreSQL, GitHub, Browser, Kubernetes) über `localhost:{port}/mcp` bereit. Die Mehrzahl davon läuft als lokaler CLI-Prozess auf dem WSL-Host; **`mcp-kubernetes` (`:18080`) und `mcp-postgres` (`:13001`) jedoch nicht** — beide sind `kubectl port-forward`-Weiterleitungen auf `svc/claude-code-mcp-monolith` im Namespace `default` (T002307). Ihre wirksame Identität ist daher nicht die kubeconfig des Aufrufers, sondern die in-cluster ServiceAccount `claude-code-agent` (nur `get`/`list`/`watch`); `mcp-postgres` klammert zusätzlich jede Query in eine `READ ONLY`-Transaktion. Das erklärt, warum `pods_exec` und schreibende SQL dort strukturell scheitern. Die Server sind in `.mcp.json` konfiguriert. Die Absicherung im Dev-Cluster erfolgt über einen `--skip-auth-route`-Bypass auf dem `oauth2-proxy-dev`, der die vier MCP-Pfade am OIDC-Gate vorbeileitet.

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

### Requirement: verify-ticket-id.sh guards writes with a second-source read

A new script `scripts/verify-ticket-id.sh` SHALL verify that a given `external_id` exists as
a row in `tickets.tickets` using a `kubectl exec … psql` call (safe path — no port-forward)
before the caller proceeds with a write that depends on that ID. The script SHALL exit 0 when
the ticket exists, exit 1 when it does not (caller aborts write), and exit 2 on infrastructure
error (no pod found).

#### Scenario: Writes are gated behind a read-integrity guard

- **GIVEN** a write depends on an `external_id` that was read through `mcp__mcp-postgres__query`
  (port-forward path)
- **WHEN** the caller runs `scripts/verify-ticket-id.sh <external_id> [brand]` before the write
- **THEN** the script checks the DB via `kubectl exec…psql` and exits 0 only if the ticket
  actually exists
- **AND** the caller aborts the write if the script exits non-zero

### Requirement: mcp-tool-guide.md documents the verify-ticket-id.sh guard

The Port-Forward-Integrität section in `.claude/skills/references/mcp-tool-guide.md` SHALL
reference `scripts/verify-ticket-id.sh` by name and argument signature as the concrete
tool for the "Gegenprüfung" rule.

#### Scenario: A skill author needs to add the Gegenprüfung pattern

- **GIVEN** the reader is at the Port-Forward-Integrität section of `mcp-tool-guide.md`
- **WHEN** they reach the "Ein Read, dessen Ergebnis eine Schreiboperation steuert" rule
- **THEN** they see `scripts/verify-ticket-id.sh <external_id> [brand]` as the concrete
  invocation, with its exit-code contract documented

### Requirement: ticket-attach.sh filters on Running pods

`scripts/ticket-attach.sh` SHALL filter its `kubectl get pod` call with
`--field-selector status.phase=Running` so that a completed pod (from a prior rollout,
node drain, or eviction) does not sort before the live pod and cause `kubectl exec` /
`kubectl cp` to fail with "cannot exec into a container in a completed pod".

#### Scenario: A completed shared-db pod is present next to the live one

- **GIVEN** a Succeeded `shared-db-<old-revision>` pod and a Running `shared-db-<current>` pod
  in namespace `workspace`
- **WHEN** `scripts/ticket-attach.sh` resolves the pod with `kubectl get pod -l app=shared-db`
- **THEN** only the Running pod is returned (`--field-selector status.phase=Running`)
- **AND** `kubectl cp` and `kubectl exec` succeed against the live pod

### Requirement: update-status.sh uses heredoc and guards terminal transitions

`scripts/vda/ticket/update-status.sh` SHALL read the current status via heredoc SQL
(not `-c` flag) to avoid shell-quoting/port-forward issues. After reading, it SHALL enforce
that terminal tickets (`done`, `archived`) can only transition to `archived` — any other
transition SHALL exit 2 with a clear error message. Idempotent transitions
(`done→done`, `archived→archived`) SHALL be allowed.

#### Scenario: A caller tries to transition from done to in_progress

- **GIVEN** a ticket in status `done`
- **WHEN** `update-status.sh done in_progress` is called
- **THEN** the script exits 2 with "Cannot transition from 'done' to 'in_progress'"
- **AND** the database row is NOT modified

#### Scenario: A caller transitions from done to archived

- **GIVEN** a ticket in status `done` with `resolution = 'shipped'`
- **WHEN** `update-status.sh done archived` is called
- **THEN** the UPDATE runs and sets status to `archived`
- **AND** the resolution is preserved

<!-- merged from change delta mcp-gateway.md (984382d2c926) -->

### Requirement: HTTP MCP Client Header Declaration

The MCP registry SHALL support an optional `headers` map on any client with `transport: http`,
and the generators SHALL render that map into every harness config that supports request headers
(`claude_code`, `agy`, `opencode`). Header values MAY contain `${VAR}` environment references,
which the generators SHALL emit verbatim without expansion, so that no secret material is written
into a tracked file.

#### Scenario: Registry declares a bearer header for an authenticated HTTP server

- **GIVEN** the registry entry for `bge-mcp` declares `headers.Authorization: "Bearer ${BGE_MCP_TOKEN}"`
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** `.mcp.json` contains a `headers` object for `bge-mcp` whose `Authorization` value is the
  literal string `Bearer ${BGE_MCP_TOKEN}`, and `scripts/mcp-sync.sh check` reports no drift

#### Scenario: Header support is generic, not per-server

- **GIVEN** a registry contains an arbitrary `transport: http` client with two declared headers
- **WHEN** the generators render that registry
- **THEN** both headers appear unchanged in the generated config, without the client being named
  anywhere in the generator source

#### Scenario: No expanded secret reaches a tracked config

- **GIVEN** the generated `.mcp.json` declares one or more `Authorization` headers
- **WHEN** each header value is inspected
- **THEN** every value is an unexpanded `${VAR}` reference, and none contains a literal token

#### Scenario: Harness reaches the authenticated server

- **GIVEN** `BGE_MCP_TOKEN` is exported in the environment the harness was started from
- **WHEN** the harness performs the MCP `initialize` handshake against `127.0.0.1:13005`
- **THEN** the server answers `HTTP 200` instead of `HTTP 401`, and the tools `bge_embed` and
  `bge_rerank` are listed

#### Scenario: Servers without declared headers are unaffected

- **GIVEN** an existing `transport: http` client that declares no `headers` map
- **WHEN** the generators render it
- **THEN** its emitted config carries no `headers` key at all, byte-identical to the previous
  output, so that `check` stays green for every untouched server

### Requirement: Generator Output Redirection For Testing

`scripts/mcp-sync.sh` SHALL honour the environment overrides `MCP_REGISTRY` (source registry path)
and `MCP_OUT_DIR` (target root directory) so that `render` can be exercised against a fixture
registry without writing to the real harness configs.

#### Scenario: Render writes to an alternate output root

- **GIVEN** `MCP_REGISTRY` points at a fixture registry and `MCP_OUT_DIR` at a temporary directory
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** the generated configs appear beneath the temporary directory, and the repository's
  own `.mcp.json`, `.opencode/opencode.jsonc` and `scripts/llm/mcp-servers.json` remain unmodified

<!-- merged from change delta mcp-gateway.md (d9b2132d0a86) -->

### Requirement: MCP client registration must be generated from a single registry

`docs/agent-guide/registry/mcp.yaml` is the single source of truth for which MCP servers each
harness registers. It MUST declare two top-level keys:

- `clients` — the servers a harness registers, each with a transport (`http` or `stdio`), the
  endpoint or command, and a per-harness enabled flag for `claude_code`, `agy` and `opencode`.
- `cluster` — the in-cluster deployment that backs the HTTP endpoints, its containers and ports,
  and the port-forward bridge that exposes them on localhost.

Only `clients` is rendered. `cluster` is documentation: it records that `localhost:18080` and
`localhost:13001` are not local processes but a `kubectl port-forward` onto
`svc/claude-code-mcp-monolith`, so that `scripts/mcp-gateway/` is not mistaken for an unused
artifact and removed.

`scripts/mcp-sync.sh render` MUST write `.mcp.json`, the `mcp` block of
`.opencode/opencode.jsonc`, and `~/.gemini/config/mcp_config.json` from `clients`, translating
into each harness's own shape: `"type": "http"` for Claude Code, `"serverUrl"` for agy, and
`"type": "remote"` / `"type": "local"` with a `command` array for opencode.

Rendering `.opencode/opencode.jsonc` MUST replace only the `mcp` block and leave the rest of the
file byte-identical. The file is JSONC and its comments carry the reasons individual servers are
disabled; a JSON round-trip would discard them.

#### Scenario: a server is added to the registry

- **GIVEN** a new entry under `clients` enabled for all three harnesses
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** all three configuration files gain the server in their own format, and no other part
  of any file changes

#### Scenario: a server is disabled for one harness only

- **GIVEN** an entry whose `opencode` flag is false and whose `claude_code` and `agy` flags are
  true
- **WHEN** `render` runs
- **THEN** `.opencode/opencode.jsonc` carries it with `"enabled": false` while the other two
  files register it normally

#### Scenario: rendering preserves opencode.jsonc comments

- **GIVEN** `.opencode/opencode.jsonc` contains comments explaining why `github-mcp` and
  `playwright` are disabled
- **WHEN** `render` rewrites the `mcp` block
- **THEN** those comments survive unchanged

### Requirement: MCP configuration drift must fail closed for repository-tracked files

`scripts/mcp-sync.sh check` MUST compare each rendered target against its current content and
exit non-zero on any difference.

For `.mcp.json` and `.opencode/opencode.jsonc` this check is unconditional. For
`~/.gemini/config/mcp_config.json` — which lives outside the repository in the user's home
directory and cannot exist in CI — the check MUST run when the file is present and MUST be
skipped with an explicit message when it is absent. It MUST NOT silently pass over a missing
file, because a green exit that skipped a target reads as proof that the target matched.

The check MUST be asserted from `tests/spec/mcp-gateway.bats`, which already covers `.mcp.json`
server registration, rather than from a new test file.

#### Scenario: a tracked config is edited by hand

- **GIVEN** `.mcp.json` is edited without updating `mcp.yaml`
- **WHEN** `check` runs
- **THEN** it exits non-zero and names the differing file

#### Scenario: the agy config is absent, as in CI

- **GIVEN** `~/.gemini/config/mcp_config.json` does not exist
- **WHEN** `check` runs
- **THEN** the two repository-tracked files are still verified, the agy target is reported as
  skipped, and the exit code reflects only the tracked files

#### Scenario: the agy config is present and has drifted

- **GIVEN** `~/.gemini/config/mcp_config.json` exists and differs from the rendered output
- **WHEN** `check` runs
- **THEN** it exits non-zero and names that file

### Requirement: The registry must record known defects of the cluster layer rather than repair them

The `cluster` section MUST record, for each container of the monolith, whether it is functional,
and reference the ticket for any that is not. Two such defects existed when this requirement was
written — a `keycloak` container targeting a service that Pocket ID had already replaced
(T002311), and a stale claim about this component's deployment status (T002312). Both have since
been resolved; the requirement stands for any future defect.

<!-- [T002589] Der Absatz oben umschreibt den Defekt aus T002312 bewusst, statt ihn beim Namen
     zu nennen. Der Guard in tests/spec/mcp-gateway.bats greppt normative Prosa auf das
     Abschaltungs-Signalwort (deutsche und englische Form, siehe den Regex dort) und nimmt nur
     Scenario-Bloecke aus — er kann Beschreibung und Behauptung nicht unterscheiden. Beim
     Archivieren von Charge 3 (T002569, PR #3697) wanderte eine Formulierung mit dem Signalwort
     in die SSOT und faerbte main rot. Dieser Kommentar darf es deshalb selbst nicht
     ausschreiben; der erste Anlauf tat es und blieb prompt rot. Den Guard aufzuweichen waere
     falsch — er existiert, weil genau diese Behauptung monatelang unwidersprochen hier stand. -->

Repairing such a defect requires changing a production manifest and is out of scope for a change
whose subject is configuration generation.

#### Scenario: a container is known to be broken

- **GIVEN** the `keycloak` container cannot satisfy its readiness probe
- **WHEN** the registry is written
- **THEN** its entry is marked as defective and carries the ticket reference, and the container
  is left in the deployment

<!-- merged from change delta mcp-gateway.md (8434643e7f4c) -->

### Requirement: mcp-kubernetes und mcp-postgres laufen mit read-only Identität

The MCP gateway SHALL expose `mcp-kubernetes` and `mcp-postgres` under an identity that
cannot mutate the cluster or the database, and the documentation SHALL name this as
intended least privilege rather than as a defect. `mcp-kubernetes` runs in-cluster under
the ServiceAccount `claude-code-agent`, whose ClusterRole grants only `get`/`list`/`watch`;
`mcp-postgres` wraps every statement in a read-only transaction. Cluster mutations and
writing SQL — including `pods_exec`, `pods_run`, `ALTER USER`, `ALTER ROLE` and `GRANT` —
SHALL go through `kubectl` instead.

#### Scenario: pods/exec über mcp-kubernetes wird verweigert

- **GIVEN** `mcp-kubernetes` bedient Anfragen unter der SA `claude-code-agent`
- **WHEN** ein Agent `pods_exec` aufruft
- **THEN** verweigert der API-Server die Anfrage mit "cannot create resource pods/exec",
  und dieses Verhalten ist als beabsichtigt dokumentiert — die ClusterRole wird **nicht**
  um `create pods/exec` erweitert

#### Scenario: Der Tool-Guide nennt die kubectl-pflichtigen Kubernetes-Tools vollständig

- **GIVEN** `.claude/skills/references/mcp-tool-guide.md` listet die bewusst
  kubectl-pflichtigen `mcp-kubernetes`-Tools auf
- **WHEN** die Liste gelesen wird
- **THEN** enthält sie neben `pods_delete`/`resources_*` auch `pods_exec` und `pods_run`,
  sodass ein Denial nicht als Fehlkonfiguration missgedeutet wird

#### Scenario: ALTER ROLE über mcp-postgres schlägt erwartungsgemäß fehl

- **GIVEN** `mcp-postgres` klammert jede Query in eine `READ ONLY`-Transaktion
- **WHEN** ein Agent `ALTER USER`, `ALTER ROLE` oder `GRANT` absetzt
- **THEN** antwortet PostgreSQL mit "cannot execute … in a read-only transaction", und der
  Tool-Guide weist diese Statements ausdrücklich dem `kubectl exec … psql`-Pfad zu

### Requirement: Architektur-Notiz beschreibt den tatsächlichen Betriebsmodus

The `mcp-gateway` SSOT spec SHALL describe how the MCP servers are actually served. For
`mcp-kubernetes` and `mcp-postgres` the servers are NOT host-side CLI processes: both are
`kubectl port-forward` targets on the in-cluster Deployment `claude-code-mcp-monolith` in
namespace `default`. The spec SHALL state this, because a description that omits the
in-cluster Deployment is what made the read-only identity behind a denied `pods_exec` hard
to locate.

#### Scenario: Betriebsmodus ist aus der Spec ableitbar

- **GIVEN** ein Operator untersucht, unter welcher Identität `mcp-kubernetes` Anfragen stellt
- **WHEN** er `openspec/specs/mcp-gateway.md` liest
- **THEN** findet er, dass `:18080` und `:13001` Port-Forwards auf
  `svc/claude-code-mcp-monolith` sind und die SA `claude-code-agent` die wirksame Identität
  ist — ohne die Deployment-Manifeste selbst lesen zu müssen

<!-- merged from change delta mcp-gateway.md (4b103f8d6fc1) -->

### Requirement: MCP-Gateway-Watchdog prüft die Tunnel-Liveness per echtem MCP-Initialize

The system SHALL provide a watchdog that probes the `mcp-gateway` port-forward tunnel with a
real MCP `initialize` HTTP-POST (not a TCP connect or a bare `/health`), because in the
failure mode the listener stays open and only the payload times out. The probe SHALL exit
non-zero on timeout or invalid response and SHALL name the failing port in its output.

#### Scenario: TCP-Listener ohne MCP-Antwort gilt als tot

- **GIVEN** der `port-forward`-Listener ist offen, antwortet aber nicht auf MCP-Payloads
- **WHEN** `probe.sh` ausgeführt wird
- **THEN** läuft der Probe in den Timeout
- **AND** der Exit-Code ist ungleich 0
- **AND** die Ausgabe nennt den geprüften Port

#### Scenario: Probe prüft alle vier Ports ohne --port

- **GIVEN** `probe.sh` wird ohne `--port` aufgerufen
- **WHEN** der Probe läuft
- **THEN** werden alle vier Ports der Unit geprüft (18080, 13000, 13001, 13002)
- **AND** ein fehlgeschlagener Port ist in der Ausgabe erkennbar

### Requirement: Watchdog startet den Tunnel bei Fehlschlag neu und verhindert Restart-Stürme

The system SHALL restart `mcp-gateway.service` when the probe fails, but SHALL NOT restart
when the target pod itself is unreachable, and SHALL limit consecutive restarts (at most one
per 5 minutes) to prevent a restart storm.

#### Scenario: Probe-Fehlschlag startet die Unit neu

- **GIVEN** `probe.sh` meldet einen Fehlschlag
- **WHEN** der Watchdog-Timer läuft
- **THEN** wird `mcp-gateway.service` neu gestartet
- **AND** der Restart ist auf höchstens einen je 5 Minuten begrenzt

#### Scenario: Toter Ziel-Pod löst keinen Tunnel-Neustart aus

- **GIVEN** der Ziel-Pod `claude-code-mcp-monolith` ist nicht erreichbar
- **WHEN** der Watchdog läuft
- **THEN** wird der Fehler protokolliert
- **AND** es wird kein Tunnel-Neustart ausgelöst

<!-- merged from change delta mcp-gateway.md (2421195876a7) -->

### Requirement: Der bge-mcp-Shim spricht ausschließlich Streamable HTTP

The bge-mcp shim MUST NOT open a Server-Sent-Events channel on `GET`. Because the shim returns
every JSON-RPC answer in the POST response body, an SSE channel it never writes to leaves a
standards-following client waiting instead of failing fast — observed with agy, which was the only
harness unable to reach the server. `GET` MUST therefore be rejected the same way the other HTTP
MCP servers of the registry reject it.

#### Scenario: GET is rejected instead of upgraded to a silent stream

- **GIVEN** the bge-mcp shim is running with a known `BGE_MCP_TOKEN`
- **WHEN** a `GET` request carrying a valid `Authorization: Bearer` header is sent to `/mcp`
- **THEN** the response status is `405` and its `content-type` is not `text/event-stream`

#### Scenario: POST keeps answering in the response body

- **GIVEN** the bge-mcp shim is running with a known `BGE_MCP_TOKEN`
- **WHEN** an `initialize` request is POSTed to `/mcp` with a valid Bearer header
- **THEN** the response status is `200` and the body carries the JSON-RPC result for that request

#### Scenario: Authentication still precedes the method decision

- **GIVEN** the bge-mcp shim is running
- **WHEN** a `GET` request without an `Authorization` header is sent to `/mcp`
- **THEN** the response status is `401`, not `405`

<!-- merged from change delta mcp-gateway.md (c5a56d1deff9) -->

### Requirement: Der agy-Renderer löst Header-Platzhalter auf

The agy renderer MUST resolve `${VAR}` placeholders in header values to their actual value,
because agy neither expands `${VAR}` itself nor understands opencode's `{env:VAR}` notation — it
sends the literal string and the target answers `401`. Resolution MUST consider the caller's
environment first and `~/.config/bge-mcp/server.env` second, so that the result does not depend on
which shell invoked the sync. Resolution MUST apply to every client's headers, not to one
hard-coded variable name.

#### Scenario: Placeholder resolved from the environment

- **GIVEN** a registry client whose header value contains `${PROBE_TOKEN}`
- **AND** `PROBE_TOKEN` is set in the environment
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** the agy config carries the variable's value and no longer contains `${PROBE_TOKEN}`

#### Scenario: Placeholder resolved from server.env when the environment is empty

- **GIVEN** `PROBE_TOKEN` is unset in the environment
- **AND** `~/.config/bge-mcp/server.env` defines `PROBE_TOKEN`
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** the agy config carries the value from that file

#### Scenario: Unresolvable placeholder is kept and reported

- **GIVEN** a header placeholder that is defined neither in the environment nor in `server.env`
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** it exits 0, the agy config still contains the literal placeholder, and a warning naming
  the variable is written to stderr

#### Scenario: Header values without a placeholder are untouched

- **GIVEN** a header value containing no `${...}` sequence
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** the agy config carries that value byte-identical

### Requirement: Repository-tracked configs never carry an expanded secret

Because `.mcp.json` and `.opencode/opencode.jsonc` are tracked in the repository, they MUST keep
their placeholder notation. Only the agy config, which lives outside any working tree under
`$HOME`, may carry a resolved value.

#### Scenario: The two tracked renderers keep their notation

- **GIVEN** a registry client with a `${PROBE_TOKEN}` header and `PROBE_TOKEN` set to a value
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** `.mcp.json` still contains `${PROBE_TOKEN}`, `.opencode/opencode.jsonc` still contains
  `{env:PROBE_TOKEN}`, and neither file contains the resolved value

<!-- merged from change delta mcp-gateway.md (de4ac22e0120) -->