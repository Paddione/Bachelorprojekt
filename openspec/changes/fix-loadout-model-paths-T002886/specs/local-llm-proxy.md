## ADDED Requirements

### Requirement: Loadout auxiliary files SHALL resolve against the model roots

Every loadout that declares an auxiliary model file — a multimodal projector
(`args.mmprojPath`) or a speculative draft head (`speculative.draftModelPath`) — SHALL have that
file resolvable against at least one entry of `modelRoots`. Loadouts marked
`"managed": "external"` are exempt, because they carry an identifier rather than a path.

An unresolvable auxiliary path is a silent failure: the server still starts, but without the
capability the entry was there to provide. This is distinct from an unresolvable `model`, which
prevents startup outright and is already covered by the T002753 guard.

#### Scenario: A declared projector file is missing from every model root

- **GIVEN** a loadout declares `args.mmprojPath` pointing at a file that exists in no `modelRoot`
- **WHEN** the auxiliary-file guard runs
- **THEN** the guard fails and names both the loadout slug and the offending field

#### Scenario: No model roots are present on the runner

- **GIVEN** none of the configured `modelRoots` exist on the machine running the tests
- **WHEN** the auxiliary-file guard runs
- **THEN** the guard skips with an explicit reason rather than reporting a false pass
- **AND** the skip decision is based on the absence of the roots, never on the check result

#### Scenario: The resolution mechanism itself is verified

- **GIVEN** the guard's own resolution helper
- **WHEN** it is handed a path that is guaranteed absent and a path that is guaranteed present
- **THEN** it reports the first as missing and the second as resolved
- **AND** this anchor runs independently of the registry contents, so a registry that declares no
  auxiliary files at all cannot make the guard pass vacuously

### Requirement: Speculative decoding SHALL be explicitly enabled, not merely configured

A loadout that declares `speculative.draftModelPath` SHALL also declare the speculative
implementation to use. `llama-server` defaults `--spec-type` to `none`: a draft head supplied via
`-md` alone is loaded into memory and never used, which costs VRAM and yields no speedup while
appearing correctly configured in both the registry and the process command line.

#### Scenario: A loadout declares a draft head

- **GIVEN** a loadout sets `speculative.draftModelPath`
- **WHEN** the runner builds the server argument vector
- **THEN** the argument vector contains an explicit `--spec-type` value
- **AND** that value is not `none`

## MODIFIED Requirements

### Requirement: Loadout model files SHALL resolve, and failures SHALL name the offenders

The existing guard requiring every loadout's `model` to resolve against `modelRoots` is retained
unchanged in scope. Its diagnostic output is corrected: the list of unresolvable loadouts SHALL be
emitted before the assertions, so that a failing run reports which loadouts are affected rather
than only that its positive anchor failed.

The anchor is deliberately pinned to a concrete slug and stays that way — a generic anchor could
not detect a resolution helper that always succeeds. The defect being fixed is that the anchor is
evaluated before the diagnostic line is reached, which makes a red run uninformative precisely
when the registry has drifted furthest.

#### Scenario: Several loadouts have unresolvable model files

- **GIVEN** more than one loadout references a model file that exists in no `modelRoot`
- **WHEN** the model-file guard runs
- **THEN** the output lists every affected loadout slug
- **AND** the listing appears even when the positive anchor is among the affected loadouts
