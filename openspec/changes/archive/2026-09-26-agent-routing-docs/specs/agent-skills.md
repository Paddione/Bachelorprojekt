## ADDED Requirements

### Requirement: Recall-Schichtwahl für Agenten

The repository SHALL document the recall layer choice for agents:
known symbols resolve via the K3 code graph first, semantic questions
via the K1 embeddings first, doctrine and process questions via the
authored K4 core in `docs/`; the linear fallback order SHALL be
K1 → K3 → K4. A single routing page SHALL carry the decision tree,
the freshness table with sourced bounds, and the ownership note, and
the agent surfaces (contributor guide, capability registry, MCP tool
guide, primary prompts) SHALL reference it.

#### Scenario: Agent with a known symbol

- **GIVEN** an agent looking for a known symbol or call chain
- **WHEN** it consults the routing page
- **THEN** it is directed to the K3 code graph first

#### Scenario: Agent with a semantic question

- **GIVEN** an agent asking what the codebase does about X
- **WHEN** it consults the routing page
- **THEN** it is directed to the K1 embeddings first

#### Scenario: Agent with a doctrine question

- **GIVEN** an agent asking how the project does X (process, ADR, runbook)
- **WHEN** it consults the routing page
- **THEN** it is directed to the authored K4 core in `docs/` first

#### Scenario: Freshness bounds are sourced

- **GIVEN** the routing page freshness table
- **WHEN** it is read
- **THEN** K1 states merge-coupling without a time SLA, K3 states the
  interval-plus-duration bound, and K4 states authoring-time capture
