## ADDED Requirements

### Requirement: Task dependency graph is retrievable as Mermaid or JSON
The system SHALL provide a `get_task_graph` tool that parses the Taskfile and returns the full task dependency DAG. The default output format SHALL be Mermaid (`graph TD`). JSON format SHALL be available via an explicit `format=json` parameter.

#### Scenario: Get graph in default Mermaid format
- **WHEN** a caller invokes `get_task_graph` without a `format` parameter
- **THEN** the tool returns a valid Mermaid `graph TD` diagram string with all tasks as nodes and dependencies as directed edges

#### Scenario: Get graph in JSON format
- **WHEN** a caller invokes `get_task_graph` with `format=json`
- **THEN** the tool returns a JSON object `{"nodes": [...], "edges": [{"from": "...", "to": "..."}]}` where `from` must run before `to`

#### Scenario: Mermaid node IDs are sanitized
- **WHEN** the Taskfile contains tasks with special characters in names (`:`, `-`, `.`, `/`)
- **THEN** Mermaid node IDs replace those characters with `_`, while node labels show the original task name

#### Scenario: Output is deterministically ordered
- **WHEN** `get_task_graph` is called multiple times on the same Taskfile
- **THEN** the output (nodes and edges) is in the same alphabetical order each time

#### Scenario: Taskfile with no dependencies
- **WHEN** the Taskfile contains tasks with no `deps` entries
- **THEN** the tool returns all tasks as nodes and an empty edges array
