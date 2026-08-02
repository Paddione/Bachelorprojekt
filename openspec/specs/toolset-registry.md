# toolset-registry

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu toolset-registry ergänzen._

## Requirements

### Requirement: Capability registry is the single source of truth for tool curation

`docs/agent-guide/registry/capabilities.yaml` SHALL map each capability to the
set of instances that can provide it. Every instance SHALL carry a kind prefix
(`mcp:`, `plugin:`, `skill:`, `agent:`, `cli:`), a `state`
(`canonical` | `allowed` | `suppressed` | `unreviewed`), and — for any state
other than `canonical` — a `reason` string.

The registry SHALL NOT duplicate `docs/agent-guide/registry/mcp.yaml`.
`mcp.yaml` remains authoritative for *how a server is reachable* (transport,
endpoint, credentials); `capabilities.yaml` is authoritative for *which
instance a harness is permitted to use*.

#### Scenario: Instance without a reason on a non-canonical state

- **GIVEN** an instance with `state: suppressed` and no `reason` field
- **WHEN** `node scripts/toolset/check.mjs` runs
- **THEN** it exits non-zero and names the capability and instance id

#### Scenario: Registry and mcp.yaml stay disjoint

- **GIVEN** `capabilities.yaml` declares `mcp:ticket-mcp` as canonical
- **WHEN** `node scripts/toolset/sync.mjs` runs
- **THEN** it writes only permission keys and leaves every connection field
  (endpoint, command, args, headers) exactly as `scripts/mcp-sync.sh` rendered it

### Requirement: Exactly one canonical instance per capability

Each capability SHALL resolve to exactly one `canonical` instance. A capability
with two or more instances and no `canonical` marking is an unresolved
ambiguity and SHALL fail. A capability whose instances are all `suppressed`
SHALL fail, because the capability would no longer be obtainable. A capability
with exactly one instance SHALL be treated as implicitly canonical and SHALL
NOT require the marking.

#### Scenario: Two canonical instances

- **GIVEN** a capability listing both `cli:gh-axi` and `mcp:github-mcp` as `canonical`
- **WHEN** `check.mjs` runs
- **THEN** it exits non-zero and reports the capability as having 2 canonical instances

#### Scenario: Ambiguity with no decision recorded

- **GIVEN** a capability with three instances, all `state: allowed`
- **WHEN** `check.mjs` runs
- **THEN** it exits non-zero and reports that no canonical instance is declared

#### Scenario: Single-instance capability needs no marking

- **GIVEN** a capability with exactly one instance and no `canonical` marking
- **WHEN** `check.mjs` runs
- **THEN** it exits zero and reports no finding for that capability

### Requirement: Enforceability is modelled explicitly, not assumed

Each instance kind SHALL declare how far `sync.mjs` can enforce a `suppressed`
state. The enforceability classes are `full`, `partial`, `seed-only` and `none`:

| Kind | Class | Mechanism |
|---|---|---|
| `mcp:` | `full` | `disabledMcpjsonServers` (Claude), `enabled: false` (opencode), omission (agy) |
| `plugin:` | `partial` | `enabledPlugins: false` (Claude); `.opencode/plugins/` has no switch |
| `skill:` | `partial` | `permission.skill.<name>: deny` (opencode only); Claude Code has no skill switch |
| `agent:` | `full` | `agent-models.jsonc`, factory loadout |
| `cli:` | `none` | not disableable; registry records the canonical path only |
| llama.cpp WebUI list | `seed-only` | seeded via `ui-config.template.json`; the live list lives in browser localStorage |

A `suppressed` instance whose kind is enforceable but which is still active in
a harness config SHALL fail. A `suppressed` instance whose kind is NOT
enforceable SHALL produce a warning and SHALL be listed in the generated map as
a residual ambiguity, and SHALL NOT fail.

#### Scenario: Suppressed and enforceable but still active

- **GIVEN** `plugin:github@claude-plugins-official` is `suppressed`
- **AND** `settings.json` has `enabledPlugins["github@claude-plugins-official"] = true`
- **WHEN** `check.mjs` runs
- **THEN** it exits non-zero and names the plugin and the file

#### Scenario: Suppressed but not enforceable

- **GIVEN** a `cli:` instance is marked `suppressed`
- **WHEN** `check.mjs` runs
- **THEN** it exits zero, emits a warning, and the instance appears in
  `docs/agent-guide/maps/toolset-map.md` under residual ambiguities

### Requirement: All four harnesses receive the same curated toolset

`sync.mjs` SHALL render the curated set into five targets from one registry:
`.claude/settings.json`, `.opencode/opencode.jsonc`,
`~/.gemini/config/mcp_config.json`, `scripts/llm/mcp-servers.json` and
`scripts/llm/ui-config.template.json`.

The llama.cpp harness has two distinct attachment paths and SHALL be treated as
two targets: stdio child processes started with the model
(`scripts/llm/mcp-servers.json`) and the browser WebUI list
(`scripts/llm/ui-config.template.json`). Because a browser cannot speak stdio,
each instance SHALL declare a per-harness `transport`; stdio-only servers reach
the WebUI through the existing llm-proxy bridge at `127.0.0.1:18235/mcp/<name>`.

#### Scenario: A capability reaches every harness

- **GIVEN** `mcp:ticket-mcp` is `canonical`
- **WHEN** `sync.mjs` runs
- **THEN** all five targets contain `ticket-mcp`, the two stdio-capable
  harnesses reference `ticket-mcp-go` directly, and the WebUI target
  references `http://127.0.0.1:18235/mcp/ticket-mcp`

#### Scenario: A suppressed capability reaches no harness

- **GIVEN** `mcp:task-master-ai` is `suppressed`
- **WHEN** `sync.mjs` runs
- **THEN** none of the five targets offer it, including agy — where suppression
  is expressed by omitting the entry, since agy has no disable flag

### Requirement: Writes are surgical and never touch unmanaged keys

`sync.mjs` SHALL modify only the keys it manages — `enabledPlugins`,
`disabledMcpjsonServers`, `permissions.deny` (Claude Code) and
`permission.skill` (opencode) — and SHALL preserve every other key byte-for-byte,
including personal settings such as `theme`, `voice`, `effortLevel` and `hooks`.
Writes SHALL be atomic (temporary file plus rename). For the out-of-repo agy
target, `sync.mjs` SHALL additionally write a `.bak` copy.

#### Scenario: Personal keys survive a sync

- **GIVEN** `.claude/settings.json` contains `"theme": "dark"` and a `hooks` block
- **WHEN** `sync.mjs` changes an entry in `enabledPlugins`
- **THEN** `enabledPlugins` differs from before, and `theme` and `hooks` are unchanged

### Requirement: The CI gate runs offline and never writes

`node scripts/toolset/check.mjs` SHALL complete without contacting any MCP
server, cluster or network endpoint, so it is runnable in CI where none of
those are reachable. It SHALL NOT write to any target file. To detect hand
edits that violate no named rule, it SHALL render what `sync.mjs` would write
into memory and compare against the file on disk, reporting any difference as a
failure.

#### Scenario: Hand-edited config is caught

- **GIVEN** a target config was edited by hand so it no longer matches the registry
- **WHEN** `check.mjs` runs
- **THEN** it exits non-zero and prints a diff naming the file and the key

#### Scenario: Gate runs with no services up

- **GIVEN** no MCP server is listening on any configured port
- **WHEN** `check.mjs` runs against a registry with no drift
- **THEN** it exits zero

#### Scenario: The gate cannot confirm itself

- **GIVEN** a target config that drifts from the registry
- **WHEN** `check.mjs` runs
- **THEN** the target file on disk is byte-identical afterwards, and the
  exit code is non-zero

### Requirement: Unknown sources are quarantined, not silently accepted or removed

An instance discovered by `collect.mjs` that is absent from `capabilities.yaml`
SHALL be reported as `unreviewed` with a warning, and `check.mjs` SHALL still
exit zero. `sync.mjs` SHALL NOT disable it. The warning SHALL name the
`toolset-curate` skill as the way to resolve it.

#### Scenario: A newly installed plugin does not break CI

- **GIVEN** a plugin is enabled in `settings.json` that `capabilities.yaml` does not list
- **WHEN** `check.mjs` runs
- **THEN** it exits zero, prints the plugin under `unreviewed`, and names `toolset-curate`

#### Scenario: An unreviewed source is left alone

- **GIVEN** the same unreviewed plugin
- **WHEN** `sync.mjs` runs
- **THEN** the plugin is still enabled in `settings.json`

### Requirement: The agy target is verified through a committed expected snapshot

Because `~/.gemini/config/mcp_config.json` lives outside the repository, CI
cannot read it. `sync.mjs` SHALL therefore also write
`docs/agent-guide/registry/expected/agy-mcp-config.json`, which is committed.
`check.mjs` SHALL always verify the renderer against that snapshot — this
requires no agy installation — and SHALL compare against the real file only
where it exists. Where it does not, `check.mjs` SHALL emit an explicit `SKIP`
line naming the absent target. A missing agy installation SHALL NOT silently
produce an unqualified success.

#### Scenario: Renderer verified without agy installed

- **GIVEN** `~/.gemini/` does not exist
- **AND** `capabilities.yaml` was changed without regenerating the expected snapshot
- **WHEN** `check.mjs` runs
- **THEN** it exits non-zero, because the renderer output no longer matches
  `expected/agy-mcp-config.json`

#### Scenario: Absent target is reported, not hidden

- **GIVEN** `~/.gemini/` does not exist and the expected snapshot is current
- **WHEN** `check.mjs` runs
- **THEN** it exits zero and its output contains a `SKIP` line naming the agy target

### Requirement: The live probe informs curation and is excluded from the gate

`node scripts/toolset/probe.mjs` SHALL query `tools/list` against each
reachable HTTP MCP server and record the real tool counts in
`docs/agent-guide/registry/toolset.lock.yaml`. Because the result depends on
which services happen to run on one machine, `check.mjs` SHALL NOT read the
lockfile and SHALL NOT fail on it.

The lockfile SHALL be merged, not replaced: when a server is unreachable, its
existing entry SHALL be preserved and marked `stale` with a timestamp, so a
probe run during an outage cannot destroy measurements that require running
infrastructure to reproduce.

#### Scenario: Unreachable server does not erase its measurement

- **GIVEN** `toolset.lock.yaml` records 24 tools for `mcp-kubernetes`
- **AND** nothing is listening on its port
- **WHEN** `probe.mjs` runs
- **THEN** the entry still records 24 tools and is additionally marked `stale`

#### Scenario: Lockfile drift is not a CI failure

- **GIVEN** `toolset.lock.yaml` is outdated relative to the running services
- **WHEN** `check.mjs` runs
- **THEN** it exits zero

### Requirement: Generator modules accept fixture overrides

`sync.mjs` and `check.mjs` SHALL honour the environment overrides
`TOOLSET_REGISTRY` (registry path) and `TOOLSET_OUT_DIR` (target root),
mirroring `MCP_REGISTRY` / `MCP_OUT_DIR` in `scripts/mcp-sync.sh`. Without them
the modules SHALL behave exactly as they do against the real repository. This
is a requirement on the module interface, not a test detail: without it no
`sync` test can run without overwriting the developer's real configuration.

#### Scenario: Sync against a fixture leaves real configs untouched

- **GIVEN** `TOOLSET_REGISTRY` points at a fixture registry
- **AND** `TOOLSET_OUT_DIR` points at a temporary directory
- **WHEN** `sync.mjs` runs
- **THEN** the fixture targets in the temporary directory are written
- **AND** the repository's `.claude/settings.json` is unchanged

### Requirement: Interactive curation records the decision and its reason

The `toolset-curate` skill SHALL present each `unreviewed` instance together
with the capability it overlaps and, where a lockfile entry exists, its
measured tool count. It SHALL ask the operator which instance is canonical,
write the chosen `state` and a `reason` into `capabilities.yaml`, and then run
`sync.mjs`. It SHALL NOT write a state without a reason.

#### Scenario: Curation resolves a quarantined source

- **GIVEN** one `unreviewed` instance overlapping an existing capability
- **WHEN** the operator selects the existing instance as canonical
- **THEN** `capabilities.yaml` records the new instance as `suppressed` with the
  operator's reason, and a subsequent `check.mjs` run reports no `unreviewed` entries

### Requirement: Tests verify command output, not implementation source

Tests for this component SHALL execute the commands and assert on their exit
status and output, per the repository's output-verification convention
[T002448-M4]. Grepping the generator source for a flag name or message string
is not acceptable evidence of behaviour.

Every negative assertion SHALL carry a positive anchor in the same test
[T002356-M1]: before asserting that something did not happen, the test SHALL
first establish that the operation ran and had its intended effect — otherwise
the assertion passes vacuously when the feature is absent.

Assertions on `$output` SHALL be narrowed to the relevant output line. An
unqualified `[[ "$output" == *"toolset"* ]]` can be satisfied by the worktree
path appearing in a usage line, independent of the feature under test.

#### Scenario: Surgical-write test carries a positive anchor

- **GIVEN** the test asserting that `theme` survives a sync
- **WHEN** the test runs against a build where `sync.mjs` writes nothing at all
- **THEN** the test fails, because it first asserts that `enabledPlugins` changed

<!-- merged from change delta toolset-registry.md (cd83db92b53a) -->