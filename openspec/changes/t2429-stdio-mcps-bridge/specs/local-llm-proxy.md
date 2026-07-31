# local-llm-proxy (Delta Spec for T002429)

## Purpose

Die stdio-zu-HTTP/SSE-Brücke im llm-proxy ermöglicht es, stdio-basierte MCP-Server als SSE-Endpunkte unter `/mcp/<name>` zu exponieren. Dies erlaubt die Einbindung der stdio-Server in Clients wie die llama.cpp Web-UI, die ausschließlich HTTP/SSE-Verbindungen unterstützen.

## ADDED Requirements

### Requirement: Stdio to HTTP/SSE bridging

The llm-proxy SHALL bridge stdio-based MCP servers to HTTP/SSE endpoints. It SHALL load configuration from a JSON file, spawn child processes for enabled servers, establish SSE sessions, and route JSON-RPC messages between clients and child processes.

#### Scenario: Clients establish SSE session to a bridged server

- **GIVEN** the server `ticket-mcp` is enabled in `mcp-bridge.json`
- **WHEN** a client sends a `GET /mcp/ticket-mcp` request to the proxy
- **THEN** the proxy starts the `ticket-mcp` process, establishes an SSE stream, generates a session ID, and sends it to the client

#### Scenario: Client sends JSON-RPC message to a bridged server

- **GIVEN** an active SSE session with ID `s1` for `ticket-mcp` exists
- **WHEN** the client sends `POST /mcp/ticket-mcp?sessionId=s1` with a JSON-RPC payload
- **THEN** the proxy forwards the payload to the stdin of the `ticket-mcp` process and responds with HTTP status 202

#### Scenario: Client sends request without authorization token when configured

- **GIVEN** `ticket-mcp` requires a bearer token from `TICKET_MCP_BRIDGE_TOKEN` and the client request has an invalid or missing Authorization header
- **WHEN** the client sends a request to `/mcp/ticket-mcp`
- **THEN** the proxy responds with HTTP status 401
