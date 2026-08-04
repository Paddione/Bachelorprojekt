## ADDED Requirements

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
