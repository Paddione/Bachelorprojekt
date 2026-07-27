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

### Requirement: The tracked skill inventory must contain no redirect-only or archived skills

`.claude/skills/` MUST NOT contain a tracked `SKILL.md` whose entire body is a redirect to
another skill or to a framework built-in. A skill directory qualifies as redirect-only when its
`description` frontmatter carries a `[STUB]` marker, or when it declares `archived: true` and
names a successor skill instead of a runbook.

Every entry in `.claude/skills/` is eagerly listed by name and `description` in every agent
session across Claude Code, agy and opencode. A redirect-only entry therefore costs context in
every session while contributing no executable workflow.

A skill MUST NOT declare a `name:` frontmatter value that collides with a skill provided by an
installed plugin (for example `superpowers:writing-plans`). Resolution order between a
project-local skill and an identically named plugin skill is not specified by any harness, so a
collision makes it unpredictable which body loads.

#### Scenario: a redirect-only stub is present in the tracked inventory

- **GIVEN** `.claude/skills/test-driven-development/SKILL.md` exists and is tracked by git
- **AND** its `description` frontmatter begins with `[STUB]`
- **WHEN** the skill inventory is audited
- **THEN** the directory is removed and any cross-reference to it is rewritten to name the
  replacement skill directly

#### Scenario: a project-local skill shadows a plugin skill name

- **GIVEN** `.claude/skills/superpowers-writing-plans/SKILL.md` declares
  `name: superpowers:writing-plans`
- **AND** the installed superpowers plugin provides a skill with the same name
- **WHEN** the skill inventory is audited
- **THEN** the project-local directory is removed so exactly one skill answers to that name

#### Scenario: a skill superseded by another skill's section is retained as a tombstone

- **GIVEN** `.claude/skills/llm-ops/SKILL.md` declares `archived: true` and points at
  `infra-ops` section 5
- **WHEN** the skill inventory is audited
- **THEN** the directory is removed and the references in `OVERVIEW.md`,
  `.claude/skills/infra-ops/SKILL.md` and `.claude/agents/bachelorprojekt-ops.md` name
  `infra-ops` directly

### Requirement: Removing a skill must keep the inventory health goals at target

Any change that adds or removes a directory under `.claude/skills/` MUST update
`.claude/skills/OVERVIEW.md` in the same change so that the skill count claimed there equals the
number of tracked `SKILL.md` files, which is what G-AGENTIC06 measures via
`git ls-files -- .claude/skills` filtered on `/SKILL.md`.

The change MUST also leave G-AGENTIC07 (orphaned active skills) at zero: every retained skill
that carries a `description` field MUST still be referenced from at least one of `CLAUDE.md`,
`AGENTS.md`, `.claude/skills/OVERVIEW.md`, or another `SKILL.md`.

#### Scenario: skills are removed and the counter is updated in the same change

- **GIVEN** 11 tracked skill directories are removed, leaving 28 tracked `SKILL.md` files
- **WHEN** `task freshness:check` runs
- **THEN** G-AGENTIC06 measures 0 because `OVERVIEW.md` claims 28

#### Scenario: removing a cross-reference orphans a retained skill

- **GIVEN** a retained skill with a `description` field whose only reference was in a removed
  stub's body
- **WHEN** the stub is removed without adding a replacement reference
- **THEN** G-AGENTIC07 rises above zero and the change is incomplete until a reference is
  restored in `OVERVIEW.md` or another `SKILL.md`

### Requirement: Locally installed untracked skills must be recorded, not silently ignored

Skills installed outside git (for example via market-cli) are listed by Claude Code but cannot be
removed by a pull request. `.claude/skills/OVERVIEW.md` MUST name every such untracked skill that
is present, so the gap between what an agent session lists and what the repository controls is
visible rather than implicit.

#### Scenario: an untracked skill is present in the working copy

- **GIVEN** `.claude/skills/whisper/SKILL.md` exists but is not tracked by git
- **WHEN** the skill inventory is audited
- **THEN** `OVERVIEW.md` records it as locally installed and untracked, and the removal is
  described as a manual operator step

<!-- merged from change delta agent-skills.md (506345c01db1) -->