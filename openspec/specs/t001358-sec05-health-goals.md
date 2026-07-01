# t001358-sec05-health-goals

## Purpose

SSOT spec.

## Requirements

### Requirement: G-SEC05 Bot-Commit Filter Completeness

`scripts/health-goals-check.sh` SHALL exclude commits authored by the GitHub
Actions bot from the G-SEC05 unsigned-commit measurement, regardless of
which of the two known bot email address variants appears in the commit
metadata (with or without the numeric `41898282+` prefix).

#### Scenario: Numeric-prefixed bot email is filtered

- **GIVEN** a commit authored with email `41898282+github-actions[bot]@users.noreply.github.com`
- **WHEN** `health-goals-check.sh` computes the G-SEC05 unsigned-commit count
- **THEN** that commit is excluded from the unsigned-commit count

#### Scenario: Non-prefixed bot email is filtered

- **GIVEN** a commit authored with email `github-actions[bot]@users.noreply.github.com`
- **WHEN** `health-goals-check.sh` computes the G-SEC05 unsigned-commit count
- **THEN** that commit is excluded from the unsigned-commit count

#### Scenario: Unrelated unsigned commits are still counted

- **GIVEN** a commit authored by a human contributor without a bot email
- **WHEN** `health-goals-check.sh` computes the G-SEC05 unsigned-commit count
- **THEN** that commit remains counted as unsigned

<!-- merged from change delta t001358-sec05-health-goals.md on 2026-07-01 -->