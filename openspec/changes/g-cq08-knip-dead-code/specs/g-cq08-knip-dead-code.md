## ADDED Requirements

### Requirement: Knip dead-code measurement for website/src

The system SHALL provide a knip configuration under `website/knip.json` that
analyses the `website/src` source graph (Astro pages, API routes, Svelte
components, TypeScript modules) and reports unused exports and unused files.

#### Scenario: Knip is configured and runnable

- **GIVEN** the `website/` workspace with knip installed as a devDependency
- **WHEN** a developer runs `pnpm exec knip` inside `website/`
- **THEN** knip resolves the Astro/Svelte entry points and prints unused exports
  and unused files for `website/src` without crashing on framework files.

### Requirement: Dead-code baseline and 50 % reduction

The system SHALL record a measured baseline of dead-code items and SHALL reduce
the count of unused exports plus unused files in `website/src` by at least 50 %
relative to that baseline.

#### Scenario: Baseline recorded and halved

- **GIVEN** a recorded baseline in `docs/code-quality/knip-baseline.json` with
  `unused_before` set to the measured count
- **WHEN** the 50 % removal pass is complete and `unused_after` is recorded
- **THEN** `unused_before − unused_after` is at least `ceil(unused_before / 2)`.

### Requirement: Advisory knip CI gate

The system SHALL run knip in CI as an advisory (non-blocking) step so dead-code
regressions stay visible without blocking merges while the remaining items are
paid down in follow-up work.

#### Scenario: CI runs knip without failing the build

- **GIVEN** the CI website job with knip installed
- **WHEN** the advisory knip step runs and still finds remaining unused items
- **THEN** the step reports them but the job result stays green (warn, not fail).
