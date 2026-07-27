## ADDED Requirements

### Requirement: MCP Postgres Bridge Child-Process Containment
<!-- bats: mcp-gateway.bats -->

The system SHALL prevent the `postgres` container of the `claude-code-mcp-monolith`
Deployment from accumulating unbounded `mcp-server-postgres` child processes, so that
per-request process spawning by `supergateway --stateless` cannot drive the container
cgroup into an OOMKill.

#### Scenario: Reaper begrenzt akkumulierte Child-Prozesse *(BATS)*

- **GIVEN** das Manifest `k3d/default/claude-code-mcp-monolith-deploy.yaml`
- **WHEN** das Start-Kommando des `postgres`-Containers geprüft wird
- **THEN** enthält es einen Reaper, der `mcp-server-postgres`-Prozesse oberhalb einer
  Altersschwelle beendet, und die Schwelle liegt über dem konfigurierten Query-Timeout

#### Scenario: Paketversionen sind gepinnt *(BATS)*

- **GIVEN** das Start-Kommando des `postgres`-Containers installiert `supergateway`
  und `@modelcontextprotocol/server-postgres` zur Laufzeit
- **WHEN** die Installationszeile geprüft wird
- **THEN** trägt jedes Paket eine explizite Version (`name@x.y.z`), sodass das
  Laufzeitverhalten reproduzierbar ist und nicht vom jeweils aktuellen npm-Release abhängt

#### Scenario: Memory-Limit macht einen Regress schnell sichtbar *(BATS)*

- **GIVEN** der Leak füllte bei 2Gi rund 10 Stunden, bevor er sichtbar wurde
- **WHEN** das `resources.limits.memory` des `postgres`-Containers geprüft wird
- **THEN** liegt es unterhalb von 2Gi, sodass ein erneutes Prozess-Wachstum in Stunden
  statt Tagen auffällt, und oberhalb des gemessenen Bedarfs des Normalbetriebs

#### Scenario: Child-Count ist beobachtbar *(BATS)*

- **GIVEN** ein OOMKill erreicht den Aufrufer nur als "transport dropped mid-call"
- **WHEN** das Start-Kommando des `postgres`-Containers geprüft wird
- **THEN** enthält es eine periodische Ausgabe von Child-Count und RSS-Summe auf stdout,
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
