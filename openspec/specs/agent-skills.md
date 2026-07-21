# agent-skills

## Purpose

Definiert Regeln für die Ausführung von Agent-Skills, inklusive Schutz vor git-crypt-Artefakten und Deduplizierung von Ticket-Intake.

## Requirements

### Requirement: dev-flow-chore Step 4 must not stage git-crypt smudge artifacts

`dev-flow-chore/SKILL.md` Step 4 (Commit, Push & PR) MUST stage only the files the chore actually changed, and MUST refuse to commit if the index contains any path under `environments/.secrets/**` (git-crypt-protected). A bare `git add -A` is forbidden because the git-crypt clean/smudge filter surfaces ~21 files in `environments/.secrets/**` as "modified" in every worktree, and a blanket `git add -A` would promote those artifacts into the index.

#### Scenario: chore on files outside environments/.secrets/

- **GIVEN** a chore that changed `scripts/foo.sh` and `Taskfile.yml`
- **WHEN** Step 4 is executed and the index contains only those paths
- **THEN** the commit lands and the secret-in-index guard does not abort

#### Scenario: chore accidentally pulls a git-crypt smudge artifact into the index

- **GIVEN** `environments/.secrets/dev.yaml` is in the working tree (git-crypt smudge) and a bare `git add -A` was run
- **WHEN** Step 4 reaches the secret-in-index guard
- **THEN** the skill aborts with a `FATAL: environments/.secrets/** must not be staged (git-crypt)` message and `exit 1`

### Requirement: ticket-ops must deduplicate intake by ticket title

`ticket-ops/SKILL.md` Phase 4 Step 4.4 (GitHub Issue Intake) and Phase 1 Step 1.4 MUST look up an existing open ticket with the same (case-insensitive, whitespace-normalised) title before creating a new row from an intake source. If a duplicate is found, the existing `external_id` is reused, a `ticket_comments` row is appended noting the re-trigger source, and no new `tickets.tickets` row is created. This prevents a repeated upstream signal (factory tick, cron re-fail, event replay) from creating N near-duplicate rows.

#### Scenario: GitHub Issue intake for a brand-new issue

- **GIVEN** a GitHub issue with title "Cockpit Fullscreen"
- **AND** no open ticket with that title exists
- **WHEN** Step 4.4 runs the title-dedupe lookup
- **THEN** a new `tickets.tickets` row is created and the GitHub issue is closed as tracked

#### Scenario: GitHub Issue intake for a re-triggered upstream signal

- **GIVEN** canonical reference ticket T001147 "E2E notification test — Playwright FA-bug-notify" exists and is `done`
- **AND** a new GitHub issue arrives with the same title
- **WHEN** Step 4.4 runs the title-dedupe lookup
- **THEN** no new row is created, a `ticket_comments` row is appended to T001147 noting the re-trigger, and the GitHub issue is closed as "Duplicate of T001147"

<!-- merged from change delta agent-skills.md on 2026-07-01 -->

<!-- consolidated from micro-spec agent-push-notifications [T002014] -->

### Requirement: Agent-Push-Notification-Delivery

The system SHALL deliver opencode- and agy-Session-Events as HTTP-POST to a self-hosted ntfy-Server within 10 seconds of the event.

#### Scenario: Push bei aktiviertem Opt-in

- **GIVEN** Patrick hat opencode-Notifications in den Admin-Einstellungen aktiviert
- **WHEN** eine opencode-Session endet mit Exit-Code 0
- **THEN** sendet scripts/agent-push.sh einen POST an das Topic bachelorprojekt-opencode

#### Scenario: Kein Push bei deaktiviertem Opt-in

- **GIVEN** Opt-in ist deaktiviert (default)
- **WHEN** eine Session endet
- **THEN** sendet scripts/agent-push.sh keinen POST (fail-closed)

#### Scenario: Retry bei ntfy-Fehler

- **GIVEN** ntfy-Server ist nicht erreichbar
- **WHEN** scripts/agent-push.sh versucht zu senden
- **THEN** retryt 3x mit Backoff, beendet sich mit exit 0 (Session wird nicht blockiert)

<!-- consolidated from micro-spec agent-behavior [T002014] -->

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