## MODIFIED Requirements

### Requirement: Repo-relative path references in first-party skills must resolve

A test SHALL check every repo-relative path reference in first-party skill files against the file
system and SHALL fail when a reference does not resolve. References with a file extension under
`openspec/`, `scripts/`, `tests/`, `docs/`, `website/`, `k3d/`, `environments/` and `flux/` SHALL
be checked.

The scan SHALL cover `.opencode/skills` alongside `.claude/skills`. After the move of the skill
SSOT to `.opencode/skills` the guard scanned only `.claude/skills` and `.agents/skills`, so every
reference under the new SSOT was invisible to it. `.agents/skills` SHALL NOT be relied upon as a
scan source: it is a git symlink to `.claude/skills` that Windows checkouts materialise as a text
file, so on those checkouts it resolves to nothing at all.

Path references SHALL further be recognised under both skill prefixes — `.claude/skills/` and
`.opencode/skills/`. A pattern matching only the former silently passes every dead reference
written in the new layout.

Vendored third-party skills SHALL be excluded. This concerns `gitops-*`, `vitest`,
`unsloth-buddy` and `ui-ux-pro-max`: their references, such as `docs/spec/v1/kustomizations.md`,
point at upstream documentation or at example paths in foreign projects, not at this repository.
Without that exclusion the guard produces false positives that outnumber the genuine findings and
is worthless.

The exclusion list SHALL be stated and justified inside the test itself rather than in a separate
file, because it is part of what the test asserts.

#### Scenario: A first-party skill references a non-existent file

- **GIVEN** a skill file outside the exclusion list contains `openspec/specs/gibtsnicht.md`
- **WHEN** the guard runs
- **THEN** it fails and names both the skill file and the dead path

#### Scenario: Positive anchor — resolvable references pass

- **GIVEN** the skill files as shipped after this change
- **WHEN** the guard runs
- **THEN** it passes and the number of references checked is greater than zero

#### Scenario: A reference under the .opencode/skills prefix is checked

- **GIVEN** a file under `.opencode/skills/references/` contains
  `(.opencode/skills/references/dev-flow-gotchas.md)`
- **WHEN** the guard runs
- **THEN** the path is extracted and checked for existence

#### Scenario: A dead reference in the new SSOT layout is caught

- **GIVEN** a file under `.opencode/skills/` references a path that does not exist
- **WHEN** the guard runs
- **THEN** it fails and names the file and the dead path, rather than passing because the file was
  never scanned

## ADDED Requirements

### Requirement: Skill shims and their targets must cover each other

A test SHALL assert bidirectional coverage between the `.claude/skills` shims and their
`.opencode/skills` targets: no shim SHALL point at a target that does not exist, and no target
SHALL be left without a shim. A one-sided check lets the two trees drift apart unnoticed, which is
what made the stale symlinks survive the SSOT move.

#### Scenario: A shim resolves to an existing target

- **GIVEN** a skill exists at `.opencode/skills/dev-flow-execute/SKILL.md`
- **AND** a shim exists at `.claude/skills/dev-flow-execute/SKILL.md`
- **WHEN** the shim-coverage test runs
- **THEN** it confirms the target exists and passes

#### Scenario: A shim without a target fails

- **GIVEN** a shim under `.claude/skills/` naming a target that is absent from `.opencode/skills/`
- **WHEN** the shim-coverage test runs
- **THEN** it fails and names the shim and the missing target

#### Scenario: A target without a shim fails

- **GIVEN** a skill under `.opencode/skills/` for which no shim exists under `.claude/skills/`
- **WHEN** the shim-coverage test runs
- **THEN** it fails and names the unshimmed skill
