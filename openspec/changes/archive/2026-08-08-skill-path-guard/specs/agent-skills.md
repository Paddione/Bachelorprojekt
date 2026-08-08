# Spec Delta: agent-skills

## ADDED Requirements

### Requirement: Repo-relative path references in first-party skills must resolve

A test SHALL check every repo-relative path reference in first-party skill files against the file
system and SHALL fail when a reference does not resolve. References with a file extension under
`openspec/`, `scripts/`, `tests/`, `docs/`, `website/`, `k3d/`, `environments/` and `flux/` SHALL
be checked.

Vendored third-party skills SHALL be excluded. This concerns `gitops-*` and `vitest`: their
references, such as `docs/spec/v1/kustomizations.md`, point at upstream fluxcd.io documentation or
at example paths in foreign projects, not at this repository. Without that exclusion the guard
produces 23 false positives against 3 genuine findings and is worthless.

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

#### Scenario: A vendored third-party skill is not judged

- **GIVEN** `.claude/skills/gitops-repo-audit/references/flux-api-summary.md` references
  `docs/spec/v1/kustomizations.md`, which does not exist in this repository
- **WHEN** the guard runs
- **THEN** it does not report that reference

### Requirement: The vision path of the headed run is documented with a probe

Step 8.5 of the `dev-flow-e2e` skill SHALL describe how the vision server required for visual
verification is reached, and SHALL name a probe command that establishes its availability before
the run.

The skill SHALL keep port `8094` as the preferred dedicated endpoint and SHALL name port `8091` as
the fallback. This requirement covers operation only; it does not change REQ-k8-04.

Rationale: measured on 2026-08-03, port `8094` (the dedicated Bonsai/PrismML mmproj server) does
not respond, while port `8091` runs the `gemma26-factory` loadout, which carries `mmprojPath`. The
skill names only `8094` and no probe, so an agent following step 8.5 runs into a silent connection
failure.

#### Scenario: The agent probes availability before the vision step

- **GIVEN** step 8.5 is executed and `8094` does not respond
- **WHEN** the agent follows the skill
- **THEN** the skill provides the fallback to `8091` together with a probe command
