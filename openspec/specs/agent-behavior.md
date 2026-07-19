# agent-behavior

## Purpose

Definiert Verhaltens-Guardrails für Agenten-Operationen gegen Produktionsumgebungen — zunächst den Prod-Write-Guard, der schreibende Datenbank-Operationen gegen produktive Namespaces blockiert bzw. nur mit explizitem Override erlaubt (Anlass: Vorfall T001954).

## Requirements

<!-- merged from change delta agent-behavior.md (115a5875a888) -->

### Requirement: Prod-namespace write block
The system SHALL maintain a denylist of production Kubernetes namespaces. Any `kubectl exec ... psql` command targeting a namespace in the denylist that contains DDL/DML statements SHALL be intercepted and blocked unless an explicit override flag is provided.

### Requirement: Guard emits structured output
When a write is blocked, the guard SHALL emit a line in the format `GUARD: prod-write-blocked namespace=<ns> op=<type> caller=<context>` to stderr, enabling automated detection and logging.

### Requirement: Override requires explicit flag
The `--confirm-prod-write` flag SHALL bypass the guard but SHALL be logged to the agent-lock or session-message system for auditability. The flag SHALL NOT be available to subagents (read-only agents lack bash write permission).

<!-- merged from change delta agent-behavior.md (e3d4ff2c50fa) -->