## ADDED Requirements

### Requirement: Workflows With push.paths Must List Themselves

Every workflow in `.github/workflows/` that restricts its `push` trigger with a `paths:` filter
MUST include its own file path in that filter. Without it, a change to the workflow itself does
not trigger a run, so the change lands on `main` and silently has no effect — no run, no error,
no signal.

#### Scenario: Renderer change triggers the renderer

- **GIVEN** a commit that modifies only `.github/workflows/render-fleet-artifact.yml`
- **WHEN** it is pushed to `main`
- **THEN** the `Render Fleet Artifact` workflow is triggered
- **AND** a fresh OCI artifact is rendered and pushed

#### Scenario: Guard names every deviating workflow

- **GIVEN** at least one workflow declares a `push.paths` filter
- **WHEN** `tests/spec/ci-cd/workflow-self-trigger.bats` runs
- **THEN** it passes only if every such workflow lists its own file path
- **AND** on failure the output names each deviating workflow file
