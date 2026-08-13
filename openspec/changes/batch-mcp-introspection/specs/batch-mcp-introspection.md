## ADDED Requirements

### Requirement: Vollständige Triage-Projektion in ticket list

The system SHALL include in the JSON projection of `ticket.sh list` (and the MCP `list_tickets`/`export_tickets` tools that pass it through) the fields needed for triage without a second query: `component`, `areas`, `depends_on`, `readiness`, `effort`, `planning_rank`, `desc_len` (length of `description`), and `updated_at` — in addition to the existing `external_id`, `title`, `status`, `type`, `priority`, `severity`, `attention_mode`, and `created_at`.

#### Scenario: Triage-Query über list beantwortbar

- **GIVEN** a ticket with `component`, `areas`, `depends_on`, `readiness`, `effort`, `planning_rank`, `description`, and an `updated_at` timestamp
- **WHEN** a caller runs `ticket.sh list` (or the MCP tools that pass its output through)
- **THEN** every returned row carries those fields as JSON keys (values may be NULL)

### Requirement: OpenSpec-Such-URL defaultet lokal

The system SHALL default the OpenSpec search URL (`OPENSPEC_SEARCH_URL`) to `http://localhost:4321` in every consumer — the factory-mcp Go server, the legacy Node MCP server, and `plan-context.sh` — so that MCP clients outside the cluster can reach the search endpoint without a cluster-internal DNS name.

#### Scenario: OpenSpec-Suche ohne Cluster-DNS

- **GIVEN** a factory-mcp server started without `OPENSPEC_SEARCH_URL` set
- **WHEN** it performs an `openspec_find_similar` search
- **THEN** it requests `http://localhost:4321/api/openspec/search` and never resolves `svc.cluster.local`

### Requirement: factory_ask antwortet vor dem Client-Timeout

The system SHALL bound the `factory_ask` LLM roundtrip with a server-side context timeout that is strictly below the MCP client request timeout (~60s), so the client does not abort with `-32001` before the server answers.

#### Scenario: Factory-Frage innerhalb der Client-Frist

- **GIVEN** an MCP client with a ~60s request timeout
- **WHEN** it calls `factory_ask` with a question
- **THEN** the server-side timeout for the LLM call is below 60s, and the client receives the answer (or a server error) before its own deadline

### Requirement: factory_phase_events Zeit-Spalte bleibt `at`

The system SHALL keep `at` as the timestamp column of `tickets.factory_phase_events` and read phase-event timestamps from it in the timeline projection, so introspective queries against the schema keep working.

#### Scenario: Timeline liest Phasen-Events

- **GIVEN** a ticket with a recorded phase event
- **WHEN** `ticket.sh get-timeline` is run for that ticket
- **THEN** the timeline contains the phase event with a populated `ts` value read from the `at` column
