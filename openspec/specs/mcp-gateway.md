# mcp-gateway

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Das MCP-Gateway stellt MCP-Server (PostgreSQL, GitHub, Browser, Kubernetes) über einen Supergateway-Monolith als streamableHttp-Endpunkte bereit und exponiert diese im Dev-Cluster unter `https://mcp.<DEV_DOMAIN>/{service}/mcp`. Die Absicherung erfolgt in zwei Schichten: einer token-basierten ForwardAuth im Dev-Cluster sowie einem OIDC-Bypass (`--skip-auth-route`) auf dem Prod-OAuth2-Proxy, der MCP-Pfade am OIDC-Gate vorbei in den k3d-Cluster leitet. Alle stdio→streamableHttp-Bridges müssen mit `--stateful` betrieben werden, damit der MCP-HTTP-Client eine `Mcp-Session-Id` erhält.

---

### Requirement: Supergateway Stateful Mode

The system SHALL run every supergateway stdio→streamableHttp bridge with the `--stateful` flag in both the production monolith manifest and the dev k3d variant manifest.

#### Scenario: Stateful-Flag in beiden Monolith-Manifesten vorhanden

- **GIVEN** die zwei Monolith-Manifeste `deploy/mcp/claude-code-mcp-monolith.yaml` und `k3d/dev-stack/mcp-monolith-dev.yaml` existieren
- **WHEN** die Manifeste auf `--outputTransport streamableHttp`-Invocations geprüft werden
- **THEN** jede gefundene streamableHttp-Bridge trägt exakt ein `--stateful`-Flag — die Anzahl der `--stateful`-Vorkommen entspricht der Anzahl der Bridges

#### Scenario: Fehlender Stateful-Flag wird erkannt

- **GIVEN** ein Monolith-Manifest enthält mindestens eine supergateway-streamableHttp-Bridge
- **WHEN** die Anzahl der `--stateful`-Flags kleiner ist als die Anzahl der Bridges
- **THEN** schlägt die strukturelle CI-Prüfung fehl und gibt die betroffene Datei sowie die Diskrepanz zwischen Bridge-Anzahl und Flag-Anzahl aus

---

### Requirement: MCP Auth Proxy Deployment

The system SHALL render an `mcp-auth-proxy-dev` Deployment in the dev-stack kustomize output.

#### Scenario: Auth-Proxy-Deployment im Dev-Stack gerendert

- **GIVEN** der Dev-Stack (`k3d/dev-stack`) wird mit `kubectl kustomize` gerendert
- **WHEN** die gerenderte YAML-Ausgabe auf den Deployment-Namen geprüft wird
- **THEN** enthält die Ausgabe einen Eintrag mit `name: mcp-auth-proxy-dev`

---

### Requirement: MCP Token Secret Reference

The system SHALL configure the `mcp-auth-proxy-dev` Deployment to read the `CLUSTER_TOKEN` from the `mcp-tokens` Secret.

#### Scenario: Token-Secret-Referenz im Dev-Stack vorhanden

- **GIVEN** der Dev-Stack ist kustomize-gerendert
- **WHEN** die Ausgabe auf Secret-Referenzen geprüft wird
- **THEN** enthält die Ausgabe sowohl `name: mcp-tokens` als auch `key: CLUSTER_TOKEN`, sodass der Auth-Proxy seinen Token aus dem dedizierten Secret bezieht

---

### Requirement: MCP Dev IngressRoute on MCP Host

The system SHALL render an `mcp-dev` IngressRoute that matches the `mcp.<DEV_DOMAIN>` host in the dev-stack.

#### Scenario: IngressRoute mit MCP-Host im Dev-Stack vorhanden

- **GIVEN** der Dev-Stack ist kustomize-gerendert
- **WHEN** die Ausgabe auf IngressRoute-Definitionen geprüft wird
- **THEN** enthält die Ausgabe einen Eintrag mit `name: mcp-dev` und eine Host-Regel der Form `Host(` mit dem Präfix `mcp.`, sodass alle MCP-Anfragen an die korrekte Domain geleitet werden

---

### Requirement: Four MCP Path Prefixes Routed to Monolith

The system SHALL route all four MCP service path prefixes (`/kubernetes`, `/postgres`, `/github`, `/browser`) to the `claude-code-mcp-monolith` Service in the `mcp-dev` IngressRoute.

#### Scenario: Alle vier Pfad-Präfixe im Dev-Stack konfiguriert

- **GIVEN** der Dev-Stack ist kustomize-gerendert
- **WHEN** die Ausgabe auf PathPrefix-Regeln für die MCP-Services geprüft wird
- **THEN** enthält sie für jeden der vier Prefixe `kubernetes`, `postgres`, `github` und `browser` einen `PathPrefix`-Eintrag sowie eine Referenz auf `claude-code-mcp-monolith` als Backend-Service

#### Scenario: Fehlender Pfad-Präfix wird erkannt

- **GIVEN** der Dev-Stack ist kustomize-gerendert
- **WHEN** ein `PathPrefix`-Eintrag für einen der vier MCP-Services fehlt
- **THEN** schlägt der Test fehl und gibt den fehlenden Prefix aus

---

### Requirement: ForwardAuth Chain to MCP Auth Proxy

The system SHALL wire the `mcp-dev` Middleware chain so that requests pass through the ForwardAuth at `mcp-auth-proxy-dev.workspace-dev.svc.cluster.local` via a chain named `mcp-dev-chain`.

#### Scenario: ForwardAuth-Chain korrekt verdrahtet

- **GIVEN** der Dev-Stack ist kustomize-gerendert
- **WHEN** die Ausgabe auf Middleware-Definitionen geprüft wird
- **THEN** enthält sie die ForwardAuth-URL `mcp-auth-proxy-dev.workspace-dev.svc.cluster.local` sowie einen Middleware-Chain-Eintrag mit `name: mcp-dev-chain`

---

### Requirement: OAuth2 Proxy MCP Path Bypass

The system SHALL configure the prod `oauth2-proxy-dev` with a `--skip-auth-route` argument that bypasses OIDC authentication for the four MCP path prefixes (`kubernetes`, `postgres`, `github`, `browser`).

#### Scenario: Skip-Auth-Route im Prod-Overlay vorhanden

- **GIVEN** das `prod-mentolder`-Overlay ist kustomize-gerendert
- **WHEN** die Ausgabe auf oauth2-proxy-Argumente geprüft wird
- **THEN** enthält sie das Argument `--skip-auth-route=^/(kubernetes|postgres|github|browser)`, sodass MCP-Anfragen die OIDC-Schicht umgehen und direkt zum MCP-Monolith im k3d-Cluster weitergeleitet werden

#### Scenario: Fehlender Bypass blockiert MCP-Clients

- **GIVEN** das `prod-mentolder`-Overlay ist kustomize-gerendert
- **WHEN** das `--skip-auth-route`-Argument für MCP-Pfade fehlt
- **THEN** schlägt der Test fehl, weil MCP-Clients hinter dem OIDC-Gate blockiert würden und keine Session aufbauen könnten

---

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Supergateway Stateful Flag in Both Manifests
<!-- bats: mcp-supergateway-stateful.bats -->

The system SHALL ensure every supergateway stdio→streamableHttp bridge in both the production monolith manifest and the dev k3d variant manifest carries the `--stateful` flag so that the MCP HTTP client receives a valid `Mcp-Session-Id` header.

#### Scenario: Alle streamableHttp-Bridges tragen --stateful *(BATS)*
- **GIVEN** die Monolith-Manifeste `deploy/mcp/claude-code-mcp-monolith.yaml` und `k3d/dev-stack/mcp-monolith-dev.yaml` existieren
- **WHEN** die Anzahl der `--outputTransport streamableHttp`-Einträge und der `--stateful`-Einträge pro Manifest gezählt werden
- **THEN** entspricht die Anzahl der `--stateful`-Flags exakt der Anzahl der Bridges; fehlt ein Flag, bricht der Test ab und gibt die Diskrepanz aus

---

### Requirement: MCP Auth Proxy Deployment and Token Secret
<!-- bats: dev-mcp-route.bats -->

The system SHALL render an `mcp-auth-proxy-dev` Deployment in the dev-stack kustomize output that reads `CLUSTER_TOKEN` from the `mcp-tokens` Secret.

#### Scenario: Auth-Proxy-Deployment im Dev-Stack vorhanden *(BATS)*
- **GIVEN** der Dev-Stack (`k3d/dev-stack`) wird mit `kubectl kustomize` gerendert
- **WHEN** die gerenderte YAML-Ausgabe auf den Deployment-Namen geprüft wird
- **THEN** enthält die Ausgabe einen Eintrag `name: mcp-auth-proxy-dev`

#### Scenario: Token-Secret-Referenz im Dev-Stack korrekt verdrahtet *(BATS)*
- **GIVEN** der Dev-Stack ist kustomize-gerendert
- **WHEN** die Ausgabe auf Secret-Referenzen geprüft wird
- **THEN** enthält sie sowohl `name: mcp-tokens` als auch `key: CLUSTER_TOKEN`

---

### Requirement: MCP Dev IngressRoute and Path Routing
<!-- bats: dev-mcp-route.bats -->

The system SHALL render an `mcp-dev` IngressRoute matching `mcp.<DEV_DOMAIN>` and route all four service path prefixes (`/kubernetes`, `/postgres`, `/github`, `/browser`) to the `claude-code-mcp-monolith` Service.

#### Scenario: IngressRoute mit MCP-Host im Dev-Stack gerendert *(BATS)*
- **GIVEN** der Dev-Stack ist kustomize-gerendert
- **WHEN** die Ausgabe auf IngressRoute-Definitionen geprüft wird
- **THEN** enthält sie `name: mcp-dev` und eine Host-Regel der Form `Host(` mit dem Präfix `mcp.`

#### Scenario: Alle vier Pfad-Präfixe an den Monolith geroutet *(BATS)*
- **GIVEN** der Dev-Stack ist kustomize-gerendert
- **WHEN** die Ausgabe auf PathPrefix-Regeln geprüft wird
- **THEN** enthält sie für jeden der vier Prefixe (`kubernetes`, `postgres`, `github`, `browser`) einen `PathPrefix`-Eintrag sowie eine Referenz auf `claude-code-mcp-monolith` als Backend-Service

#### Scenario: ForwardAuth-Chain an mcp-auth-proxy-dev verdrahtet *(BATS)*
- **GIVEN** der Dev-Stack ist kustomize-gerendert
- **WHEN** die Ausgabe auf Middleware-Definitionen geprüft wird
- **THEN** enthält sie die ForwardAuth-URL `mcp-auth-proxy-dev.workspace-dev.svc.cluster.local` sowie `name: mcp-dev-chain`

#### Scenario: OAuth2-Proxy carves out MCP-Pfade via --skip-auth-route *(BATS)*
- **GIVEN** das `prod-mentolder`-Overlay ist kustomize-gerendert
- **WHEN** die Ausgabe auf oauth2-proxy-Argumente geprüft wird
- **THEN** enthält sie `--skip-auth-route=^/(kubernetes|postgres|github|browser)`

---

### Requirement: ForwardAuth Token Validation
<!-- bats: dev-mcp-route.bats | e2e: sa-10-mcp-forwardauth.spec.ts, fa-12-mcp.spec.ts -->

The system SHALL enforce token-based authentication on all MCP endpoints: requests without a valid `Authorization` header SHALL be rejected with HTTP 401.

#### Scenario: Unauthenticated GET to MCP auth endpoint returns 401 *(E2E)*
- **GIVEN** der MCP-Auth-Proxy ist über `MCP_PROXY_URL` erreichbar und kein Authorization-Header wird gesendet
- **WHEN** ein HTTP GET an `{MCP_URL}/auth` gesendet wird
- **THEN** antwortet der Proxy mit HTTP 401

#### Scenario: Ungültiges Bearer-Token wird mit 401 abgewiesen *(E2E)*
- **GIVEN** der MCP-Auth-Proxy ist erreichbar und ein syntaktisch gültiger, aber inhaltlich ungültiger Bearer-Token wird gesendet
- **WHEN** ein HTTP GET an `{MCP_URL}/auth` mit `Authorization: Bearer <invalid-token>` gesendet wird
- **THEN** antwortet der Proxy mit HTTP 401

#### Scenario: Gültiger Keycloak-Token wird mit 200 akzeptiert *(E2E)*
- **GIVEN** der MCP-Auth-Proxy ist erreichbar, `KC_ADMIN_PASS` ist gesetzt und ein gültiger Token wird von Keycloak bezogen
- **WHEN** ein HTTP GET an `{MCP_URL}/auth` mit dem gültigen Bearer-Token gesendet wird
- **THEN** antwortet der Proxy mit HTTP 200

---

### Requirement: Website Auth Endpoint and Admin Page Health
<!-- e2e: fa-12-mcp.spec.ts -->

The system SHALL return correct authentication state via `/api/auth/me` and SHALL render the `/admin` page without a 500 error.

#### Scenario: /api/auth/me gibt unauthenticated zurück wenn keine Session vorhanden *(E2E)*
- **GIVEN** ein Browser sendet eine GET-Anfrage an `/api/auth/me` ohne aktive Session
- **WHEN** die Antwort ausgewertet wird
- **THEN** gibt der Endpunkt HTTP 200 mit `{ authenticated: false }` oder HTTP 401 zurück — niemals HTTP 500

#### Scenario: Unauthenticated POST an geschützte MCP-Route liefert 401/403 *(E2E)*
- **GIVEN** kein Authentifizierungs-Cookie oder -Token ist vorhanden
- **WHEN** ein HTTP POST an `/api/mcp/auth` mit leerem JSON-Body gesendet wird
- **THEN** antwortet der Endpunkt mit HTTP 401, 403 oder 404 — niemals mit HTTP 200 für unauthentifizierte Anfragen

#### Scenario: /admin Seite rendert ohne Internal Server Error *(E2E)*
- **GIVEN** ein Browser navigiert zu `{BASE}/admin`
- **WHEN** die Seite geladen wird (ggf. Redirect zu Keycloak erwartet)
- **THEN** enthält der Body weder "Internal Server Error" noch "500"

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
