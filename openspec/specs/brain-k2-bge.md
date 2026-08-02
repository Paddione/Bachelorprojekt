# brain-k2-bge

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu brain-k2-bge ergänzen._

## Requirements

### Requirement: Diagramm mit beschrifteten Kanten (REQ-k2-01)

#### Scenario: Diagramm-Erstellung

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K2 erstellt wird
**THEN** existiert ein Diagramm, das alle Knoten und Kanten beschriftet darstellt

### Requirement: Ist/Soll-Unterscheidung (REQ-k2-02)

#### Scenario: Ist/Soll-Visualisierung

**GIVEN** T002426 (CPU-Paar) ist plan_staged aber noch nicht gebaut
**WHEN** das K2-Diagramm wird erstellt
**THEN** sind Ist- und Soll-Komponenten visuell unterscheidbar

### Requirement: Vollständige Aufrufer-Erhebung (REQ-k2-03)

#### Scenario: Aufrufer-Survey

**GIVEN** die bge-Server laufen auf :8095/:8096
**WHEN** K2 wird dokumentiert
**THEN** sind alle Aufrufer mit Vektorraum-Zuordnung erfasst

### Requirement: Silent-Failure-Pfade (REQ-k2-04)

#### Scenario: Failure-Analyse

**GIVEN** der Reranker fiel historisch still auf score:0 zurück
**WHEN** K2 analysiert die Ausfallpfade
**THEN** ist dokumentiert, welche Kanten heute still degradieren

### Requirement: Host-SPOF und Endpunkt-Quellen (REQ-k2-05)

#### Scenario: SPOF-Dokumentation

**GIVEN** beide GPU-Server laufen auf demselben Windows-Host
**WHEN** K2 dokumentiert die Infrastruktur
**THEN** ist der Single Point of Failure sichtbar

<!-- merged from change delta brain-k2-bge.md (792c2920a8f4) -->

### Requirement: bge-mcp client env diagnostic (REQ-bge-01)

A diagnostic script MUST report whether the local bge-mcp client environment is
usable, distinguishing a missing token from an unreachable server.

#### Scenario: Token present and server reachable

- **GIVEN** `~/.config/bge-mcp/server.env` exists and contains `BGE_MCP_TOKEN`
- **WHEN** `scripts/bge-mcp/check-client-env.sh` is executed
- **THEN** it exits 0 and reports both the token and a 200 response from the server

#### Scenario: Token missing

- **GIVEN** `~/.config/bge-mcp/server.env` is absent OR contains no `BGE_MCP_TOKEN`
- **WHEN** the check is executed
- **THEN** it exits 1 and names the required fix

#### Scenario: Server unreachable

- **GIVEN** the bge-mcp server on `:13005` does not respond
- **WHEN** the check is executed
- **THEN** it exits 2 and reports the server as down

### Requirement: BATS coverage for all three outcomes (REQ-bge-02)

The three exit codes MUST be covered by a BATS test that drives the script
through a fake environment, verifying command output rather than source text.

#### Scenario: Fake environment exercises every exit code

- **GIVEN** a fake env in a tmpdir simulating the three states
- **WHEN** the BATS test runs
- **THEN** exit codes 0, 1 and 2 are each asserted

### Requirement: Documentation points at the diagnostic (REQ-bge-03)

The MCP tool guide MUST reference the check, so an agent hitting a bge-mcp auth
failure finds the diagnostic instead of guessing.

#### Scenario: Guide references the check script

- **GIVEN** the check script exists
- **WHEN** the diagnostic block in `mcp-tool-guide.md` is read
- **THEN** it names `scripts/bge-mcp/check-client-env.sh`

<!-- merged from change delta brain-k2-bge.md (b258b99d7a8a) -->