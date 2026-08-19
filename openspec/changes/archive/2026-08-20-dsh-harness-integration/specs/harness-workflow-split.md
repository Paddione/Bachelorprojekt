## MODIFIED Requirements

### Requirement: the tool registry records a harness per entry

`docs/agent-guide/registry/tools.yaml` SHALL carry a `harness` field on every entry with a value
in `{claude, opencode, dsh, both, all}`, validated by `scripts/agent-guide/validate.mjs`.
`scripts/agent-guide/emit-maps.mjs` SHALL render a `Harness` column in
`docs/agent-guide/maps/tools-map.md`.

The value `both` SHALL keep its established meaning of "Claude Code and opencode" so that every
pre-existing entry stays correct without being rewritten. The value `all` SHALL mean "every
declared harness including dsh". A tool reachable from dsh only SHALL be marked `dsh`.

#### Scenario: validate rejects a missing or invalid harness

- **GIVEN** a registry fixture whose tool entry has an invalid `harness` value
- **WHEN** `validateRegistry(dir)` runs
- **THEN** it returns `ok: false` with an error mentioning `harness`

#### Scenario: validate accepts the dsh harness

- **GIVEN** a registry fixture whose tool entry declares `harness: dsh`
- **WHEN** `validateRegistry(dir)` runs
- **THEN** it returns `ok: true`, and the same holds for `harness: all`

#### Scenario: both keeps its two-harness meaning

- **GIVEN** the registry entries that declared `harness: both` before this change
- **WHEN** `validateRegistry(dir)` runs after the enum is widened
- **THEN** every one of them still validates, and none has been rewritten to `all` as a side
  effect of adding dsh

#### Scenario: tools-map renders the Harness column

- **GIVEN** the regenerated `docs/agent-guide/maps/tools-map.md`
- **WHEN** it is read
- **THEN** each tool table header carries a `Harness` column and every row shows one of
  `claude`, `opencode`, `dsh`, `both`, or `all`
