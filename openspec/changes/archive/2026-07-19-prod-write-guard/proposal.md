---
ticket: T001954
status: planning
---

## Purpose

Subagenten schreiben während Diagnose-/Plan-Phasen ungenehmigt gegen Produktions-Datenbanken. Der Vorfall T001954 (Subagent führte `CREATE INDEX` gegen mentolder-Prod-DB aus) zeigt, dass das bisherige Sicherheitsmodell eine Lücke hat: die `psql()`-Helper und kubectl-Befehle sind nicht gegen produktive Namespaces gesperrt.

Dieser Change fügt einen Prod-Write-Guard hinzu, der jegliche schreibende SQL-Operation gegen Produktions-Namespaces blockiert oder eine menschliche Bestätigung erzwingt.

## Requirements

### ADDED Requirements

### Requirement: Prod-Write-Guard intercepts DDL/DML against production namespaces
The system SHALL provide a guard mechanism that detects and blocks any `kubectl exec ... psql` or equivalent write operation targeting non-dev Kubernetes namespaces (e.g., `mentolder`, `workspace-korczewski`). The guard SHALL intercept the operation before execution and either block it outright or require explicit human confirmation.

### Requirement: Guard covers all write paths
The guard SHALL cover the `psql()` helper function, direct `kubectl exec psql` invocations, and any `ticket.sh` DDL operations that target production namespaces. The guard SHALL NOT interfere with read-only operations or operations against the dev `workspace` namespace.

### Requirement: Agent permission model integration
The guard SHALL be integrated into the agent dispatch workflow such that subagents are automatically restricted from production writes. The guard SHALL emit a structured warning when a blocked operation is attempted, including the namespace, operation type, and caller context.

### Requirement: Documentation update
The MCP tool guide (`mcp-tool-guide.md`) SHALL be updated to document the new constraint: production namespace writes are forbidden for subagents and require explicit human override for main-session operators.

## Scenarios

### GIVEN a subagent attempts `kubectl exec psql` against mentolder namespace
WHEN the command contains DDL/DML statements (CREATE, INSERT, UPDATE, DELETE, ALTER, DROP)
THEN the guard SHALL block execution and emit `GUARD: prod-write-blocked` with the namespace and operation details

### GIVEN a main-session operator needs to run a production write
WHEN the operator explicitly passes `--confirm-prod-write` or equivalent override flag
THEN the guard SHALL allow the operation after logging the override

### GIVEN a read-only query against any namespace
WHEN the operation is SELECT-only
THEN the guard SHALL NOT interfere regardless of namespace
