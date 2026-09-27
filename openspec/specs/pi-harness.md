# pi-harness

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu pi-harness ergänzen._

## Requirements

### Requirement: Pi is installed pinned and isolated from the user's Pi configuration

The system SHALL provide `taskfiles/Taskfile.pi.yml` with the tasks `install`, `status` and
`uninstall`. `install` SHALL install `@mariozechner/pi-coding-agent` at a pinned version.
Every Pi invocation issued by the repository SHALL set `PI_CODING_AGENT_DIR` to
`${XDG_STATE_HOME:-$HOME/.local/state}/pi-harness/agent` or a directory below it and `PI_OFFLINE=1`, so that
`~/.pi` is never read or written and no telemetry or update check leaves the host.

#### Scenario: Taskfile declares the lifecycle tasks

- **GIVEN** the repository is checked out
- **WHEN** `taskfiles/Taskfile.pi.yml` is parsed as YAML
- **THEN** parsing succeeds and the tasks `install`, `status` and `uninstall` are declared
- **AND** the `install` task names a fixed version of `@mariozechner/pi-coding-agent`

### Requirement: The trial runner builds each level from an all-disabled baseline

`scripts/pi-run.sh` SHALL start Pi with context-file, skill, extension, prompt-template and
theme discovery disabled at every level, and SHALL add only what the level defines:
L0 the plan text with the tools `read,write,edit,bash`; L1 additionally the contents of
`.pi/context.md` as appended system prompt; L2 additionally the tools `grep,find,ls`;
L3 additionally one `--skill` per registry skill granted to the role `pi`.
An unknown level SHALL exit 1 and name the valid levels.

#### Scenario: L0 loads nothing beyond the four core tools

- **GIVEN** a plan file exists
- **WHEN** `scripts/pi-run.sh <plan> --level L0 --dry-run` runs
- **THEN** it exits 0 and the printed command contains `--no-context-files`, `--no-skills`,
  `--no-extensions` and `--tools read,write,edit,bash`
- **AND** it contains no `--skill` and no `--append-system-prompt`

#### Scenario: L2 widens only the tool list

- **GIVEN** a plan file exists
- **WHEN** `scripts/pi-run.sh <plan> --level L2 --dry-run` runs
- **THEN** the printed command contains `--tools read,write,edit,bash,grep,find,ls`
  and `--append-system-prompt`

#### Scenario: Unknown level is rejected

- **WHEN** `scripts/pi-run.sh <plan> --level L9 --dry-run` runs
- **THEN** it exits 1 and the output names `L0 L1 L2 L3`

### Requirement: The trial runner resolves models across the local endpoint pool and fails loudly without one

Before a real run, `scripts/pi-run.sh` SHALL query `GET /v1/models` on every endpoint of the pool
(`PI_ENDPOINTS`, comma- or space-separated base URLs, default `http://127.0.0.1:1919` and
`http://127.0.0.1:1234`; `PI_LOCAL_BASE_URL` replaces the pool with a single endpoint). It SHALL
write one provider per answering endpoint into `models.json` of a per-run Pi agent directory and
SHALL omit model ids containing `embed` or `rerank`. An endpoint that does not answer SHALL be
named on stderr. When no endpoint returns a model, the runner SHALL exit 2 naming the queried
URLs. A requested `--model` SHALL be resolved to the first endpoint serving that exact id; an id
served by no endpoint SHALL exit 2 and list the available ids. The runner SHALL NOT fall back to
any other provider, and Pi SHALL NOT be started in either failure case.

#### Scenario: Endpoint without listener

- **GIVEN** `PI_LOCAL_BASE_URL` points to a port with no listener
- **WHEN** `scripts/pi-run.sh <plan> --level L0` runs
- **THEN** it exits 2 and the output contains that URL
- **AND** Pi is not started

#### Scenario: Model is routed to the endpoint that serves it

- **GIVEN** two endpoints in `PI_ENDPOINTS`, the second serving model `beta-model`
- **WHEN** `scripts/pi-run.sh <plan> --level L0 --model beta-model --skip-tests` runs
- **THEN** Pi is started with the provider of the second endpoint and model `beta-model`
- **AND** the `models.json` Pi sees points that provider at the second endpoint

#### Scenario: Unknown model is rejected before Pi starts

- **WHEN** `scripts/pi-run.sh <plan> --level L0 --model no-such-model` runs against a reachable pool
- **THEN** it exits 2, the output lists the available model ids and Pi is not started

### Requirement: The trial runner offers a caller contract for orchestration

`scripts/pi-run.sh --list-models` SHALL print one line `<model-id><TAB><endpoint>` per chat model
of the pool and exit 0, or exit 2 when the pool is empty. With `--json`, the listing SHALL be a
JSON array and the final run report SHALL be a single JSON object on stdout with the keys
`level`, `plan`, `endpoint`, `provider`, `model`, `pi_exit`, `changed_files`, `test_exit` and
`log`. `--skip-tests` SHALL skip `task test:changed` and report `test_exit` as `null`. Each run
SHALL use its own Pi agent directory and remove it afterwards, so concurrent callers do not share
`models.json`.

#### Scenario: Callers discover the pool

- **GIVEN** two reachable endpoints and one endpoint without listener in `PI_ENDPOINTS`
- **WHEN** `scripts/pi-run.sh --list-models` runs
- **THEN** it exits 0, lists the chat models of both reachable endpoints with their URL
- **AND** omits embedding models and names the silent endpoint on stderr

#### Scenario: Machine-readable report

- **WHEN** `scripts/pi-run.sh <plan> --level L0 --json --skip-tests` finishes
- **THEN** the last stdout line is a JSON object with `pi_exit` and `model`, and `test_exit` is `null`

### Requirement: Every trial run leaves a reproducible record

A real run SHALL write Pi's JSON event stream to `.pi/runs/<ticket-or-plan>-<level>-<timestamp>.jsonl`
and SHALL report level, model id, Pi exit code, number of changed files and the exit code of
`task test:changed`. When the run was started with a ticket id, this report SHALL be posted as
a ticket comment.

#### Scenario: Result is attached to the ticket

- **GIVEN** a run started as `scripts/pi-run.sh T900529 --level L1`
- **WHEN** Pi finishes
- **THEN** a comment on T900529 contains the level `L1`, the model id and both exit codes

<!-- merged from change delta pi-harness.md (1c5127fab33c) -->