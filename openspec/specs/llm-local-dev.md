# llm-local-dev

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Das `llm-local-dev`-Domain beschreibt die lokale LLM-Entwicklungsumgebung auf Basis von OpenClaw/Opencode, das direkt gegen eine lokale Ollama-Instanz arbeitet. Die Konfiguration wird über `Taskfile.openclaw.yml` und `openclaw/.env` verwaltet und ist so gestaltet, dass keine API-Keys oder Modell-Endpunkte versehentlich ins Repository gelangen. Alle Tasks (install, configure, start, status, logs, backup, restore, wipe) sind im dedizierten Taskfile deklariert und vom Root-Taskfile eingebunden.

---

## Requirements

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Valid Taskfile Syntax
<!-- bats: openclaw-taskfile.bats -->

The system SHALL provide a `Taskfile.openclaw.yml` that is valid YAML and can be parsed without errors.

#### Scenario: Syntaxprüfung des OpenClaw-Taskfiles *(BATS)*
- **GIVEN** das Repository ist ausgecheckt und `Taskfile.openclaw.yml` existiert im Wurzelverzeichnis
- **WHEN** Python mit `yaml.safe_load` die Datei einliest
- **THEN** der Prozess endet mit Exit-Code 0 ohne Fehler

---

### Requirement: Required Task Declarations
<!-- bats: openclaw-taskfile.bats -->

The system SHALL declare all lifecycle tasks (`backup`, `install`, `configure`, `start`, `status`, `logs`, `restore`, `wipe`) in `Taskfile.openclaw.yml`.

#### Scenario: Alle Pflicht-Tasks sind vorhanden *(BATS)*
- **GIVEN** `Taskfile.openclaw.yml` ist im Repository vorhanden
- **WHEN** nach jedem der Tasks `backup`, `install`, `configure`, `start`, `status`, `logs`, `restore`, `wipe` gesucht wird
- **THEN** jeder Task ist als Top-Level-Eintrag in der Form `  <name>:` deklariert und kein Task fehlt

---

### Requirement: Local Ollama Base URL in Example Config
<!-- bats: openclaw-taskfile.bats -->

The system SHALL configure `OPENAI_BASE_URL` in `openclaw/.env.example` to point at the local Ollama endpoint `http://10.10.0.3:11434/v1`.

#### Scenario: Korrekte Base-URL für lokales Ollama *(BATS)*
- **GIVEN** `openclaw/.env.example` existiert im Repository
- **WHEN** die Datei nach dem Muster `^OPENAI_BASE_URL=http://10\.10\.0\.3:11434/v1$` durchsucht wird
- **THEN** die Zeile ist exakt so vorhanden und stimmt mit dem regulären Ausdruck überein

---

### Requirement: Chat Model Set in Example Config
<!-- bats: openclaw-taskfile.bats -->

The system SHALL define `OPENAI_MODEL` in `openclaw/.env.example` with a `qwen2.5`-series model.

#### Scenario: Chat-Modell ist gesetzt *(BATS)*
- **GIVEN** `openclaw/.env.example` existiert im Repository
- **WHEN** die Datei nach dem Muster `^OPENAI_MODEL=qwen2\.5:` durchsucht wird
- **THEN** die Zeile ist vorhanden und beginnt mit `OPENAI_MODEL=qwen2.5:`

---

### Requirement: OpenClaw Taskfile Included in Root Taskfile
<!-- bats: openclaw-taskfile.bats -->

The system SHALL include `Taskfile.openclaw.yml` in the root `Taskfile.yml` so all openclaw tasks are accessible via the standard `task` command.

#### Scenario: Einbindung im Root-Taskfile *(BATS)*
- **GIVEN** `Taskfile.yml` existiert im Wurzelverzeichnis des Repositories
- **WHEN** die Datei nach einem Verweis auf `Taskfile.openclaw.yml` durchsucht wird
- **THEN** der Verweis ist vorhanden und das Root-Taskfile bindet das OpenClaw-Taskfile ein

---

### Requirement: OpenClaw Environment File Excluded from Version Control
<!-- bats: openclaw-taskfile.bats -->

The system SHALL list `openclaw/.env` in `.gitignore` so that local credentials and model configuration are never committed to the repository.

#### Scenario: `.env` ist in `.gitignore` eingetragen *(BATS)*
- **GIVEN** `.gitignore` existiert im Wurzelverzeichnis
- **WHEN** die Datei nach dem exakten Eintrag `^openclaw/\.env$` durchsucht wird
- **THEN** der Eintrag ist vorhanden und verhindert, dass `openclaw/.env` versehentlich ins Repository gelangt

---

### Requirement: Brainstorm Tunnel Runs on Dev Node Only
<!-- bats: brainstorm-dev-host.bats -->

The system SHALL route the brainstorm tunnel exclusively through the dev-stack sish broker (`*.dev.mentolder.de`) and SHALL NOT ship a dedicated brainstorm-sish deployment in the prod-mentolder or prod-fleet overlays.

#### Scenario: Kein dediziertes brainstorm-sish-Manifest in prod-mentolder *(BATS)*
- **GIVEN** das prod-mentolder Overlay-Verzeichnis ist ausgecheckt
- **WHEN** nach `brainstorm-sish.yaml` im Overlay gesucht wird
- **THEN** die Datei existiert nicht im `prod-mentolder`-Verzeichnis

#### Scenario: prod-mentolder Kustomization referenziert brainstorm-sish nicht *(BATS)*
- **GIVEN** `prod-mentolder/kustomization.yaml` ist vorhanden
- **WHEN** die Datei nach dem String `brainstorm-sish` durchsucht wird
- **THEN** kein Treffer — die Kustomization enthält keinen Verweis auf brainstorm-sish

#### Scenario: prod-fleet/mentolder patcht brainstorm-sish nicht *(BATS)*
- **GIVEN** `prod-fleet/mentolder/kustomization.yaml` ist vorhanden
- **WHEN** die Datei nach dem String `brainstorm-sish` durchsucht wird
- **THEN** kein Treffer — das Fleet-Overlay enthält keinen Patch für brainstorm-sish

#### Scenario: Dev-Stack-sish-Broker ist vorhanden und bindet `*.dev.<domain>` *(BATS)*
- **GIVEN** `k3d/dev-stack/sish.yaml` existiert
- **WHEN** die Datei nach `name: sish` und `--bind-hosts=*.${DEV_DOMAIN}` durchsucht wird
- **THEN** beide Einträge sind vorhanden — der sish-Broker im Dev-Stack ist der alleinige Brainstorm-Host

#### Scenario: Brainstorm-Taskfile publiziert an die Dev-Domain, nicht an die Prod-Domain *(BATS)*
- **GIVEN** `Taskfile.brainstorm.yml` existiert
- **WHEN** die Datei nach `brainstorm.${PROD_DOMAIN}` oder `brainstorm.mentolder.de` durchsucht wird
- **THEN** kein Treffer für Prod-Domain-Referenzen
- **AND** `${DEV_DOMAIN}` ist in der Datei vorhanden

#### Scenario: Brainstorm-Taskfile nutzt SSH-Port 2222 des dev-sish, nicht den entfernten NodePort 32223 *(BATS)*
- **GIVEN** `Taskfile.brainstorm.yml` existiert
- **WHEN** die Datei nach `32223` und nach `2222` durchsucht wird
- **THEN** `32223` ist nicht vorhanden (entfernter NodePort des abgeschafften Prod-Brokers)
- **AND** `2222` ist vorhanden (SSH-Ingress-Port des dev-sish)

---

### Requirement: Dev MCP Public Route is Wired Correctly
<!-- bats: dev-mcp-route.bats -->

The system SHALL expose the dev MCP monolith at `https://mcp.<DEV_DOMAIN>/{service}/mcp` via a ForwardAuth-secured IngressRoute in the dev-stack and a `--skip-auth-route` carve-out in the prod oauth2-proxy-dev.

#### Scenario: dev-stack rendert das mcp-auth-proxy-dev Deployment *(BATS)*
- **GIVEN** das dev-stack Kustomize-Overlay ist renderbar
- **WHEN** das gerenderte Manifest nach `name: mcp-auth-proxy-dev` durchsucht wird
- **THEN** das Deployment ist vorhanden

#### Scenario: mcp-auth-proxy-dev liest CLUSTER_TOKEN aus dem mcp-tokens Secret *(BATS)*
- **GIVEN** das gerenderte dev-stack-Manifest liegt vor
- **WHEN** nach `name: mcp-tokens` und `key: CLUSTER_TOKEN` gesucht wird
- **THEN** beide Einträge sind vorhanden — das Auth-Proxy liest sein Token aus dem Secret

#### Scenario: dev-stack rendert die mcp-dev IngressRoute auf dem MCP-Host *(BATS)*
- **GIVEN** das gerenderte dev-stack-Manifest liegt vor
- **WHEN** nach `name: mcp-dev` und dem Host-Matcher `Host(.mcp.` gesucht wird
- **THEN** beide Einträge sind vorhanden — die Route ist an `mcp.<DEV_DOMAIN>` gebunden

#### Scenario: mcp-dev IngressRoute routet alle vier MCP-Pfade zum Monolith *(BATS)*
- **GIVEN** das gerenderte dev-stack-Manifest liegt vor
- **WHEN** nach den PathPrefix-Einträgen für `kubernetes`, `postgres`, `github` und `browser` sowie nach `claude-code-mcp-monolith` gesucht wird
- **THEN** alle vier Pfad-Präfixe und der Monolith-Service sind vorhanden

#### Scenario: mcp-dev IngressRoute verknüpft die ForwardAuth-Chain mit mcp-auth-proxy-dev *(BATS)*
- **GIVEN** das gerenderte dev-stack-Manifest liegt vor
- **WHEN** nach dem ForwardAuth-Address `mcp-auth-proxy-dev.workspace-dev.svc.cluster.local` und dem Middleware-Namen `mcp-dev-chain` gesucht wird
- **THEN** beide Einträge sind vorhanden — die Auth-Chain ist korrekt verdrahtet

#### Scenario: prod oauth2-proxy-dev nimmt MCP-Pfade vom OIDC-Gate aus *(BATS)*
- **GIVEN** das gerenderte prod-mentolder-Manifest liegt vor
- **WHEN** nach `--skip-auth-route=^/(kubernetes|postgres|github|browser)` gesucht wird
- **THEN** der Eintrag ist vorhanden — MCP-Endpunkte umgehen das OIDC-Gate

---

### Requirement: LM Studio / Local-First LLM Integration
<!-- e2e: fa-55-lmstudio-integration.spec.ts -->

The system SHALL provide a working local-LLM coaching AI endpoint that responds within 30 seconds and does not use Anthropic cloud APIs.

#### Scenario: KI-Provider-Konfiguration liefert mindestens einen aktiven Provider *(E2E)*
- **GIVEN** ein Admin-Nutzer ist eingeloggt auf `https://web.mentolder.de`
- **WHEN** `GET /api/admin/coaching/ki-config` aufgerufen wird
- **THEN** der Response hat Status 200 und enthält mindestens einen aktiven Provider

#### Scenario: Aktiver Provider nutzt lokalen LLM-Gateway-Endpunkt, nicht Anthropic *(E2E)*
- **GIVEN** ein Admin-Nutzer ist eingeloggt und mindestens ein aktiver KI-Provider ist konfiguriert
- **WHEN** der `apiEndpoint` des aktiven Providers geprüft wird
- **THEN** der Endpunkt zeigt auf den lokalen LLM-Gateway (nicht auf `api.anthropic.com`)

#### Scenario: Coaching-Session-Erstellung und KI-Generate-API *(E2E)*
- **GIVEN** ein Admin-Nutzer ist eingeloggt und ein aktiver KI-Provider ist konfiguriert
- **WHEN** `POST /api/admin/coaching/sessions` eine neue Session erstellt und anschließend `POST .../steps/1/generate` aufgerufen wird
- **THEN** beide Requests liefern Status 200, `generate` gibt ein nicht-leeres `aiResponse` zurück und antwortet in weniger als 30 Sekunden

#### Scenario: Browser-Wizard-Flow: KI-Button wird aktiviert und zeigt Streaming-Antwort *(E2E)*
- **GIVEN** der Coaching-Wizard ist im Browser geöffnet und die Pflichtfelder sind ausgefüllt
- **WHEN** der Nutzer auf den KI-Button klickt
- **THEN** eine Streaming-Antwort erscheint im Wizard — kein Error-Toast wird angezeigt

---

### Requirement: GPU VRAM and Model Availability After Rotation
<!-- e2e: nfa-11-gpu-vram.spec.ts -->

The system SHALL keep all four Ollama models responsive and all LLM-gateway services reachable after model rotation, without exceeding available GPU VRAM.

#### Scenario: TEI-Embed-Dienst (Port 8081) ist erreichbar *(E2E)*
- **GIVEN** `LLM_HOST_IP` ist gesetzt (GPU-Host im WireGuard-Mesh)
- **WHEN** `GET http://<LLM_HOST_IP>:8081/health` aufgerufen wird
- **THEN** der Response hat Status 200

#### Scenario: TEI-Rerank-Dienst (Port 8082) ist erreichbar *(E2E)*
- **GIVEN** `LLM_HOST_IP` ist gesetzt
- **WHEN** `GET http://<LLM_HOST_IP>:8082/health` aufgerufen wird
- **THEN** der Response hat Status 200

#### Scenario: Ollama-API (Port 11434) ist erreichbar *(E2E)*
- **GIVEN** `LLM_HOST_IP` ist gesetzt
- **WHEN** `GET http://<LLM_HOST_IP>:11434/api/tags` aufgerufen wird
- **THEN** der Response hat Status 200

#### Scenario: Alle vier Ollama-Modelle antworten auf Generate-Anfragen *(E2E)*
- **GIVEN** `LLM_HOST_IP` ist gesetzt und Ollama läuft auf dem GPU-Host
- **WHEN** für jedes der Modelle `qwen2.5:14b`, `qwen2.5-coder:14b`, `qwen2.5vl:7b`, `llama3.2:3b` ein `POST /api/generate` mit einem kurzen Prompt abgesetzt wird
- **THEN** jedes Modell antwortet mit Status 200 innerhalb von 60 Sekunden

---

### Requirement: Brainstorm Tunnel Public Connectivity
<!-- e2e: nfa-12-brainstorm-tunnel.spec.ts -->

The system SHALL keep `brainstorm.mentolder.de` reachable via the dev-stack sish broker; a 502 (no active tunnel) is acceptable in CI, but 500/503/504 indicate a sish or pod failure.

#### Scenario: brainstorm.mentolder.de ist erreichbar (Basis-Konnektivität) *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt (Prod-Cluster-Kontext)
- **WHEN** `GET https://brainstorm.mentolder.de` mit bis zu 3 Weiterleitungen aufgerufen wird
- **THEN** der Response hat Status 200, 301, 302 oder 502 (kein aktiver Tunnel ist akzeptabel)

#### Scenario: Browser — brainstorm.mentolder.de liefert keine unerwarteten 5xx-Fehler *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt
- **WHEN** der Browser `https://brainstorm.mentolder.de` aufruft
- **THEN** der Response hat Status 200, 301, 302, 404 oder 502 — 500, 503 und 504 sind Fehlersignale für ein sish/Pod-Problem

---
