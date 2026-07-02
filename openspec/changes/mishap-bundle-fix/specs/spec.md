## Purpose

Dieses Bundle fasst drei unabhängige Prozess-Frictions zusammen, die keine gemeinsame Capability-Spec benötigen. Jede Friction wird einzeln analysiert und behoben.

## ADDED Requirements

### Requirement: Fix process friction in dev-flow-execute
The implementation SHALL identify and fix the reported process friction in the dev-flow-execute flow.

#### Scenario: dev-flow-execute friction resolved
- **WHEN** a dev-flow-execute run encounters the reported condition
- **THEN** the run proceeds without the friction

### Requirement: Fix process friction in session-coordination
The implementation SHALL identify and fix the reported process friction in the session-coordination mechanism.

#### Scenario: session-coordination friction resolved
- **WHEN** parallel sessions coordinate via agent-lock/agent-msg
- **THEN** the reported coordination problem no longer occurs

### Requirement: Fix process friction in scripts/vda
The implementation SHALL identify and fix the reported process friction in the scripts/vda tooling.

#### Scenario: scripts/vda friction resolved
- **WHEN** using scripts/vda.sh or related VDA scripts
- **THEN** the reported friction no longer occurs
