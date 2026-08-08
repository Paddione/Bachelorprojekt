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

### Requirement: OVERVIEW.md must name the complete vendor skill set

`.claude/skills/OVERVIEW.md` MUST list every tracked skill that originates outside this
repository in its third-party section. The section is the single machine-readable source for the
project-owned / vendor split: a tracked skill is **project-owned** exactly when its directory
name does not appear in that section.

Without this list the split exists only in prose, so no gate can scope itself to project-owned
skills without hardcoding a name list that drifts independently.

`OVERVIEW.md` MUST NOT name a skill directory that does not exist, and entries MUST link to the
source `SKILL.md` rather than to a rendered artifact under `k3d/docs-content-built/`, which does
not survive a rename and is not readable from a repository checkout.

#### Scenario: a vendor skill is missing from the third-party section

- **GIVEN** `.claude/skills/vitest/SKILL.md` is tracked and carries `metadata.author: Anthony Fu`
- **AND** `OVERVIEW.md` does not name `vitest` in its third-party section
- **WHEN** the project-owned skill set is derived from `OVERVIEW.md`
- **THEN** `vitest` is wrongly counted as project-owned and the derivation is rejected until the
  section names it

#### Scenario: OVERVIEW.md names a removed skill

- **GIVEN** `OVERVIEW.md` contains a row for `cluster-deployment`
- **AND** no directory `.claude/skills/cluster-deployment/` exists
- **WHEN** the skill inventory is audited
- **THEN** the row is removed, and any capability it described is attributed to the skill that
  absorbed it

### Requirement: Every active project-owned skill must carry a description

Each project-owned `SKILL.md` MUST declare a YAML frontmatter block containing a `description`
field, unless it declares `archived: true`. A skill whose file begins without a frontmatter
delimiter has no description at all: the harness falls back to the first heading, which is a
title rather than a trigger phrase, so the skill can only ever be reached by being named
explicitly.

The `description` MUST name the concrete terms the skill is meant to fire on — paths, commands,
domain nouns — rather than only its category. Where a skill must NOT fire automatically, the
`description` MUST say so.

The `archived: true` exemption mirrors the existing G-AGENTIC07 measurement, which likewise only
counts skills that carry a `description`.

#### Scenario: a project-owned skill has no frontmatter block

- **GIVEN** `.claude/skills/brain-ingest/SKILL.md` starts with `# brain-ingest` on line 1
- **WHEN** the skill frontmatter is audited
- **THEN** a frontmatter block with `name` and a trigger-bearing `description` is added

#### Scenario: an archived skill deliberately omits its description

- **GIVEN** `.claude/skills/update-dependencies/SKILL.md` declares `archived: true` and no
  `description`
- **WHEN** the skill frontmatter is audited
- **THEN** the omission is accepted, because the skill runs as a scheduled routine and is not
  meant to be listed in interactive sessions

### Requirement: Project-owned skill bodies must respect the progressive-disclosure budget

A project-owned `SKILL.md` MUST NOT exceed 250 lines. Every skill name and `description` in
`.claude/skills/` is eagerly listed in every agent session, and the body is loaded in full on
invocation; an oversized body spends context on procedure detail that most invocations never
reach.

Detail that exceeds the budget MUST be moved into `.claude/skills/references/` and linked from
the body, following the pattern already established there. Decision logic, guards and stop
conditions MUST remain in the body — only procedure detail such as command sequences, lookup
tables and special cases may be relocated, and each link MUST state what the target file
contains so the reader can decide whether to follow it.

Shortening a body MUST NOT remove a step. This requirement governs where content lives, not
whether a workflow keeps it.

#### Scenario: an orchestrator skill exceeds the budget

- **GIVEN** `.claude/skills/dev-flow-execute/SKILL.md` has 486 lines
- **WHEN** the progressive-disclosure budget is enforced
- **THEN** procedure detail is moved into `.claude/skills/references/` and the body links to it,
  leaving the body at 250 lines or fewer with every step still reachable

#### Scenario: a vendor skill exceeds the budget

- **GIVEN** `.claude/skills/gitops-knowledge/SKILL.md` has 460 lines
- **AND** `OVERVIEW.md` names `gitops-knowledge` in its third-party section
- **WHEN** the progressive-disclosure budget is enforced
- **THEN** the file is left unchanged, because upstream-maintained skills are out of scope and
  editing them would create merge conflicts on the next sync

### Requirement: Skill frontmatter must be parseable YAML

Every tracked `SKILL.md` MUST open with a YAML frontmatter block that a standard YAML parser can
load into a mapping containing a `name` key.

An unquoted plain scalar ends its key at the first `: ` (colon followed by space). A
`description` such as `Triggers on: database migration, ALTER TABLE` therefore does not parse as
a string — the parser sees a nested mapping and fails. Harnesses that extract the description by
regex tolerate this, but a frontmatter that a standard parser rejects cannot be relied on as the
source of a skill's trigger terms, and any tooling built on it breaks silently.

Values containing `: ` MUST be quoted.

#### Scenario: a description contains an unquoted colon

- **GIVEN** `.claude/skills/database-specialist/SKILL.md` declares
  `description: Use for … Triggers on: database migration, ALTER TABLE`
- **WHEN** the frontmatter is loaded with a standard YAML parser
- **THEN** the load fails with "mapping values are not allowed here", and the value is quoted so
  that it parses as a single string

### Requirement: A forked vendor skill must declare the fork

A tracked `SKILL.md` that carries upstream provenance metadata — such as `license`, an author
under `metadata`, or a `generatedBy` version — while its body has been modified in this
repository MUST replace that metadata with an explicit statement that the file is a fork, naming
the upstream source and the change that forked it.

Provenance metadata claiming an unmodified upstream origin invites a re-sync that would silently
discard the local changes.

#### Scenario: an openspec skill carries upstream metadata but a modified body

- **GIVEN** `.claude/skills/openspec-explore/SKILL.md` declares `metadata.author: openspec` and
  `generatedBy: "1.3.1"`
- **AND** its body was modified in this repository after installation
- **WHEN** the skill frontmatter is audited
- **THEN** the upstream metadata is replaced with a fork declaration naming the upstream project
  and the change that installed it

<!-- merged from change delta agent-skills.md (b5f1fcbe83a9) -->

### Requirement: Root instruction files must not contradict the repository state

The three root instruction files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) MUST NOT name systems,
tasks or deployment paths that do not exist in the repository. Specifically, they MUST NOT name
`Keycloak` as an active system — the identity provider is Pocket ID — and they MUST NOT describe
production deployment as push-only, because FluxCD is the primary pull-based path since T002083.

#### Scenario: an instruction file names Keycloak as the identity provider

- **GIVEN** `GEMINI.md` lists "Keycloak: Identity Provider (SSO/OIDC)" under Core Services
- **WHEN** the instruction-file gate in `tests/spec/agent-skills.bats` runs
- **THEN** the test fails and names the offending file

#### Scenario: all three instruction files are free of the forbidden claims

- **GIVEN** `CLAUDE.md`, `AGENTS.md` and `GEMINI.md` name Pocket ID and describe Flux as the
  primary deployment path
- **WHEN** the instruction-file gate runs
- **THEN** the test passes

### Requirement: GEMINI.md is a pointer, not a mirror

`GEMINI.md` MUST remain a standalone file, because the `agy` harness loads a root `GEMINI.md` by
convention, but it MUST NOT duplicate architecture, service inventory or task inventory from
`CLAUDE.md`. It MUST stay within a line budget and MUST NOT contain hardcoded `task <group>:<name>`
invocations other than the MCP config generator, because `CLAUDE.md` forbids hardcoding task
commands in favour of `bash scripts/vda.sh oracle`.

#### Scenario: GEMINI.md regrows into a service and task listing

- **GIVEN** a session re-adds a "Core Services" list and a "Key Task Commands" section to
  `GEMINI.md`
- **WHEN** the instruction-file gate runs
- **THEN** the test fails on both the line budget and the forbidden-inventory checks

#### Scenario: GEMINI.md stays a pointer

- **GIVEN** `GEMINI.md` contains only the deferral to `CLAUDE.md`/`AGENTS.md` plus the
  agy-specific MCP config note
- **WHEN** the instruction-file gate runs
- **THEN** the test passes

### Requirement: Agent and runtime names in instruction files match the agent registry

The Claude Code domain agents listed in the routing tables of `CLAUDE.md` and `AGENTS.md` MUST
match the `roles:` keys of `docs/agent-guide/registry/agents.yaml`, and the opencode agents listed
in `AGENTS.md` MUST match the `runtimes:` keys of the same registry. The registry is the SSOT
established by T002304; the instruction files mirror it and MUST be provably consistent with it.

#### Scenario: an agent is added to the registry but not to the routing tables

- **GIVEN** `agents.yaml` gains a seventh entry under `roles:`
- **WHEN** the instruction-file gate runs
- **THEN** the test fails because `CLAUDE.md` and `AGENTS.md` still list only six agents

#### Scenario: an opencode runtime is missing from the AGENTS.md table

- **GIVEN** `agents.yaml` lists `orchestrator` under `runtimes:` and `AGENTS.md` omits it
- **WHEN** the instruction-file gate runs
- **THEN** the test fails and names the missing runtime

<!-- merged from change delta agent-skills.md (e5d043a2cc92) -->

### Requirement: dev-flow-execute trennt Implementer- und Orchestrator-Zuständigkeit

Die Skill-Datei `.claude/skills/dev-flow-execute/SKILL.md` SHALL die Zuständigkeit für die
CI-Überwachung beim Orchestrator verankern und nicht beim Implementer-Subagenten. Der
Implementer-Auftrag SHALL nach `gh pr merge --auto` enden und an den Orchestrator
zurückmelden; Schritt 5.5 (`devflow-ci-watch.sh`) SHALL als Orchestrator-Schritt
ausgewiesen sein. Bei Exit-Code `3` oder `4` SHALL der Orchestrator den Konflikt per
`SendMessage` an den **bereits gespawnten** Implementer zurückgeben und keinen zweiten
Subagenten für denselben Branch spawnen.

Hintergrund: Ein reines Prompt-Verbot ("keine Hintergrund-Monitore", T001969) blieb über
mehrere Durchläufe wirkungslos. Die Härtung entfernt die Gelegenheit, statt die Direktive
zu verschärfen.

#### Scenario: Der Implementer endet vor der CI-Überwachung

- **GIVEN** ein Implementer-Subagent hat implementiert, verifiziert, gepusht und
  `gh pr merge --auto` abgesetzt
- **WHEN** er den nächsten Schritt aus `SKILL.md` bestimmt
- **THEN** weist ihn der Implementer-Auftrag an, zu enden und zurückzumelden
- **AND** die CI-Überwachung ist ausdrücklich als Orchestrator-Zuständigkeit markiert

#### Scenario: Ein Rebase-Konflikt geht an denselben Implementer zurück

- **GIVEN** `devflow-ci-watch.sh` beendet sich mit Exit-Code `3` oder `4`
- **WHEN** der Orchestrator den Konflikt auflösen lässt
- **THEN** gibt er ihn per `SendMessage` an den bereits gespawnten Implementer zurück
- **AND** es wird kein zweiter Subagent für denselben Branch gespawnt (Doppel-Push-Risiko
  aus T001408)

### Requirement: Der Implementer entfernt den Worktree nicht

Der Implementer-Auftrag in `.claude/skills/dev-flow-execute/SKILL.md` SHALL explizit
festhalten, dass der Worktree **nicht** vom Implementer entfernt wird. Das Entfernen von
Worktree und Branch SHALL ausschließlich in Schritt 7.5 als Orchestrator-Aufgabe stehen.

Hintergrund: Der Cleanup war zwar als Orchestrator-Schritt dokumentiert, im
Implementer-Auftrag aber gar nicht erwähnt — Implementer entfernten den Worktree trotzdem
und rissen damit die anschließende OpenSpec-Archivierung weg.

#### Scenario: Ein Implementer prüft, ob er aufräumen soll

- **GIVEN** ein Implementer hat seinen PR erstellt und Auto-Merge aktiviert
- **WHEN** er seinen Auftrag auf Cleanup-Anweisungen liest
- **THEN** findet er die ausdrückliche Aussage, dass der Worktree nicht von ihm entfernt wird
- **AND** die Zuordnung zu Schritt 7.5 (Orchestrator) ist benannt

### Requirement: preflight-pr-scope.sh wird mit PR-Titel-Argument dokumentiert

Jede Aufrufstelle von `scripts/preflight-pr-scope.sh` in Skill- und Referenzdateien SHALL
den PR-Titel als erstes Argument zeigen. Das Skript verlangt ihn zwingend als `$1` und
bricht sonst mit einer Usage-Meldung ab.

Hintergrund: Ein argumentloser Beispielaufruf lässt einen Agenten den Fehlschlag als "Gate
nicht anwendbar" lesen und ohne Scope-Prüfung fortfahren.

#### Scenario: Ein Agent kopiert den dokumentierten Aufruf

- **GIVEN** eine Skill- oder Referenzdatei nennt `scripts/preflight-pr-scope.sh`
- **WHEN** ein Agent den dort gezeigten Aufruf übernimmt
- **THEN** enthält dieser den PR-Titel als erstes Argument
- **AND** das Gate läuft, statt mit einer Usage-Meldung abzubrechen

<!-- merged from change delta agent-skills.md (33ce99d3ba83) -->

### Requirement: Consolidation of Micro-Specs into Parent SSOT Specs

The system SHALL consolidate isolated micro-spec deltas into their corresponding parent SSOT specification files under `openspec/specs/`.

#### Scenario: Validation after consolidation passes cleanly

- **GIVEN** 10 micro-specs merged into parent SSOT specs
- **WHEN** running `task openspec:validate`
- **THEN** all parent specs pass validation and no orphaned micro-specs remain

<!-- merged from change delta agent-skills.md (74edc672d6fc) -->

### Requirement: agent-lock claim supports force flag for dead processes
The agent-lock script SHALL allow the `claim` command to specify a `--force` flag. When `--force` is provided, the script SHALL check if the process holding the lock (specified by `owner_pid` in the lock file) is still active. If the process is dead (i.e. not running), the script SHALL reclaim/take over the lock, overwrite the lock file, and log the reclamation to the `.reap.log` file. If the process is alive, it SHALL reject the claim and exit with a non-zero code.

#### Scenario: Force claim when lock owner process is dead
- **GIVEN** a ticket lock exists with owner_pid 999999
- **AND** process 999999 is not running
- **WHEN** running `agent-lock.sh claim ticket <id> --force --branch <branch> --worktree <worktree>`
- **THEN** the lock is successfully claimed by the current session
- **AND** a log entry is written to `.reap.log`

#### Scenario: Force claim when lock owner process is alive
- **GIVEN** a ticket lock exists with owner_pid 111111
- **AND** process 111111 is currently running
- **WHEN** running `agent-lock.sh claim ticket <id> --force --branch <branch> --worktree <worktree>`
- **THEN** the command fails with a non-zero exit code
- **AND** the lock file is not modified

### Requirement: repo-hygiene Post-Merge-Guard fails closed on empty mergedAt
The post-merge validation script in repo-hygiene SHALL verify that any timestamp or commit metadata retrieved from external APIs (like GitHub CLI) is non-empty. If the API returns an empty string or error, the script SHALL abort with a failure (fail-closed) instead of silently treating it as success.

#### Scenario: GitHub API is down during Post-Merge-Guard check
- **GIVEN** the GitHub API is offline or returns an error
- **AND** `gh pr view` returns an empty string or error for mergedAt
- **WHEN** running the post-merge guard validation for a branch
- **THEN** the script aborts with an exit code 1
- **AND** does not proceed to delete or prune the worktree

<!-- merged from change delta agent-skills.md (be71e556795d) -->

### Requirement: Plugin activation is checked against installation

The repository SHALL provide `scripts/plugin-doctor.sh`, which compares the checked-in
activation map in `.claude/settings.json` (`enabledPlugins`) against the machine-local
state in `~/.claude/plugins/installed_plugins.json` and `~/.claude/settings.json`, and
reports two conditions as errors:

1. a plugin activated by the repository that is not installed on the machine, and
2. a plugin activated by the repository that the user scope sets to `false` or omits.

Both conditions mean an agent silently lacks a capability the repository assumes it has.
The inverse — a plugin installed or activated locally beyond what the repository declares
— SHALL NOT be reported, because it costs no capability and would otherwise warn on every
locally trialled plugin.

The script SHALL exit non-zero when it reports a finding, exit zero with an explanatory
note when `~/.claude` is absent entirely (a foreign machine or CI runner, where the check
has nothing to say), accept path overrides via environment variables so it can be
exercised against fixtures, and offer a `--json` output mode. It SHALL be reachable
through a Taskfile target.

#### Scenario: A plugin is activated but not installed

- **GIVEN** an `enabledPlugins` entry set to `true` whose plugin is absent from
  `installed_plugins.json`
- **WHEN** `scripts/plugin-doctor.sh` runs against those paths
- **THEN** it exits non-zero and names the plugin

#### Scenario: A plugin is activated by the repo but disabled in the user scope

- **GIVEN** an `enabledPlugins` entry set to `true` in the checked-in settings and set to
  `false` in the user-scope settings
- **WHEN** `scripts/plugin-doctor.sh` runs against those paths
- **THEN** it exits non-zero and names the plugin as a capability loss

#### Scenario: Extra local plugins are not reported

- **GIVEN** a plugin installed and enabled in the user scope that the checked-in settings
  do not list
- **WHEN** `scripts/plugin-doctor.sh` runs against those paths
- **THEN** it exits zero and reports no finding

#### Scenario: A machine without a Claude home is not a failure

- **GIVEN** an environment where the resolved Claude home directory does not exist
- **WHEN** `scripts/plugin-doctor.sh` runs
- **THEN** it exits zero and states that the machine-local check was not applicable

### Requirement: Activation drift is surfaced at session start without blocking

A `SessionStart` hook in `.claude/settings.json` SHALL invoke the plugin doctor and, when
it reports a finding, emit the finding as `hookSpecificOutput.additionalContext`, matching
the shape already used by the codebase-memory freshness hook. The hook SHALL never abort
session startup: it appends `|| true`, so a machine with an incomplete plugin installation
stays usable and merely learns what is missing.

#### Scenario: Drift is visible in the session context

- **GIVEN** an activation state in which the doctor reports a finding
- **WHEN** the SessionStart hook runs
- **THEN** it emits valid JSON carrying the finding as `additionalContext` and exits zero

### Requirement: The activation map is validated in CI

A BATS test under `tests/spec/` SHALL assert what is checkable without a machine-local
Claude home, fail-closed: every `enabledPlugins` key matches `<plugin>@<marketplace>`,
no key appears twice, and every marketplace segment is one of the known marketplaces.

The same test SHALL additionally execute `scripts/plugin-doctor.sh` against synthetic
fixtures via its path overrides and assert its exit status and output for each reported
condition. Asserting the script's behaviour rather than grepping its source is required
by the repository's output-verification convention; the fixtures are what let CI do so
without a real `~/.claude`.

A single test that skips when `~/.claude` is absent SHALL NOT be used. It would pass
silently in CI, which is the fail-open shape the repository already documents as a
pitfall.

#### Scenario: A malformed activation key fails the test

- **GIVEN** an `enabledPlugins` key that does not match `<plugin>@<marketplace>`
- **WHEN** the CI test runs
- **THEN** it fails and names the malformed key

#### Scenario: The doctor is exercised against fixtures in CI

- **GIVEN** fixture files representing an activated-but-not-installed plugin
- **WHEN** the CI test runs the doctor against them via its path overrides
- **THEN** the doctor exits non-zero and its output names the plugin

<!-- merged from change delta agent-skills.md (ae7b8b4a627a) -->

### Requirement: Repo-relative path references in first-party skills must resolve

A test SHALL check every repo-relative path reference in first-party skill files against the file
system and SHALL fail when a reference does not resolve. References with a file extension under
`openspec/`, `scripts/`, `tests/`, `docs/`, `website/`, `k3d/`, `environments/` and `flux/` SHALL
be checked.

Vendored third-party skills SHALL be excluded. This concerns `gitops-*` and `vitest`: their
references, such as `docs/spec/v1/kustomizations.md`, point at upstream fluxcd.io documentation or
at example paths in foreign projects, not at this repository. Without that exclusion the guard
produces 23 false positives against 3 genuine findings and is worthless.

The exclusion list SHALL be stated and justified inside the test itself rather than in a separate
file, because it is part of what the test asserts.

#### Scenario: A first-party skill references a non-existent file

- **GIVEN** a skill file outside the exclusion list contains `openspec/specs/gibtsnicht.md`
- **WHEN** the guard runs
- **THEN** it fails and names both the skill file and the dead path

#### Scenario: Positive anchor — resolvable references pass

- **GIVEN** the skill files as shipped after this change
- **WHEN** the guard runs
- **THEN** it passes and the number of references checked is greater than zero

#### Scenario: A vendored third-party skill is not judged

- **GIVEN** `.claude/skills/gitops-repo-audit/references/flux-api-summary.md` references
  `docs/spec/v1/kustomizations.md`, which does not exist in this repository
- **WHEN** the guard runs
- **THEN** it does not report that reference

### Requirement: The vision path of the headed run is documented with a probe

Step 8.5 of the `dev-flow-e2e` skill SHALL describe how the vision server required for visual
verification is reached, and SHALL name a probe command that establishes its availability before
the run.

The skill SHALL keep port `8094` as the preferred dedicated endpoint and SHALL name port `8091` as
the fallback. This requirement covers operation only; it does not change REQ-k8-04.

Rationale: measured on 2026-08-03, port `8094` (the dedicated Bonsai/PrismML mmproj server) does
not respond, while port `8091` runs the `gemma26-factory` loadout, which carries `mmprojPath`. The
skill names only `8094` and no probe, so an agent following step 8.5 runs into a silent connection
failure.

#### Scenario: The agent probes availability before the vision step

- **GIVEN** step 8.5 is executed and `8094` does not respond
- **WHEN** the agent follows the skill
- **THEN** the skill provides the fallback to `8091` together with a probe command

<!-- merged from change delta agent-skills.md (0657507590dc) -->