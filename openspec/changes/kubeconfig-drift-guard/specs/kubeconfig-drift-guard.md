## ADDED Requirements

### Requirement: Ticket write commands reject loopback-resolved contexts

The system SHALL resolve the kubeconfig server host of the active context before
executing any ticket write command and SHALL abort that command with a non-zero
exit code when the resolved host is a loopback address (`127.0.0.0/8`, `::1`,
`localhost`). The error output SHALL name the loopback condition, the context
and cluster names, the resolved server URL, and the remediation options
(`TICKET_ALLOW_LOCAL_CTX=1` escape hatch or kubeconfig repair).

#### Scenario: Loopback server aborts write command

- **GIVEN** the active kubeconfig context resolves to a server with a loopback host such as `https://127.0.0.1:6446`
- **WHEN** a write command is executed through `scripts/ticket.sh`
- **THEN** the command exits non-zero without touching the database and its output names `loopback`, the context and cluster, the resolved server, and the remediation

#### Scenario: LAN server allows write command

- **GIVEN** the active kubeconfig context resolves to a non-loopback server such as `https://10.0.33.1:6446`
- **WHEN** a write command is executed through `scripts/ticket.sh`
- **THEN** the guard passes and the command proceeds normally

### Requirement: Local-context escape hatch warns instead of aborting

The system SHALL let an operator bypass the loopback rejection by setting
`TICKET_ALLOW_LOCAL_CTX=1`; in that case the guard SHALL print a `WARN:` line
naming the loopback server to stderr and SHALL let the command proceed.

#### Scenario: Escape hatch downgrades abort to warning

- **GIVEN** the active context resolves to a loopback server and `TICKET_ALLOW_LOCAL_CTX=1` is set
- **WHEN** a write command is executed
- **THEN** the command proceeds and stderr contains a `WARN:` line naming the loopback server

### Requirement: Guard fails closed on unusable context data

The system SHALL treat a missing context or a missing cluster server entry as
drift and SHALL abort the write command (fail-closed).

#### Scenario: Missing context or server aborts

- **GIVEN** the requested context does not exist in the kubeconfig or its cluster has no resolvable server entry
- **WHEN** a write command is executed
- **THEN** the command exits non-zero with a diagnostic naming the unresolved context

### Requirement: Guard scope is limited to online write commands

The system SHALL invoke the guard only for commands in the ticket CLI's write
set (create, update-status, update-fields, set-parent, add-comment,
archive-plan, enqueue, stage-plan, release-hold) and only when
`TICKET_OFFLINE != 1`. Read commands and offline mode SHALL NOT run the guard.

#### Scenario: Read commands skip the guard

- **GIVEN** `TICKET_OFFLINE` is unset and a read command such as `get` runs against a loopback-resolved context
- **WHEN** the command executes
- **THEN** the guard does not block it

#### Scenario: Offline mode skips the guard

- **GIVEN** `TICKET_OFFLINE=1` is set
- **WHEN** any ticket command executes
- **THEN** the guard is not invoked
