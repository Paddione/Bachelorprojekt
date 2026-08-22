## ADDED Requirements

### Requirement: Rollup generator SHALL coalesce batches before staging

Der Generator soll Container nicht mehr bei jedem Lauf mit Einträgen stagten, sondern sie im
Collect Mode sammeln lassen, bis genug Einträge zusammen sind oder der älteste Eintrag alt
genug ist. Das verhindert die Container-Flut (18 Container in 40 Minuten am 2026-08-22) und
hält einen Factory-Run pro Zyklus statt einem pro Einzel-Eintrag.

The rollup generator (`scripts/factory/mishap-rollup.sh`) SHALL stage the container's plan only
when the batch has reached `ROLLUP_MIN_ENTRIES` entries (default 3) OR the oldest batch entry is
at least `ROLLUP_MAX_AGE_H` hours old (default 24). Both thresholds SHALL be overridable via
environment variables. Below both thresholds the generator SHALL exit 0 without creating a
worktree and without calling stage-plan, leaving the container in Collect Mode so that flush and
carry-over reuse the same container.

#### Scenario: Container below threshold stays in Collect Mode

- **GIVEN** a Collect-Mode container whose batch has fewer than `ROLLUP_MIN_ENTRIES` entries and
  whose oldest entry is younger than `ROLLUP_MAX_AGE_H` hours
- **WHEN** the rollup generator runs
- **THEN** it SHALL emit a no-op message and exit 0
- **AND** it SHALL NOT create a worktree
- **AND** it SHALL NOT call stage-plan

#### Scenario: Threshold reached stages the plan

- **GIVEN** a Collect-Mode container whose batch has at least `ROLLUP_MIN_ENTRIES` entries
- **WHEN** the rollup generator runs
- **THEN** it SHALL proceed with the existing staging path (worktree, plan generation, stage-plan)

#### Scenario: Age fallback stages a small batch

- **GIVEN** a Collect-Mode container whose batch has fewer than `ROLLUP_MIN_ENTRIES` entries but
  whose oldest entry is at least `ROLLUP_MAX_AGE_H` hours old
- **WHEN** the rollup generator runs
- **THEN** it SHALL proceed with the existing staging path (worktree, plan generation, stage-plan)

#### Scenario: Thresholds are overridable via environment

- **GIVEN** the environment variables `ROLLUP_MIN_ENTRIES` and `ROLLUP_MAX_AGE_H` are set
- **WHEN** the rollup generator evaluates the coalescing gate
- **THEN** the generator SHALL use the environment values instead of the defaults 3 and 24
