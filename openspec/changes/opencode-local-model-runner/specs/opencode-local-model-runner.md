## ADDED Requirements

### Requirement: opencode workflow runs on a fleet self-hosted runner
The `opencode` GitHub Actions workflow SHALL execute on a self-hosted runner reachable via the
`wg-gpu` WireGuard tunnel, instead of a GitHub-hosted runner, so it can reach the locally hosted
LLM at `192.168.100.10:1234`.

#### Scenario: Workflow targets the fleet runner label
- **GIVEN** the `opencode` workflow file
- **WHEN** the `opencode` job's `runs-on` key is read
- **THEN** it references a self-hosted runner label (not `ubuntu-latest`)

### Requirement: opencode workflow rejects fork-originated PRs
The `opencode` workflow SHALL only execute for comments on pull requests whose head repository
is this repository, in addition to the existing `author_association` gate, to prevent a trusted
collaborator from inadvertently triggering execution of untrusted fork code on the self-hosted
runner.

#### Scenario: Comment on a same-repo PR triggers the workflow
- **GIVEN** a `/oc` comment from an OWNER/MEMBER/COLLABORATOR on a PR whose head repo is this
  repository
- **WHEN** the `opencode` job's `if` condition is evaluated
- **THEN** the condition evaluates to true and the job runs

#### Scenario: Comment on a fork PR does not trigger the workflow
- **GIVEN** a `/oc` comment from an OWNER/MEMBER/COLLABORATOR on a PR whose head repository is
  an external fork
- **WHEN** the `opencode` job's `if` condition is evaluated
- **THEN** the condition evaluates to false and the job does not run

### Requirement: opencode workflow uses the local model instead of the cloud API
The `opencode` workflow SHALL invoke the local `llamacpp-mtp` model instead of the cloud
`opencode/big-pickle` model, and SHALL NOT reference the `OPENCODE_API_KEY` secret.

#### Scenario: Workflow model input matches the local provider
- **GIVEN** the `opencode` workflow's `Run opencode` step
- **WHEN** its `with.model` input is read
- **THEN** it references the local `llamacpp-mtp` model, and the step's `env` no longer
  references `secrets.OPENCODE_API_KEY`
