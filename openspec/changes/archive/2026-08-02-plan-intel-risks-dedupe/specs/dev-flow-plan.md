## ADDED Requirements

### Requirement: Intel bundle risks are deduplicated across regenerations

The intel bundle generator (`scripts/plan-intel.sh`) SHALL deduplicate the `risks[]` array by
the `(note, severity)` pair when it merges the previous bundle's risks into a freshly generated
one, so that repeated runs against the same change directory do not accumulate identical
entries.

#### Scenario: Repeated generator runs do not accumulate identical risks

- **GIVEN** a change directory whose `intel.json` was already generated
- **WHEN** the generator is run two more times against the same change directory
- **THEN** the resulting `risks[]` SHALL contain exactly one entry per distinct
  `(note, severity)` pair
- **AND** `intel.json` SHALL be byte-identical between the second and the third run

#### Scenario: A manually added risk survives regeneration

- **GIVEN** an `intel.json` whose `risks[]` contains an entry with a `note` the generator does
  not produce
- **WHEN** the generator is run again
- **THEN** that entry SHALL still be present exactly once in the regenerated `risks[]`

#### Scenario: Manually curated sections stay unaffected

- **GIVEN** an `intel.json` carrying `api_contracts` entries
- **WHEN** the generator is run again
- **THEN** those entries SHALL survive the run unchanged, preserving the existing behaviour for
  `api_contracts` and `external_types`
