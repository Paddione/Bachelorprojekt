## ADDED Requirements

### Requirement: Portable skill inventory is authoritative across four harnesses

The repository SHALL maintain a machine-readable skill inventory that is authoritative for every tracked project skill exposed to Codex, agy, OpenCode, or Claude Code. Each inventory entry MUST identify its stable skill id, provenance, supported harnesses, exposure type (`portable`, `native`, or `adapter`), canonical source path, expected projection paths, and an explicit rationale for every non-identical projection or excluded harness.

The inventory MUST distinguish portable canonical bodies from harness-native content. A skill MUST NOT become absent, newly exposed, or be excluded from a harness merely because a directory symlink happens to resolve on the current operating system.

#### Scenario: a portable skill is exposed to every declared harness

- **GIVEN** a registry entry declares a portable skill for Codex, agy, OpenCode, and Claude Code
- **WHEN** the inventory validator evaluates the repository
- **THEN** it finds the canonical body and every declared projection
- **AND** it reports the harness and skill id if any expected entry is missing or resolves to the wrong target

#### Scenario: a native OpenCode skill remains intentionally native

- **GIVEN** a registry entry declares an OpenCode-native skill with Codex, agy, and Claude Code excluded
- **WHEN** the inventory validator evaluates the repository
- **THEN** the skill is accepted only when the exclusion rationale is present
- **AND** an undeclared copy in another harness is reported as catalog drift

### Requirement: Portable skill bodies are harness-neutral

The canonical body of a portable skill SHALL use repository commands and named capabilities rather than a harness-private tool identifier or a hard-coded `.claude/skills` or `.opencode/skills` source path. Harness-private invocation syntax, runtime-specific MCP tool names, and path differences MUST reside in a declared adapter projection. A declared identical projection MUST have content equivalent to its portable source, apart from generated adapter metadata.

#### Scenario: an undeclared harness-private token is introduced into a portable body

- **GIVEN** a portable skill body contains a raw Claude-, OpenCode-, Codex-, or agy-private tool token
- **AND** no adapter declaration permits that token
- **WHEN** the portability lint runs
- **THEN** it fails and names the skill, token, and required adapter boundary

#### Scenario: an adapter maps a different ticket tool identifier

- **GIVEN** a portable workflow requires ticket commenting and one harness uses a different runtime tool identifier
- **WHEN** that mapping is placed in a registry-declared adapter
- **THEN** the portable body remains capability-oriented
- **AND** the adapter passes validation without weakening checks for other portable skills

### Requirement: Harness catalogs and agent-guide metadata include Codex

The generated or validated agent-guide catalog SHALL represent the supported harnesses `claude_code`, `opencode`, `agy`, and `codex` explicitly. Historic aggregate values such as `both` SHALL be replaced or migrated to an unambiguous representation before they are used to claim four-harness support. Tool and capability maps SHALL derive their harness availability from the same authoritative inventory used by the skill projection validator.

#### Scenario: a tool is advertised to Codex without a declared skill projection

- **GIVEN** the agent-guide metadata marks a skill-backed tool as available to Codex
- **AND** the inventory has no Codex projection for its skill id
- **WHEN** registry validation runs
- **THEN** it fails with the tool id and missing projection

#### Scenario: an existing two-harness tool retains its narrow availability

- **GIVEN** an existing tool is declared only for Claude Code and OpenCode
- **WHEN** the four-harness catalogs are rendered
- **THEN** it is not silently advertised to agy or Codex
- **AND** its explicit two-harness declaration remains visible
