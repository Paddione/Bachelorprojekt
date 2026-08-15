## ADDED Requirements

### Requirement: Multi-Statement Queries Rejected Instead of Empty Array

The `mcp-postgres` server (local adapter
`scripts/mcp-gateway/mcp-postgres-local.mjs`, port 13001) SHALL reject SQL that
contains more than one statement with a JSON-RPC error, so that a
multi-statement response is never indistinguishable from an empty query
result. A single statement with a trailing semicolon SHALL remain accepted.

#### Scenario: Multi-statement SQL returns a JSON-RPC error *(BATS)*

- **GIVEN** the local `mcp-postgres` adapter is started against a reachable
  database
- **WHEN** a `query` tool call carries SQL with four semicolon-separated
  SELECT statements
- **THEN** the response is a JSON-RPC error
- **AND** the response contains no empty result array

#### Scenario: Rejection happens before database execution *(BATS)*

- **GIVEN** the local `mcp-postgres` adapter is started with an unreachable
  database
- **WHEN** a `query` tool call carries SQL with two semicolon-separated
  SELECT statements
- **THEN** the response is a JSON-RPC error naming the single-statement
  restriction
- **AND** the response is not a database connection failure

#### Scenario: Single-statement SQL still returns rows *(BATS)*

- **GIVEN** the local `mcp-postgres` adapter is started against a reachable
  database
- **WHEN** a `query` tool call carries a single SELECT statement
- **THEN** the response contains the query result rows

#### Scenario: Trailing semicolon is not treated as multi-statement *(BATS)*

- **GIVEN** the local `mcp-postgres` adapter is started against a reachable
  database
- **WHEN** a `query` tool call carries a single SELECT statement with a
  trailing semicolon
- **THEN** the response contains the query result rows
