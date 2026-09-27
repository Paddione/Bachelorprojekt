## ADDED Requirements

### Requirement: Pi is installed pinned and isolated from the user's Pi configuration

The system SHALL provide `taskfiles/Taskfile.pi.yml` with the tasks `install`, `status` and
`uninstall`. `install` SHALL install `@mariozechner/pi-coding-agent` at a pinned version.
Every Pi invocation issued by the repository SHALL set `PI_CODING_AGENT_DIR` to
`${XDG_STATE_HOME:-$HOME/.local/state}/pi-harness/agent` and `PI_OFFLINE=1`, so that
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

### Requirement: The trial runner uses only the local endpoint and fails loudly without it

Before a real run, `scripts/pi-run.sh` SHALL query `GET /v1/models` on the local endpoint
(default `http://127.0.0.1:1919`, overridable via `PI_LOCAL_BASE_URL`) and SHALL write the
returned model ids as provider `local` into `models.json` in the Pi agent directory. When the
endpoint does not answer or returns no model, the runner SHALL exit 2 with a message naming
the URL, and SHALL NOT fall back to any other provider.

#### Scenario: Endpoint without listener

- **GIVEN** `PI_LOCAL_BASE_URL` points to a port with no listener
- **WHEN** `scripts/pi-run.sh <plan> --level L0` runs
- **THEN** it exits 2 and the output contains that URL
- **AND** Pi is not started

### Requirement: Every trial run leaves a reproducible record

A real run SHALL write Pi's JSON event stream to `.pi/runs/<ticket-or-plan>-<level>-<timestamp>.jsonl`
and SHALL report level, model id, Pi exit code, number of changed files and the exit code of
`task test:changed`. When the run was started with a ticket id, this report SHALL be posted as
a ticket comment.

#### Scenario: Result is attached to the ticket

- **GIVEN** a run started as `scripts/pi-run.sh T900529 --level L1`
- **WHEN** Pi finishes
- **THEN** a comment on T900529 contains the level `L1`, the model id and both exit codes
