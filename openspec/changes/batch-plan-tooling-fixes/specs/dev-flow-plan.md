## MODIFIED Requirements

### Requirement: Plan QA leaves the checked artifact untouched on a PASS outcome

The system SHALL run `scripts/plan-qa-check.sh` so that a PASS result implies the
checked plan file is byte-identical to the input file: the transient
`## QA-Ergänzungen` section appended during an auto-fix iteration SHALL be rolled
back before the script reports `RESULT: PASS`. An advisory tool SHALL NOT leave
boilerplate instructions in the artifact it checks.

#### Scenario: PASS after an auto-fix iteration leaves the plan unchanged

- **GIVEN** a plan file and a QA gateway that returns FAIL with suggestions on the
  first request and PASS on the second
- **WHEN** `plan-qa-check.sh` runs against that gateway
- **THEN** the script reports `RESULT: PASS`
- **AND** the plan file content is identical to its content before the run
- **AND** the plan file contains no `## QA-Ergänzungen` section

#### Scenario: PASS without auto-fix leaves the plan unchanged

- **GIVEN** a plan file and a QA gateway that returns PASS on the first request
- **WHEN** `plan-qa-check.sh` runs against that gateway
- **THEN** the script reports `RESULT: PASS`
- **AND** the plan file content is identical to its content before the run

### Requirement: Plan QA criterion 5 is checked deterministically like plan-lint STRUCT3

The system SHALL evaluate the final-verify criterion of `scripts/plan-qa-check.sh`
deterministically, mirroring `plan-lint` STRUCT3: the plan SHALL be searched with a
grep for the three literals `task test:changed`, `task freshness:regenerate` and
`task freshness:check` (each as `task <cmd>`, also inside checkbox lists). The LLM
SHALL NOT judge this criterion, so a plan that `plan-lint` accepts cannot be
contradicted by `plan-qa-check` on identical input.

#### Scenario: STRUCT3-conform plan is not flagged by the LLM

- **GIVEN** a plan whose last section lists the three commands as a checkbox task
- **AND** a QA gateway that would return FAIL citing criterion 5
- **WHEN** `plan-qa-check.sh` runs
- **THEN** the deterministic pre-check passes
- **AND** the reported result does not depend on the LLM re-judging criterion 5

#### Scenario: Plan missing a verify command fails deterministically

- **GIVEN** a plan that does not contain `task freshness:check` anywhere
- **WHEN** `plan-qa-check.sh` runs
- **THEN** the script reports `RESULT: FAIL` without contacting the QA gateway
- **AND** the reported result names the missing command

### Requirement: plan-intel accepts multiple space-separated --target-files

The system SHALL make `scripts/plan-intel.sh <slug> --target-files <f1> <f2> …`
accept any number of space-separated path arguments until the next `--`-prefixed
option or the end of the argument list, matching the invocation documented in
`opencode-flow-plan` Step A.1.5. The comma-separated single-argument form
(`--target-files a,b,c`) SHALL keep working.

#### Scenario: Multiple space-separated target files are all recorded

- **GIVEN** a change directory and three existing file paths
- **WHEN** the generator runs with `--target-files <f1> <f2> <f3>`
- **THEN** `intel.json` contains one `impact_files` entry per path
- **AND** the generator exits zero

#### Scenario: Comma-separated form stays compatible

- **GIVEN** a change directory and two existing file paths
- **WHEN** the generator runs with `--target-files <f1>,<f2>`
- **THEN** `intel.json` contains one `impact_files` entry per path
- **AND** the generator exits zero
