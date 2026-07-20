# agent-behavior

## Purpose

Definiert Verhaltens-Guardrails für Agenten-Operationen gegen Produktionsumgebungen — zunächst den Prod-Write-Guard, der schreibende Datenbank-Operationen gegen produktive Namespaces blockiert bzw. nur mit explizitem Override erlaubt (Anlass: Vorfall T001954).

## Requirements

<!-- merged from change delta agent-behavior.md (115a5875a888) -->

### Requirement: Prod-namespace write block
The system SHALL maintain a denylist of production Kubernetes namespaces. Any `kubectl exec ... psql` command targeting a namespace in the denylist that contains DDL/DML statements SHALL be intercepted and blocked unless an explicit override flag is provided.

#### Scenario: DML against a denylisted namespace is blocked

- **GIVEN** the namespace `workspace` is on the production denylist
- **WHEN** an agent runs `kubectl exec -n workspace ... psql -c "UPDATE tickets SET ..."` without an override flag
- **THEN** the guard intercepts the command and it is not executed
- **AND** the guard exits non-zero

#### Scenario: Read-only query against a denylisted namespace passes

- **GIVEN** the namespace `workspace` is on the production denylist
- **WHEN** an agent runs `kubectl exec -n workspace ... psql -c "SELECT count(*) FROM tickets"`
- **THEN** the command is executed normally (no DDL/DML detected)

### Requirement: Guard emits structured output
When a write is blocked, the guard SHALL emit a line in the format `GUARD: prod-write-blocked namespace=<ns> op=<type> caller=<context>` to stderr, enabling automated detection and logging.

#### Scenario: Blocked write produces a parseable stderr line

- **GIVEN** a DML command against a denylisted namespace is intercepted
- **WHEN** the guard blocks it
- **THEN** stderr contains a line matching `GUARD: prod-write-blocked namespace=<ns> op=<type> caller=<context>`
- **AND** the line is machine-parseable for automated detection

### Requirement: Override requires explicit flag
The `--confirm-prod-write` flag SHALL bypass the guard but SHALL be logged to the agent-lock or session-message system for auditability. The flag SHALL NOT be available to subagents (read-only agents lack bash write permission).

#### Scenario: Explicit override bypasses the guard with audit trail

- **GIVEN** a DML command against a denylisted namespace
- **WHEN** it is invoked with `--confirm-prod-write`
- **THEN** the command executes
- **AND** the override is recorded in the agent-lock or session-message system

#### Scenario: Subagents cannot use the override

- **GIVEN** a read-only subagent without bash write permission
- **WHEN** it attempts a prod write with `--confirm-prod-write`
- **THEN** the override is not available and the write remains blocked

<!-- merged from change delta agent-behavior.md (e3d4ff2c50fa) -->