## ADDED Requirements

### Requirement: Open-Goals Report with Ticket Suggestion

`scripts/health-goals-update.sh` SHALL print, after the Prio-C table refresh report, a list of
every Prio-C goal whose marker is `⚠` (target not met) — regardless of whether that goal's value
changed in the current run — together with a ready-to-run `scripts/ticket.sh create ...` command
suggestion for each open goal. The script SHALL NOT create tickets automatically and SHALL NOT
prompt interactively; the report SHALL be printed unconditionally, including when `--dry-run` is
passed.

#### Scenario: Open goal with unchanged value is listed

- **GIVEN** a Prio-C table row `G-AGENTIC17` whose "Aktuell" value already carries the `⚠` marker
  before this run, and whose measured value is identical to the stored value
- **WHEN** `bash scripts/health-goals-update.sh` runs
- **THEN** the open-goals report includes `G-AGENTIC17` with its current and target values

#### Scenario: Ticket command suggestion is well-formed

- **GIVEN** an open goal `G-AGENTIC17` with measured value `3` and target `≤ 0`
- **WHEN** the open-goals report is printed
- **THEN** it includes a `scripts/ticket.sh create` command containing exactly one each of
  `--type`, `--title`, `--description`, and `--priority`, with the goal ID and its current/target
  values embedded in `--title`/`--description`

#### Scenario: No open goals

- **GIVEN** every Prio-C table row carries the `✓` marker after the refresh
- **WHEN** `bash scripts/health-goals-update.sh` runs
- **THEN** the open-goals report prints a single line stating that no goals are open, and no
  `scripts/ticket.sh create` command is printed

#### Scenario: Report is identical under --dry-run

- **GIVEN** the same measured values
- **WHEN** `bash scripts/health-goals-update.sh --dry-run` runs instead of a normal run
- **THEN** the open-goals report block is printed identically (dry-run only suppresses the write
  to `.claude/lib/goals.md`, not the report)
