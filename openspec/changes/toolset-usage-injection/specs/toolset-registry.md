## ADDED Requirements

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
