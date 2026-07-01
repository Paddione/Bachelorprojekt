# ci01-skip-ci-bot-commits

## Purpose

SSOT spec.

## Requirements

### Requirement: freshness-regen bot commit carries [skip ci] marker

The `freshness-regen.yml` workflow MUST include `[skip ci]` in the bot commit message when pushing auto-regenerated freshness artifacts to `main`. The commit message MUST follow the pattern:

```
chore: auto-regenerate freshness artifacts [skip ci]
```

This prevents the bot commit from triggering a new CI workflow run on `main`, eliminating the 3-push cascade (PR merge → freshness-regen bot commit → release-please push) that caused CI queue-slot contention and run cancellations.

#### Scenario: freshness-regen commit does not trigger CI

- **GIVEN** a PR is merged to `main`
- **WHEN** `freshness-regen.yml` runs and auto-commits regenerated artifacts
- **THEN** the bot commit message contains `[skip ci]`
- **AND** GitHub Actions does not start a new CI run for the bot commit
- **AND** the in-progress CI run for the original merge commit is not cancelled

<!-- merged from change delta ci01-skip-ci-bot-commits.md on 2026-07-01 -->