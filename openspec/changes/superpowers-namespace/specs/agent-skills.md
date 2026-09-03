## ADDED Requirements

### Requirement: Superpowers is declared in every harness that runs the dev-flow skills

The `dev-flow-*` skills call skills provided by the superpowers plugin. Every harness that loads
those skills SHALL declare the plugin through the installation mechanism of that harness, because
no harness inherits the plugin set of another harness.

Claude Code SHALL keep an activated `superpowers` entry in the `enabledPlugins` map of
`.claude/settings.json`. opencode SHALL declare the plugin in the `plugin` array of
`.opencode/opencode.jsonc`, following the upstream `.opencode/INSTALL.md`. Both files are tracked,
so the declaration reaches every clone rather than a single machine.

Declaration and installation are distinct states. This requirement governs the tracked
declaration; the machine-local installation is covered by the plugin-doctor requirement.

#### Scenario: A harness loads a dev-flow skill without declaring the plugin

- **GIVEN** a harness whose tracked configuration does not declare superpowers
- **WHEN** it loads `dev-flow-plan` or `dev-flow-execute`
- **THEN** the configuration is incomplete, because those skills call plugin-provided skills that
  cannot resolve

### Requirement: A plugin activation finding names an executable remedy

`scripts/plugin-doctor.sh` reports a plugin that the repository activates but the machine lacks.
The repository SHALL provide an `agents:plugins:sync` Taskfile target that installs the missing plugins
from the checked-in `enabledPlugins` map, and every finding the doctor reports SHALL name that
target.

A finding without a remedy is dismissed rather than acted on. The doctor reported this exact
outage correctly at every session start for months while `claude plugin install` — the command
that would have fixed it — appeared nowhere in the repository.

#### Scenario: The doctor reports a missing plugin

- **GIVEN** a plugin activated by the repository and absent from the machine
- **WHEN** `scripts/plugin-doctor.sh` runs
- **THEN** its output names `agents:plugins:sync` as the way to install it

#### Scenario: The sync target installs from the tracked activation map

- **GIVEN** an `enabledPlugins` entry set to `true` whose plugin is not installed
- **WHEN** the `agents:plugins:sync` target runs
- **THEN** it installs that plugin for the marketplace the key names

### Requirement: Plugin-provided discipline skills do not compete with the dev-flow orchestrators

`superpowers:writing-plans` and `superpowers:executing-plans` are invoked as sub-steps by
`dev-flow-plan` and `dev-flow-execute`. They SHALL NOT answer a repository work request on their
own, because a request answered by the discipline skill alone skips the ticket, worktree,
plan-lint and staging gates the orchestrator owns.

In opencode this SHALL be enforced through the `skill` permission map. Claude Code offers no
permission map, so there the `dev-flow-*` descriptions SHALL state the repository entry point
explicitly enough to win the match.

#### Scenario: A work request reaches the discipline skill directly in opencode

- **GIVEN** opencode with superpowers installed
- **WHEN** a repository work request matches `superpowers:writing-plans`
- **THEN** the permission map denies it and the request routes to `dev-flow-plan`

### Requirement: opencode reaches the shared dev-flow reference material

`dev-flow-plan` and `dev-flow-execute` are shared sources loaded by both harnesses, and their
normative content — phases, quality gates, intel bundle — lives in `.claude/skills/references/`.
opencode SHALL NOT deny the `references` skill, because denying it removes the entry point
through which an agent learns that material exists.

#### Scenario: opencode runs the shared plan skill

- **GIVEN** opencode loading `dev-flow-plan` through its directory symlink
- **WHEN** the skill points at its phases reference
- **THEN** the `references` skill is reachable

### Requirement: A skill names the provider of a skill it calls

Where a `SKILL.md` instructs an agent to call a skill it does not itself contain, it SHALL name
where that skill comes from. A plugin-provided skill SHALL NOT be described as a harness built-in.

`superpowers:*` was documented as "Claude Code — built-in" throughout the dev-flow skills. That
description is why the outage stayed invisible: a built-in cannot be missing, so nobody checked
whether it was installed. Naming the plugin makes absence a checkable condition.

#### Scenario: A skill body calls a plugin-provided skill

- **GIVEN** a `SKILL.md` instructing the agent to call `superpowers:executing-plans`
- **WHEN** the body describes where that skill comes from
- **THEN** it names the superpowers plugin, not a harness built-in

## MODIFIED Requirements

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

Every reported finding SHALL name the `agents:plugins:sync` target as its remedy, so the report ends in
an executable step rather than an observation.

The script SHALL exit non-zero when it reports a finding, exit zero with an explanatory
note when `~/.claude` is absent entirely (a foreign machine or CI runner, where the check
has nothing to say), accept path overrides via environment variables so it can be
exercised against fixtures, and offer a `--json` output mode. It SHALL be reachable
through a Taskfile target.

#### Scenario: A plugin is activated but not installed

- **GIVEN** an `enabledPlugins` entry set to `true` whose plugin is absent from
  `installed_plugins.json`
- **WHEN** `scripts/plugin-doctor.sh` runs against those paths
- **THEN** it exits non-zero, names the plugin, and names `agents:plugins:sync` as the remedy

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
