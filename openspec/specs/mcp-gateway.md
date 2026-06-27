# mcp-gateway

<!-- baseline SSOT — aktualisiert 2026-06-22: Monolith dekommissioniert, CLI-basierte MCP-Server -->

## Purpose

Das MCP-Gateway stellt MCP-Server (PostgreSQL, GitHub, Browser, Kubernetes) als lokale CLI-Prozesse bereit, die auf dem WSL-Host laufen und über `localhost:{port}/mcp` erreichbar sind. Die Server sind in `.mcp.json` konfiguriert. Die Absicherung im Dev-Cluster erfolgt über einen `--skip-auth-route`-Bypass auf dem `oauth2-proxy-dev`, der die vier MCP-Pfade am OIDC-Gate vorbeileitet.

> **Architektur-Notiz:** Der frühere `claude-code-mcp-monolith` Kubernetes-Pod (Supergateway-basiert) wurde dekommissioniert. MCP-Server laufen jetzt ausschließlich als CLI-Prozesse auf dem WSL-Host — keine In-Cluster-Deployment mehr. Referenz: PR MCP-Monolith-Removal (2026-06-22).

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
- **THEN** scheitert die Verbindung am OIDC-Gate mit HTTP 302 (Redirect zu Keycloak)

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
