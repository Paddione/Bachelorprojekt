# dsh-harness-integration

## Purpose

Beschreibt, wie der DeepSeek Harness (`dsh`) als dritter Harness neben Claude Code und opencode
in unseren SDLC eingehängt ist: ein Repo-eigenes Bundle unter `tools/dsh/`, das unsere
bestehende Claude-Hook-Konfiguration über die CC-Bridge fährt und daneben native Plugins auf
`tools/pre-execute` und den Sitzungs-Ereignisstrom hängt, ein Factory-Executor hinter
`FACTORY_EXECUTOR=dsh`, und ein dokumentierter Weg, die Web-Oberfläche zu starten.

Der Harness-Klon selbst bleibt ein gitignorierter externer Baum (T012960) — versioniert ist nur,
was wir beitragen. Der Vertrag darüber, welche Harnesses es gibt und wie Werkzeuge ihnen
zugeordnet werden, steht in [`harness-workflow-split`](harness-workflow-split.md).

## Requirements

### Requirement: the repo ships a dsh bundle that mounts its own plugins

The repository SHALL provide a DeepSeek Harness bundle at `tools/dsh/` whose `package.json`
declares `dsh.bundle.patch` pointing at `tools/dsh/cordis.patch.yml`. The bundle entry
`tools/dsh/index.js` SHALL mount every plugin module present under `tools/dsh/plugins/` and SHALL
skip a module that is absent, so that the bundle boots at any intermediate state of the plugin
set.

Upstream harness code SHALL NOT be vendored into this repository; `deepseek-harness/` remains an
ignored external checkout.

#### Scenario: the bundle boots with no plugin modules present

- **GIVEN** `tools/dsh/plugins/` contains no module
- **WHEN** the bundle entry is loaded
- **THEN** it mounts nothing and raises no error

#### Scenario: the bundle manifest declares a patch

- **GIVEN** `tools/dsh/package.json`
- **WHEN** its `dsh` key is read
- **THEN** `dsh.bundle.patch` resolves to an existing `cordis.patch.yml` in the same directory

#### Scenario: no upstream code is vendored

- **GIVEN** the tracked file list of the repository
- **WHEN** it is searched for paths under `deepseek-harness/`
- **THEN** no such path is tracked, and `.gitignore` still ignores the directory

### Requirement: the existing Claude hook config runs under dsh

The bundle SHALL configure `@deepseek-ai/dsh-hooks-claude-code` with `configPath` pointing at the
repository's `.claude/settings.json`, so that the `PreToolUse` hooks already declared there run on
`tools/pre-execute` without being reimplemented.

Because the bridge maps only `type: 'command'` hooks, a guard SHALL assert that every
`PreToolUse` hook in `.claude/settings.json` is of that type — a hook of any other type would be
skipped with a warning and would silently not protect a dsh session.

#### Scenario: every PreToolUse hook is bridgeable

- **GIVEN** `.claude/settings.json`
- **WHEN** its `hooks.PreToolUse` entries are inspected
- **THEN** every nested hook declares `type: "command"`

#### Scenario: the bundle points the bridge at the repo settings

- **GIVEN** `tools/dsh/cordis.patch.yml`
- **WHEN** it is read
- **THEN** it configures `dsh-hooks-claude-code` with a `configPath` naming `.claude/settings.json`

### Requirement: a native guard plugin enforces the worktree write rule

`tools/dsh/plugins/repo-guard.mjs` SHALL register on `tools/pre-execute` and SHALL deny a
file-writing tool call whose target path lies outside the session workspace, returning a typed
deny decision carrying a human-readable reason. It SHALL delegate via `next()` for every call it
does not deny.

The plugin SHALL enforce the same rule as `scripts/hooks/worktree-write-guard.sh`, so that the
bridge path and the native path can be compared against one another.

#### Scenario: a write outside the workspace is denied with a reason

- **GIVEN** a dsh session whose workspace is a worktree
- **WHEN** a write tool call targets a path outside that workspace
- **THEN** the plugin returns a deny decision whose reason names the offending path

#### Scenario: a write inside the workspace is delegated

- **GIVEN** the same session
- **WHEN** a write tool call targets a path inside the workspace
- **THEN** the plugin calls `next()` and returns no decision of its own

### Requirement: dsh is a selectable factory executor

`scripts/factory/dispatcher-bridge.sh` SHALL accept `FACTORY_EXECUTOR=dsh` and dispatch to
`scripts/factory/dsh-exec.sh`, keeping the existing `[pipeline:<ext_id>]` output prefix and the
backgrounding that the outer `wait` joins. An unknown executor value SHALL still fall back to
`claude` with a warning.

`scripts/factory/dsh-exec.sh` SHALL record `implement` phase events through `scripts/ticket.sh
phase` with `executor: "dsh"` in the structured detail, and SHALL use a distinct exit code per
failure cause: `2` for a missing or unbuilt harness checkout, `6` for a run that left neither
commit nor change, `7` for a run rejected for a missing branch or plan, `8` for a ticket that
already has a running dsh process. It SHALL NOT fall back to another executor on failure.

#### Scenario: the dispatcher accepts dsh

- **GIVEN** `FACTORY_EXECUTOR=dsh`
- **WHEN** the executor branch of `dispatcher-bridge.sh` is evaluated
- **THEN** it selects `dsh-exec.sh` and emits no unknown-executor warning

#### Scenario: an unknown executor still falls back to claude

- **GIVEN** `FACTORY_EXECUTOR=nonsense`
- **WHEN** the same branch is evaluated
- **THEN** it warns and selects the claude path, unchanged by the addition of dsh

#### Scenario: an unbuilt harness checkout is distinguishable from a missing one

- **GIVEN** a harness checkout present but never built
- **WHEN** `dsh-exec.sh` runs
- **THEN** it exits `2` with a message naming the missing build, not `127`

#### Scenario: a run without a branch is rejected before it starts

- **GIVEN** an invocation with an empty branch argument
- **WHEN** `dsh-exec.sh` runs
- **THEN** it exits `7` and starts no harness process

### Requirement: dsh sessions are visible in the existing phase-event timeline

The audit plugin `tools/dsh/plugins/audit-log.mjs` SHALL subscribe to the harness session event
stream and SHALL record turn boundaries as phase events through the same
`scripts/ticket.sh phase` channel the other executors use, tagged `executor: "dsh"`. It SHALL NOT
create a parallel audit table.

#### Scenario: a turn boundary reaches the phase-event channel

- **GIVEN** a dsh session running under the bundle with a ticket id in its environment
- **WHEN** a turn ends
- **THEN** a phase event is recorded whose detail JSON carries `executor` set to `dsh`

#### Scenario: no ticket id means no phase event

- **GIVEN** a dsh session with no ticket id in its environment
- **WHEN** a turn ends
- **THEN** the plugin records nothing and raises no error, so an ad-hoc session cannot write
  stray rows

### Requirement: the web UI is startable through a documented task

A task SHALL start the dsh web UI against the repo bundle and register it in the active-sessions
registry, so the running harness appears alongside the other dev sessions instead of being an
undocumented process on a port.

#### Scenario: the task starts the UI and registers the session

- **GIVEN** a built harness checkout
- **WHEN** the documented start task runs
- **THEN** the web UI answers on its configured port and the active-sessions registry contains an
  entry for it

#### Scenario: an unbuilt checkout fails with a named cause

- **GIVEN** a harness checkout without a build
- **WHEN** the start task runs
- **THEN** it fails with a message naming the missing build rather than a port-binding error

<!-- merged from change delta dsh-harness-integration.md (5bb576ceb529) -->