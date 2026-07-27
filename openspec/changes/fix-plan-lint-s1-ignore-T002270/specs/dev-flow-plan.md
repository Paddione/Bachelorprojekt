## ADDED Requirements

### Requirement: plan-lint honours the S1 ignore list

`scripts/plan-lint.sh` SHALL read both `s1.limits` and `s1.ignore` from
`docs/code-quality/gates.yaml`. For a file matching an `s1.ignore` entry,
`residual_budget` SHALL return an empty value, so that neither the B1a budget-integrity
check nor the B1b split/shrink check applies to it. Matching SHALL treat entries as
repo-relative glob patterns, so that a directory pattern covers the files beneath it.

#### Scenario: An ignored file yields no budget

- **GIVEN** `scripts/ticket.sh` is listed under `s1.ignore` and exceeds the `.sh` limit
- **WHEN** `residual_budget scripts/ticket.sh` is evaluated
- **THEN** the result is empty rather than a negative number

#### Scenario: No split is demanded for an ignored file

- **GIVEN** a plan whose File Structure lists `scripts/ticket.sh` and which contains no
  split or shrink step
- **WHEN** `scripts/plan-lint.sh` runs against it
- **THEN** the run exits 0 and emits no `B1b` finding

#### Scenario: A gated file is unaffected

- **GIVEN** a file that is not on the ignore list and sits above its effective threshold
- **WHEN** `scripts/plan-lint.sh` runs against a plan touching it without a split step
- **THEN** the `B1b` warning is still emitted

### Requirement: Budget claims on ignored files are flagged

When a plan states a numeric budget for a file that `s1.ignore` covers,
`scripts/plan-lint.sh` SHALL emit a `W4` warning naming the file and explaining that the
S1 gate does not measure it. The warning SHALL NOT change the exit code.

#### Scenario: A numeric budget on an ignored file warns without failing

- **GIVEN** a plan row stating both a line count and a numeric budget for an ignored file
- **WHEN** `scripts/plan-lint.sh` runs against it
- **THEN** a `W4` warning names that file
- **AND** the run still exits 0

#### Scenario: Omitting the budget on an ignored file is silent

- **GIVEN** a plan row that states no numeric budget for an ignored file
- **WHEN** `scripts/plan-lint.sh` runs against it
- **THEN** no `W4`, `B1a` or `B1b` finding mentions that file
