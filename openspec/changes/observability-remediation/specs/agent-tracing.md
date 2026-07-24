# agent-tracing

## Purpose

Agent-Tracing macht die Läufe der lokal gerenderten opencode-Modelle (aktuell
`bonsai-8b-1..4`, `gemma-1..4`, `deepseek-helper`, konfiguriert in
`.opencode/agent-models.jsonc`) nachvollziehbar: welches Modell, welche
Effort-Stufe, welche Tool-Call-Sequenz, wie lange, mit welchem Ergebnis. Die
Traces landen im Wissensgraphen von `codebase-memory-mcp` (`ingest_traces`),
abfragbar über `query_graph`/`trace_path` — nicht in Grafana/Loki. Begleitend
definiert ein Config-Standard-Dokument die Bedeutung jedes Config-Feldes in
`agent-models.jsonc`, damit Einstellungsänderungen auf einer klaren, benannten
Absicht beruhen statt auf Vermutung.

## ADDED Requirements

### Requirement: opencode plugin captures a full session trace

The system SHALL provide an opencode plugin (source tracked at
`.opencode/plugins/agent-tracer.ts` in this repository, synced to
`~/.config/opencode/plugins/` via the existing `opencode-sync-agents.sh`
pattern) that hooks the plugin lifecycle events available in
`@opencode-ai/plugin` (at minimum `tool.execute.before` and the `session.idle`/
`session.deleted` events) to accumulate, per session: the configured model
identifier, the effort/agent role, the ordered tool-call sequence (tool name +
args signature), start/end timestamps, and the terminal outcome
(`completed`/`aborted`/`error`).

#### Scenario: Tool calls are recorded in order

- **GIVEN** a session dispatches to agent `gemma-2` and calls tools `read` then `bash`
- **WHEN** the plugin's `tool.execute.before` hook fires for each call
- **THEN** the session's accumulated trace lists `read` before `bash` with their args signatures

#### Scenario: Session end flushes the trace

- **GIVEN** a session has accumulated a tool-call sequence and a model identifier
- **WHEN** a `session.idle` or `session.deleted` event fires for that session
- **THEN** the plugin calls `ingest_traces` with the full accumulated trace and clears the in-memory session state

### Requirement: Traces are queryable in the codebase-memory knowledge graph

The system SHALL ensure `ingest_traces` output is queryable via
`codebase-memory-mcp`'s `query_graph`/`trace_path` tools, at minimum allowing a
query for "all traces for model X in the last N days" and "average duration per
model".

#### Scenario: Traces for a given model are retrievable

- **GIVEN** at least one trace was ingested for model `bonsai-8b-2`
- **WHEN** an operator runs a `query_graph` query filtered on that model identifier
- **THEN** the ingested trace is returned with its tool-call sequence and duration

### Requirement: Agent config standard reference document

The system SHALL provide `.claude/skills/references/agent-config-standard.md`
documenting, for every config field used in `.opencode/agent-models.jsonc`
(`model`, `effort`/equivalent, `temperature`, agent `purpose`), its meaning,
valid range, and at least one worked decision example (when to pick which
value and why).

#### Scenario: Every active config field has a documented entry

- **GIVEN** the set of distinct top-level keys used across `.opencode/agent-models.jsonc` agent entries
- **WHEN** `agent-config-standard.md` is checked
- **THEN** every one of those keys has a corresponding documented section

### Requirement: agent-models.jsonc references the config standard

The system SHALL add a short inline comment above the `agent` and `provider`
sections of `.opencode/agent-models.jsonc` pointing to
`.claude/skills/references/agent-config-standard.md`.

#### Scenario: Config file links to the standard

- **GIVEN** `.opencode/agent-models.jsonc` is opened
- **WHEN** the `agent` section is located
- **THEN** a comment immediately above it references `agent-config-standard.md`
