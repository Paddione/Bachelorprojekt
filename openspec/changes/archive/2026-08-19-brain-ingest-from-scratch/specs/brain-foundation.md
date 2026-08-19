## ADDED Requirements

### Requirement: REQ-BRAIN-FOUNDATION-016 — From-Scratch Rebuild Mode

`scripts/brain-ingest.sh` SHALL provide a `--from-scratch` mode that establishes a
defined zero state before transformation, so that a rebuild of the brain wiki is
reproducible instead of relying on manual state deletion.

When the flag is set, the script SHALL, after checking out the branch in the brain repo
and before the LLM transformation phase:

1. Delete every page under `<brain-repo>/wiki/` whose `source::` line refers to
   Bachelorprojekt. The deletion criterion SHALL be read from the page itself, not from
   the state file, so the reset also works when the state file is unusable.
2. Preserve every page carrying `source:: self`, carrying no `source::` line, or
   referring to a source outside Bachelorprojekt — the same invariant
   REQ-BRAIN-FOUNDATION-013 establishes for the prune phase.
3. Reset the state file to an empty JSON object, regardless of its previous content.

The subsequent transformation phase SHALL remain unchanged: with an empty state, no
source is skipped, which is what makes the rebuild free of stale pages.

`--from-scratch` combined with `--pilot` SHALL abort with exit code 2, because the
combination would delete all pages and rebuild only the pilot subset, leaving a thinned
wiki rather than a pilot run.

Combined with `--dry-run`, the mode SHALL report what it would delete and reset without
modifying any file.

#### Scenario: Rebuild deletes Bachelorprojekt pages and resets state

- **GIVEN** a wiki containing pages with `source:: Bachelorprojekt <path>` lines and a
  state file with entries
- **WHEN** `brain-ingest.sh --from-scratch` runs
- **THEN** those pages are deleted before the transformation phase
- **AND** the state file contains an empty JSON object
- **AND** the transformation phase reports no skipped sources

#### Scenario: Meta pages survive the rebuild

- **GIVEN** a wiki page carrying `source:: self` and a wiki page carrying no `source::`
  line at all
- **WHEN** `brain-ingest.sh --from-scratch` runs
- **THEN** both pages still exist after the reset phase

#### Scenario: Pilot combination is rejected

- **GIVEN** an operator invokes the script with both `--from-scratch` and `--pilot 5`
- **WHEN** argument parsing completes
- **THEN** the script exits with code 2
- **AND** no wiki page and no state file has been modified

#### Scenario: Dry run reports without deleting

- **GIVEN** a wiki containing Bachelorprojekt-sourced pages
- **WHEN** `brain-ingest.sh --from-scratch --dry-run` runs
- **THEN** the script reports the pages it would delete and that it would reset the state
- **AND** every wiki page still exists
- **AND** the state file is unchanged

### Requirement: REQ-BRAIN-FOUNDATION-017 — State File Type Repair

`scripts/brain-ingest.sh` SHALL ensure the ingest state file holds a JSON object before
any state lookup, repairing it when it holds a value of any other JSON type.

Checking only for the file's existence is insufficient: an existing file holding a JSON
array makes every `jq '.[$key].hash'` lookup fail. Because that failure is silenced and
falls back to an empty string, it becomes indistinguishable from "this source has not
been transformed yet". The consequence is not merely lost idempotency — the reverse map
that REQ-BRAIN-FOUNDATION-013 relies on for pages without a `source::` line is silently
unavailable, so such pages are never recognised as prune candidates.

#### Scenario: A state file holding a JSON array is repaired

- **GIVEN** the ingest state file exists and contains a JSON array
- **WHEN** the ingest script initialises its state
- **THEN** the state file contains an empty JSON object
- **AND** subsequent state lookups succeed

#### Scenario: A populated state file is left untouched

- **GIVEN** the ingest state file exists and contains a JSON object with entries
- **WHEN** the ingest script initialises its state
- **THEN** the entries are unchanged
