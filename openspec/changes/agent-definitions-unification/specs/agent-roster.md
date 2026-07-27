## ADDED Requirements

### Requirement: The agent roster must be declared in a single machine-readable registry

`docs/agent-guide/registry/agents.yaml` is the single source of truth for which agents exist in
which harness. It MUST declare two separate top-level keys, because the repository operates two
orthogonal kinds of agent:

- `roles` — domain agents defined as Markdown files under `.claude/agents/`, each identified by
  its `name:` frontmatter and carrying routing signals and a model tier.
- `runtimes` — model-tier agents defined in `.opencode/agent-models.jsonc`, each carrying a
  `mode` (`primary` or `subagent`) and a concrete backing model.

Every entry under `roles` MUST carry one value per harness (`claude_code`, `agy`, `opencode`).
Permitted values are a model identifier, `null` when the agent does not exist in that harness, or
`unsupported` when the harness loads the definition but cannot honour its `model:` field.

`unsupported` exists because `.claude/agents/*.md` declare Anthropic model names (`sonnet`,
`opus`) while agy runs Gemini models. Recording `null` would deny that agy loads the files at all,
which is false; recording a model name would claim a mapping that does not exist.

#### Scenario: a domain agent exists in Claude Code and agy but not in opencode

- **GIVEN** `.claude/agents/bachelorprojekt-infra.md` declares `model: opus`
- **AND** opencode does not read `.agents/agents/`
- **WHEN** the entry is written to `agents.yaml`
- **THEN** it records `claude_code: opus`, an explicit `agy` value, and `opencode: null`

#### Scenario: a harness loads the definition but cannot honour its model field

- **GIVEN** agy resolves `~/.gemini/config/agents` through to `.claude/agents/` and lists all six
  files
- **AND** agy has no configuration that maps `sonnet` or `opus` onto a Gemini model
- **WHEN** the entry is written to `agents.yaml`
- **THEN** the `agy` value is `unsupported`, not a model name and not `null`

### Requirement: The roster registry must emit a generated map and be drift-gated

`scripts/agent-guide/load.mjs` MUST load `agents.yaml` alongside the existing registry files, and
`scripts/agent-guide/emit-maps.mjs` MUST emit `docs/agent-guide/maps/agents-map.md` from it, so
`task agent-guide:maps` and `task freshness:regenerate` keep the map current.

A fail-closed test MUST compare the registry against the actual repository state and fail on any
divergence:

- every key under `roles` corresponds to a `.claude/agents/<name>.md` file, and every such file
  has a `roles` entry;
- every key under `runtimes` corresponds to an `agent` key in `.opencode/agent-models.jsonc`, and
  every such key has a `runtimes` entry;
- every agent name mentioned in `CLAUDE.md` exists in the registry.

The third assertion is the one that would have caught the drift this change repairs: `CLAUDE.md`
named four opencode subagents (`qwen35-iq4`, `qwen35`, `qwen35-hq`, `qwen3-14b`) that had been
deleted on 2026-07-22 and stayed in the file until 2026-07-27.

#### Scenario: an agent is renamed in the opencode config but not in the registry

- **GIVEN** `.opencode/agent-models.jsonc` declares an agent key absent from `runtimes`
- **WHEN** the drift test runs
- **THEN** it fails and names the missing key

#### Scenario: an instruction file names an agent that no longer exists

- **GIVEN** `CLAUDE.md` mentions an agent name that is in neither `roles` nor `runtimes`
- **WHEN** the drift test runs
- **THEN** it fails and names the stale mention

#### Scenario: the registry and the repository agree

- **GIVEN** `agents.yaml` lists exactly the six `.claude/agents/*.md` roles and the opencode
  agent keys
- **WHEN** `task agent-guide:maps` and the drift test run
- **THEN** the map regenerates without diff and the test passes

### Requirement: The maps emitter must not leave temporary files behind on failure

`atomicWriteFile()` in `scripts/agent-guide/emit-maps.mjs` writes to a randomly named `.tmp`
sibling and renames it over the destination. Its failure path MUST remove the temporary file
rather than retry the rename that just failed, so an interrupted or failed emitter run leaves no
residue in `docs/agent-guide/maps/`.

#### Scenario: the rename fails mid-write

- **GIVEN** `writeFile` succeeded but `rename(tmp, dest)` threw
- **WHEN** the catch block runs
- **THEN** the temporary file is unlinked, a missing file is tolerated, and the original error is
  rethrown unchanged
