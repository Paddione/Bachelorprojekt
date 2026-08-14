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

### Requirement: Every curated instance carries injectable usage semantics

`docs/agent-guide/registry/capabilities.yaml` SHALL record, for each instance, not only whether
it may be used but when it should be. Beyond `state` and `reason`, an instance MAY carry
`use_when`, `avoid_when`, `fallback`, `roles`, `tier` and `deep_ref`.

An instance with `state: canonical` SHALL carry a non-empty `use_when` and a non-empty `roles`
list; without them the instance cannot be rendered into an agent prompt and the registry would
claim a curation that does not exist. `roles` SHALL contain only full role names —
`bachelorprojekt-website`, `bachelorprojekt-ops`, `bachelorprojekt-infra`,
`bachelorprojekt-test`, `bachelorprojekt-db`, `bachelorprojekt-security`, `orchestrator` — or the
wildcard `all`. `tier`, when present, SHALL be one of `safe`, `caution`, `assisted`, `dangerous`,
mirroring the danger tiers in `docs/agent-guide/registry/tools.yaml`.

`deep_ref` SHALL point at prose that explains the instance in depth. `use_when` and `avoid_when`
are deliberately short — they are injected into every dispatch — and SHALL NOT attempt to restate
the guards documented in `.claude/skills/references/mcp-tool-guide.md`, which remains
hand-maintained and is NOT generated from this registry.

#### Scenario: Canonical instance without usage semantics

- **GIVEN** an instance with `state: canonical` and no `use_when` field
- **WHEN** `node scripts/toolset/check.mjs` runs
- **THEN** it exits non-zero and names the capability and the instance id

#### Scenario: Canonical instance without roles

- **GIVEN** an instance with `state: canonical` and `use_when` set but no `roles` list
- **WHEN** `check.mjs` runs
- **THEN** it exits non-zero and names the capability and the instance id

#### Scenario: Role name outside the allowlist

- **GIVEN** an instance whose `roles` list contains `db` instead of `bachelorprojekt-db`
- **WHEN** `check.mjs` runs
- **THEN** it exits non-zero and reports the unknown role name

#### Scenario: Suppressed instance needs no usage semantics

- **GIVEN** an instance with `state: suppressed` and a `reason`, but no `use_when` and no `roles`
- **WHEN** `check.mjs` runs
- **THEN** it exits zero and reports no finding for that instance

### Requirement: Collection covers every instance kind, not only MCP servers

`node scripts/toolset/collect.mjs` SHALL discover instances of every kind the registry models:
`mcp:` from the `mcpServers` blocks of the harness configs, `plugin:` from `enabledPlugins` in
`.claude/settings.json`, `skill:` from the `name` frontmatter of `.claude/skills/*/SKILL.md`,
and `cli:` and `agent:` from `docs/agent-guide/registry/tools.yaml`.

Every discovered instance absent from `capabilities.yaml` SHALL be reported as `unreviewed`, and
the report SHALL name the `toolset-curate` skill as the way to resolve it. Consistent with the
existing quarantine requirement, an `unreviewed` instance SHALL NOT fail `check.mjs` and SHALL
NOT be disabled by `sync.mjs`.

#### Scenario: An enabled plugin is discovered

- **GIVEN** `.claude/settings.json` enables `pr-review-toolkit@claude-plugins-official`
- **AND** `capabilities.yaml` does not list it
- **WHEN** `collect.mjs` runs
- **THEN** its output contains that plugin as an instance of kind `plugin:` marked `unreviewed`

#### Scenario: Discovery of a kind that is present in the registry

- **GIVEN** `capabilities.yaml` lists `cli:gh-axi` as canonical
- **WHEN** `collect.mjs` runs
- **THEN** `cli:gh-axi` appears in the output and is NOT marked `unreviewed`

#### Scenario: Quarantined plugin does not fail the gate

- **GIVEN** an enabled plugin that `capabilities.yaml` does not list
- **WHEN** `check.mjs` runs
- **THEN** it exits zero and its output names both the plugin and `toolset-curate`

### Requirement: The curated toolset is injectable into an agent prompt by role

`scripts/toolset-context.sh <role>` SHALL emit a markdown block listing every non-suppressed
instance whose `roles` list contains `<role>` or the wildcard `all`, ready to be wrapped in
`<toolset>…</toolset>` and prepended to a subagent prompt. Each entry SHALL render the capability,
the canonical instance id, and its `use_when`, `avoid_when`, `fallback` and `deep_ref` where set.
Suppressed instances SHALL NOT appear — an agent must not be shown a tool it may not use.

The script SHALL reject an unknown role with a non-zero exit status and a message naming the
accepted roles. It SHALL NOT fall back to emitting every instance. This differs deliberately from
`scripts/plan-context.sh`, whose silent `__ALL__` fallback on an unknown role disables the role
filter without failing (T002322); for a toolset block that fallback would inject the entire
arsenal into every prompt, which is the outcome the curation exists to prevent.

#### Scenario: Role filter narrows the output

- **GIVEN** an instance whose `roles` list is `[bachelorprojekt-db]`
- **AND** an instance whose `roles` list is `[bachelorprojekt-website]`
- **WHEN** `scripts/toolset-context.sh bachelorprojekt-db` runs
- **THEN** it exits zero, the output contains the first instance id and does not contain the second

#### Scenario: Wildcard role reaches every dispatch

- **GIVEN** an instance whose `roles` list is `[all]`
- **WHEN** `scripts/toolset-context.sh bachelorprojekt-website` runs
- **THEN** the output contains that instance id

#### Scenario: Unknown role fails closed

- **GIVEN** the role argument `db`, which is a short form and not in the allowlist
- **WHEN** `scripts/toolset-context.sh db` runs
- **THEN** it exits non-zero, and its output does not contain any instance id

#### Scenario: Suppressed instances are never injected

- **GIVEN** an instance with `state: suppressed` whose `roles` list contains `all`
- **WHEN** `scripts/toolset-context.sh orchestrator` runs
- **THEN** it exits zero, the output contains at least one canonical instance id, and does not
  contain the suppressed instance id

### Requirement: Curation is interactive and never records a state without a reason

The `toolset-curate` skill SHALL, for each `unreviewed` instance, present the capability it
overlaps and — where `docs/agent-guide/registry/toolset.lock.yaml` holds an entry — its measured
tool count, ask the operator for the state, and record the decision together with its reason. For
an instance the operator marks `canonical`, the skill SHALL additionally capture `use_when` and
`roles`, because `check.mjs` rejects a canonical instance without them. After writing, the skill
SHALL run `sync.mjs` and then `check.mjs`, and SHALL treat a non-zero `check.mjs` exit as a
failure of the curation rather than as advisory output.

#### Scenario: Curating an instance as canonical captures usage semantics

- **GIVEN** one `unreviewed` instance
- **WHEN** the operator marks it `canonical` and supplies `use_when` and `roles`
- **THEN** `capabilities.yaml` records all three fields, and a subsequent `check.mjs` run exits
  zero and reports no `unreviewed` entry for it

<!-- merged from change delta toolset-registry.md (5027ffa9f612) -->

### Requirement: Local sources are consulted before remote ones

The lookup SHALL evaluate its sources in a fixed order: first
`docs/agent-guide/registry/capabilities.yaml`, then the marketplaces registered in
`~/.claude/plugins/known_marketplaces.json`, and last the official MCP registry at
`https://registry.modelcontextprotocol.io/v0/servers`. Where a candidate appears in more than one
source, the local curation state SHALL win.

Rationale: the most valuable answer to "is there anything for X?" is "we evaluated that and
rejected it, because …". That answer is held locally and costs no network access. A registry
search that runs before the local reconciliation produces candidates the project has long since
judged.

#### Scenario: A candidate is already curated

- **GIVEN** `capabilities.yaml` lists `mcp:com.pulsemcp/playwright-stealth` with `state: suppressed`
- **WHEN** `find "browser automation"` runs and the registry returns that same server
- **THEN** the hit is shown with its `suppressed` state and stored `reason`, not as a new candidate

#### Scenario: The registry is unreachable

- **GIVEN** `registry.modelcontextprotocol.io` does not respond within 10 seconds
- **WHEN** `find` runs
- **THEN** the command returns the local hits, names the failed source on stderr, and exits 0

### Requirement: inspect returns schemas rather than prose where possible

For a server carrying at least one `remotes[]` entry, `inspect` SHALL perform an MCP
`initialize` + `tools/list` sequence against `remotes[].url` and print the returned tool names
with their parameters. Only when no `remotes[]` entry exists, or the sequence fails, SHALL it fall
back to the `README` of the `repository` field.

The output SHALL label which source was used (`schema` versus `readme`).

Rationale: a `tools/list` describes what the server ships right now; a README describes what
somebody once wrote down. That difference matters for an adoption decision and must not disappear
in the presentation.

#### Scenario: Server with a reachable remote

- **GIVEN** a registry entry whose `remotes[0].type` is `streamable-http`
- **WHEN** `inspect <name>` runs and the remote responds
- **THEN** the output contains the tool names from `tools/list` and the label `schema`

#### Scenario: Server without a remote

- **GIVEN** a registry entry that carries only `packages[]` (npm or OCI)
- **WHEN** `inspect <name>` runs
- **THEN** the output contains the README excerpt, the label `readme`, and the acquisition path

#### Scenario: Remote responds but demands credentials

- **GIVEN** the remote answers `initialize` with an authentication error
- **WHEN** `inspect <name>` runs
- **THEN** the command falls back to `readme` and notes that the server requires credentials

### Requirement: Only decisions are persisted, never lookups

The lookup SHALL NOT write registry responses, READMEs or tool schemas to disk. The `record` verb
SHALL write exactly one entry into `capabilities.yaml` and then run
`node scripts/toolset/check.mjs`.

Rationale: a cache solves speed, not knowledge loss, and creates an invalidation duty. What
outlives a session is the judgement alone. The schema for it already exists and is not duplicated.

#### Scenario: record writes a suppressed entry

- **GIVEN** a server that was evaluated and rejected
- **WHEN** `record <name> --capability <cap> --state suppressed --reason "<text>"` runs
- **THEN** `capabilities.yaml` contains an entry with `state: suppressed` and that `reason`, and
  `node scripts/toolset/check.mjs` exits 0

#### Scenario: record without a reason on a non-canonical state

- **GIVEN** `--state suppressed` is passed without `--reason`
- **WHEN** `record` runs
- **THEN** the command exits 1 before touching the file

<!-- merged from change delta toolset-registry.md (2d24df13fbef) -->

### Requirement: Usage semantics schema validation in check runner

The automated test runner in `scripts/toolset/check.test.mjs` SHALL validate that `check.mjs` passes when valid usage semantics (`use_when`, `roles`) are present in test fixtures, and SHALL validate that `check.mjs` fails when a canonical instance lacks `use_when` or non-empty `roles`.

#### Scenario: Valid fixture with usage semantics passes
 
- **GIVEN** a test fixture with a canonical instance containing valid `use_when` and non-empty `roles`
- **WHEN** `node scripts/toolset/check.mjs` executes in the test runner
- **THEN** it exits zero with "check passed"
 
#### Scenario: Canonical fixture missing usage semantics fails
 
- **GIVEN** a test fixture with a canonical instance missing `use_when` or `roles`
- **WHEN** `node scripts/toolset/check.mjs` executes in the test runner
- **THEN** it exits non-zero and reports missing `use_when` or missing `roles`

<!-- merged from change delta toolset-registry.md (c97466b2b59e) -->