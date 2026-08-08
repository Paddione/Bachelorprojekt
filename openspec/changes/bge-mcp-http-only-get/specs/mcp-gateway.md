## ADDED Requirements

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
