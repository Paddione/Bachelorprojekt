## ADDED Requirements

### Requirement: Plan Intel Bundle schema contract

A typed Plan Intel Bundle artifact (`openspec/changes/<slug>/intel.json`) MUST be backed by a
JSON-Schema at `.claude/skills/references/schemas/plan-intel-bundle.schema.json`. The schema MUST be
valid JSON, declare JSON-Schema draft 2020-12, and declare exactly eight top-level sections (`meta`,
`impact_files`, `symbols`, `call_graph`, `db_tables`, `api_contracts`, `external_types`, `risks`) of
which `meta`, `impact_files`, and `symbols` are required.

#### Scenario: schema is valid JSON declaring draft 2020-12

- **GIVEN** the schema file `.claude/skills/references/schemas/plan-intel-bundle.schema.json`
- **WHEN** it is parsed with `jq`
- **THEN** parsing MUST succeed (valid JSON)
- **AND** the file MUST contain the string `2020-12` (the draft declaration)

#### Scenario: schema requires the three mandatory sections

- **GIVEN** the parsed schema
- **WHEN** its `.required` array is inspected
- **THEN** it MUST contain `meta`, `impact_files`, and `symbols`
- **AND** `.properties` MUST declare all eight sections including `call_graph`, `db_tables`,
  `api_contracts`, `external_types`, and `risks`

### Requirement: Example fixture conforms to the schema

A committed fixture `.claude/skills/references/schemas/plan-intel-bundle.example.json` MUST conform to
the schema and serve as the CI validation target via structural `jq` assertions (no `ajv`). It MUST
carry the three required top-level keys, string `meta.slug` and `meta.ticket_id`, and non-empty
`impact_files` and `symbols` arrays whose elements carry every required field.

#### Scenario: fixture has the required top-level keys and scalar types

- **GIVEN** the fixture `plan-intel-bundle.example.json`
- **WHEN** it is parsed with `jq`
- **THEN** it MUST be valid JSON containing the keys `meta`, `impact_files`, and `symbols`
- **AND** `meta.slug` and `meta.ticket_id` MUST each be of JSON type `string`

#### Scenario: fixture array elements carry their required fields

- **GIVEN** the parsed fixture
- **WHEN** `impact_files` and `symbols` are inspected
- **THEN** each MUST be a non-empty array
- **AND** every `impact_files` element MUST have `path`, `language`, `loc`, `s1_limit`,
  `s1_baseline`, and `s1_budget`
- **AND** every `symbols` element MUST have `qualified_name`, `kind`, `file`, `signature`,
  `type_text`, and `source`

### Requirement: Schema and TypeScript mirror stay in sync

A hand-maintained TypeScript mirror `.claude/skills/references/schemas/plan-intel-bundle.d.ts` MUST
exist and its `PlanIntelBundle` interface MUST declare the same top-level keys as the schema's
`.properties`, so a cheap drift guard can catch divergence.

#### Scenario: top-level key parity holds

- **GIVEN** the schema and the `.d.ts` mirror
- **WHEN** the schema's `.properties` keys and the `PlanIntelBundle` interface field names are each
  extracted and sorted
- **THEN** the two sorted key sets MUST be identical

### Requirement: dev-flow-plan gathers and injects the Plan Intel Bundle

`.agents/skills/dev-flow-plan/SKILL.md` MUST add an Intel-Gathering step that produces `intel.json`
and MUST name the four primary intel sources, so a fresh plan-subagent references real types instead of
inventing them.

#### Scenario: the skill adds the Intel-Gathering step referencing intel.json

- **GIVEN** `.agents/skills/dev-flow-plan/SKILL.md`
- **WHEN** the file is read
- **THEN** it MUST contain an Intel-Gathering anchor (one of `A.1.5`, `Intel-Gathering`,
  `Plan Intel Bundle`)
- **AND** it MUST reference the token `intel.json`

#### Scenario: the skill names the four intel sources

- **GIVEN** `.agents/skills/dev-flow-plan/SKILL.md`
- **WHEN** the file is read
- **THEN** it MUST mention `codebase-memory`, `mcp-postgres`, `context7`, and `LSP`

### Requirement: dev-flow-execute consumes the Plan Intel Bundle

`.agents/skills/dev-flow-execute/SKILL.md` Schritt 2 MUST load `openspec/changes/<slug>/intel.json` as
mandatory implementer context, so implementation works on the same type truth as the plan with no
re-exploration.

#### Scenario: Step 2 block references intel.json

- **GIVEN** `.agents/skills/dev-flow-execute/SKILL.md`
- **WHEN** the `## Schritt 2:` block is sliced (header through the next `## ` header)
- **THEN** the sliced block MUST reference the token `intel.json`

### Requirement: BATS gate covers the Plan Intel Bundle (red→green)

A BATS test file `tests/spec/dev-flow-plan.bats` MUST exist and verify all requirements above. The
suite MUST be hermetic (it only reads repo files: schema, `.d.ts`, fixture, and both
`.agents/skills/dev-flow-*/SKILL.md`; no cluster, no network).

#### Scenario: suite fails red before implementation

- **GIVEN** the BATS file exists
- **AND** the schema files and skill wirings are absent (pre-implementation branch state)
- **WHEN** `tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats` is run
- **THEN** the suite MUST fail (red)

#### Scenario: suite passes green after implementation

- **GIVEN** the schema, `.d.ts`, fixture, doc, and both skill wirings are in place
- **WHEN** the suite is run
- **THEN** all test cases MUST pass (green)
