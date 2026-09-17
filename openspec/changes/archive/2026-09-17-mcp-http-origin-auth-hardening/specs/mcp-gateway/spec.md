## ADDED Requirements

### Requirement: REQ-MCP-HTTP-001 Local HTTP MCP request boundary

Every repository-managed HTTP MCP endpoint SHALL validate the HTTP `Host` header and every present `Origin` header before dispatching an MCP method or forwarding a request. Accepted hosts SHALL be limited to the explicitly configured local hostnames and loopback addresses. Requests without an `Origin` header SHALL remain valid for non-browser MCP clients when their host and authentication are valid.

#### Scenario: Local CLI client has no Origin header

- **GIVEN** an authenticated MCP client connects through an allowed loopback host without an `Origin` header
- **WHEN** it sends a valid MCP request
- **THEN** the server processes the request normally

#### Scenario: Foreign browser origin is rejected

- **GIVEN** a request carries an `Origin` that is not present in the configured browser-origin allowlist
- **WHEN** it reaches any repository-managed HTTP MCP endpoint
- **THEN** the endpoint responds with HTTP 403 before dispatching or forwarding the MCP payload
- **AND** the response does not grant that origin CORS access

#### Scenario: Rebinding host is rejected

- **GIVEN** a request reaches a loopback listener with an unapproved or malformed `Host` header
- **WHEN** the HTTP request boundary evaluates it
- **THEN** the endpoint responds with HTTP 403 before reading or executing an MCP tool request

### Requirement: REQ-MCP-HTTP-002 Explicit browser-origin CORS policy

An HTTP MCP endpoint that supports browser clients SHALL return CORS headers only for an exact origin in its configured allowlist. It MUST NOT emit `Access-Control-Allow-Origin: *`, reflect arbitrary requested headers, or authorize a preflight request from an unapproved origin. An allowed response SHALL carry `Vary: Origin`.

#### Scenario: Llama Web UI origin is allowed

- **GIVEN** the configured allowlist contains the exact llama Web UI origin
- **WHEN** that origin sends an authenticated MCP request or preflight request
- **THEN** the response names that exact origin in `Access-Control-Allow-Origin`
- **AND** the response carries `Vary: Origin`

#### Scenario: Arbitrary preflight headers are not reflected

- **GIVEN** a browser from an unapproved origin requests arbitrary headers in an OPTIONS preflight
- **WHEN** the endpoint evaluates the preflight
- **THEN** it responds with HTTP 403
- **AND** it does not copy the requested header list into `Access-Control-Allow-Headers`

### Requirement: REQ-MCP-HTTP-003 Bearer authentication for protected local MCP endpoints

Every local HTTP endpoint exposing MCP tools, database results, cluster information, or request forwarding SHALL require a server-specific bearer token. Token comparison SHALL not disclose comparison timing, and a server that requires a token SHALL fail startup when its token is absent or empty. A minimal process-liveness route MAY remain unauthenticated when it exposes no tool, configuration, build, database, or cluster details, but it remains subject to Host and Origin validation.

#### Scenario: Missing token cannot invoke a tool

- **GIVEN** a protected local MCP endpoint is running
- **WHEN** a request reaches its MCP route without an Authorization header
- **THEN** it responds with HTTP 401 and a `WWW-Authenticate: Bearer` header
- **AND** no tool handler or upstream request runs

#### Scenario: Wrong token cannot invoke a tool

- **GIVEN** a protected local MCP endpoint is running
- **WHEN** a request carries a bearer token different from that endpoint's configured token
- **THEN** it responds with HTTP 401 before MCP dispatch or forwarding

#### Scenario: Missing server token fails closed

- **GIVEN** a protected repository-managed HTTP MCP server or security proxy starts without its required token
- **WHEN** initialization evaluates the environment
- **THEN** the process exits non-zero with an actionable error
- **AND** it never opens the protected listener

### Requirement: REQ-MCP-HTTP-004 Browser proxy preserves the upstream security boundary

A local browser proxy in front of an MCP upstream SHALL authenticate and validate Host and Origin locally before removing or rewriting browser security headers. A rejected request MUST NOT create an upstream connection. The proxy SHALL forward only an explicit header allowlist and MUST NOT transparently pass hop-by-hop or arbitrary browser-controlled headers.

#### Scenario: Unauthorized request never reaches Kubernetes MCP

- **GIVEN** the Kubernetes MCP browser proxy receives a request with a missing token or foreign origin
- **WHEN** it evaluates the request
- **THEN** it rejects the request locally
- **AND** the Kubernetes MCP upstream receives no connection or payload

#### Scenario: Authorized browser request is normalized before forwarding

- **GIVEN** a request has an allowed host, allowed browser origin, and valid proxy token
- **WHEN** the proxy forwards it to an upstream that rejects browser-origin headers
- **THEN** the proxy removes those headers only after local validation
- **AND** it forwards only the documented MCP and transport headers

### Requirement: REQ-MCP-HTTP-005 MCP authentication secrets stay outside tracked artifacts

The MCP registry SHALL declare Authorization headers for every protected HTTP MCP client using environment references. Registry generation SHALL preserve unresolved secret references in tracked files and SHALL resolve plaintext only into explicitly untracked, owner-readable runtime configuration where a harness cannot expand environment references itself.

#### Scenario: Generated tracked configurations contain no token value

- **GIVEN** protected MCP servers are declared in the registry
- **WHEN** tracked harness configurations are generated
- **THEN** each Authorization header contains an environment reference rather than a literal token
- **AND** the generation check fails if a known plaintext token is found in a tracked output

#### Scenario: Harness receives the correct server-specific token

- **GIVEN** the required token environment variables are available to the generator or harness
- **WHEN** the harness connects to each protected HTTP MCP server
- **THEN** it sends the token assigned to that server
- **AND** a token assigned to one server does not authorize a different server
