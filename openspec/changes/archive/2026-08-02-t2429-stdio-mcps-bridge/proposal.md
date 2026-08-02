# T002429 — stdio-MCPs über den llm-proxy als HTTP/SSE brücken

## 1. Problem

Die llama.cpp Web-UI (z.B. `http://localhost:8098/#/mcp-servers`) kann eigene MCP-Server einbinden, nimmt jedoch ausschliesslich eine URL entgegen. Von den elf Registry-Servern (`docs/agent-guide/registry/mcp.yaml`) sind nur die drei HTTP-basierten (mcp-kubernetes, mcp-postgres, factory-mcp, bge-mcp) dort eintragbar. Die acht stdio-Server — ticket-mcp, mcp-task-runner, codebase-memory-mcp, github-mcp, playwright, docfork, sequential-thinking, webresearch — sind für die Web-UI unsichtbar.

## 2. Ziel

Eine stdio-zu-HTTP/SSE-Brücke im llm-proxy (`scripts/llm-proxy/`, Port 18235), sodass jeder stdio-MCP-Server unter `http://127.0.0.1:18235/mcp/<name>` als SSE-Endpunkt erreichbar ist — nutzbar von der llama-Web-UI, von jedem HTTP-fähigen MCP-Client und als Voraussetzung für den Cluster-Betrieb (T002426-Konsolidierung).

## 3. Design-Entscheidungen

### 3.1 Ein Kindprozess pro Server, geteilt über alle HTTP-Sessions

**Entscheidung:** Pro Server wird genau ein stdio-Kindprozess gestartet, den sich alle HTTP-Clients teilen.

**Begründung:** HTTP ist inhärent sessionlos — ein Prozess pro HTTP-Session würde bei mehreren gleichzeitigen Web-UI-Tabs oder Browser-Neuladungen Prozesse anhäufen und Ressourcen verschwenden.

**Bekannte Einschränkung:** ticket-mcp liest beim Start `TICKET_MCP_REPO_ROOT` (heute auf `/home/patrick/Bachelorprojekt` fixiert). Ein `stage_plan` im Worktree schlägt fehl, weil der Server gegen main prüft. Dieses Verhalten wird durch die Brücke **verallgemeinert statt behoben** — es gilt jetzt für alle stdio-Server. Eine Pro-Worktree-Session-Lösung ist nicht Teil dieses Tickets.

### 3.2 Welche Server werden gebrückt

Der Config `scripts/llm/mcp-bridge.json` führt alle acht stdio-Server auf, jeweils mit `enabled: true|false`. Standardmässig enabled:
- `ticket-mcp` — aktiv genutzt, muss verfügbar sein
- `mcp-task-runner` — aktiv genutzt, muss verfügbar sein
- `codebase-memory-mcp` — aktiv genutzt, muss verfügbar sein

Standardmässig disabled (bereits in opencode disabled, s. Registry):
- `task-master-ai`, `github-mcp`, `playwright`, `docfork`, `sequential-thinking`, `webresearch`

Die Brücke startet nur enabled-Server. Disabled-Einträge sind dokumentiert, belegen keinen Port.

### 3.3 Authentifizierung

- Der llm-proxy bindet bereits auf `127.0.0.1` (T002102) — loopback reicht für den lokalen Host
- Pro Server kann ein `bearerTokenEnv` konfiguriert werden (Umgebungsvariable)
- Der llama-Web-UI-Dialog hat das Feld "Authorization / Bearer" — dort wird der Token hinterlegt
- Keine CORS-Header: die llama-Web-UI verbindet über `--ui-mcp-proxy` serverseitig (T002426), nicht browserdirekt

### 3.4 Ort im llm-proxy

- **Neues Modul:** `scripts/llm-proxy/mcp-bridge.mjs` — Kindprozess-Lebenszyklus, JSON-RPC-Routing, SSE-Session-Management
- **Keine Server-Klasse**: der llm-proxy ist ein reiner `http.createServer` — die Brücke fügt Handler-Funktionen hinzu, keinen Express-Router
- **Kein neuer Port**: die Routes `/mcp/<name>` laufen auf dem existierenden `:18235`

### 3.5 MCP-SDK-Nutzung

Das SDK `@modelcontextprotocol/sdk@1.29.0` liegt bereits unter `scripts/factory/node_modules/`. Genutzt werden:
- `StdioClientTransport` — startet Kindprozess, sendet/empfängt JSON-RPC über stdin/stdout
- Die ResponseMessage-Parser aus `shared/stdio.js` (via StdioClientTransport vererbt)

**Nicht genutzt** wird `StreamableHTTPServerTransport` — dieser wrappt einen *server*-seitigen HTTP-Endpunkt, benötigt aber einen MCP-*Server* (Server-Klasse) als Gegenstelle. Wir implementieren das SSE-Protokoll manuell, angelehnt an den MCP SSE-Transport-Spec, jedoch als Client-zum-Process-Vermittler.

### 3.6 Registry-Modellierung

Die Brücke wird in `docs/agent-guide/registry/mcp.yaml` pro Server als neuer `bridge`-Block dokumentiert:

```yaml
ticket-mcp:
  transport: stdio
  # ... bestehende harness-Einträge ...
  bridge:
    url: http://127.0.0.1:18235/mcp/ticket-mcp
    bind: 127.0.0.1:18235
    auth: TICKET_MCP_BRIDGE_TOKEN
```

Der `transport: stdio` bleibt unverändert — er beschreibt den nativen Transport der Server-Binärdatei. Der `bridge`-Block dokumentiert den überlagerten HTTP-Endpunkt. **Kein** Eintrag in `harness.llamacpp` (der war seit jeher fail-closed für HTTP, das bleibt so — die Brücke ist explizit ein anderer Mechanismus).

## 4. Dateistruktur

| Datei | Status | Zweck |
|-------|--------|-------|
| `scripts/llm/mcp-bridge.json` | **NEU** | Config: Liste der zu brückenden Server mit command, args, env, cwd, bearerTokenEnv, enabled |
| `scripts/llm-proxy/mcp-bridge.mjs` | **NEU** | Modul: Kindprozess-Start/Stop, JSON-RPC-Routing, SSE-Session-Management |
| `scripts/llm-proxy/mcp-bridge.test.mjs` | **NEU** | Tests: Prozess-Management (gemockt), Nachrichten-Routing, Session-Lebenszyklus |
| `scripts/llm-proxy/server.mjs` | **ÄNDERN** | Routes `/mcp/<name>` hinzufügen (GET für SSE, POST für JSON-RPC) |
| `docs/agent-guide/registry/mcp.yaml` | **ÄNDERN** | Bridge-Einträge pro stdio-Server dokumentieren |
| `openspec/changes/t2429-stdio-mcps-bridge/specs/local-llm-proxy.md` | **NEU** | Delta-Spec |

## 5. Protokoll (SSE-Bridge im Detail)

### Session-Aufbau (GET /mcp/<name>)

```
→ GET /mcp/ticket-mcp
← 200 OK
← Content-Type: text/event-stream
← Cache-Control: no-cache
←
← event: session_id
← data: {"sessionId":"550e8400-e29b-41d4-a716-446655440000"}
←
```

### Nachricht senden (POST /mcp/<name>)

```
→ POST /mcp/ticket-mcp
→ Content-Type: application/json
→ Authorization: Bearer <token>
→
→ {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
← 202 Accepted  (oder SSE-Event, wenn die Antwort asynchron kommt)
```

### Nachricht empfangen (via SSE-Stream)

```
← event: message
← data: {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}
←
```

Das entspricht dem MCP SSE-Transport-Spec (SDK 1.x, jetzt deprecated zugunsten Streamable HTTP). Wir verwenden SSE statt Streamable HTTP, weil die llama-Web-UI SSE spricht (via `--ui-mcp-proxy`).

## 6. Abgrenzung

- **T002426** (bge-MCP-Shim): Dieser Shim ist bereits HTTP/SSE. Wenn die Brücke fertig ist, *könnte* der Shim in die Brücke wandern — aber das ist NICHT Teil dieses Tickets, da T002426 bereits sechs gestagte Partials hat.
- **Cluster-Betrieb**: Die Brücke ist Voraussetzung, aber nicht Teil des Cluster-Deployments. Der llm-proxy läuft manuell (hat noch keinen Autostart wie die llama-Server T002110). Das Cluster-Deployment ist ein separates Ticket.
- **Pro-Worktree-Sessions**: Nicht adressiert (s. 3.1).
