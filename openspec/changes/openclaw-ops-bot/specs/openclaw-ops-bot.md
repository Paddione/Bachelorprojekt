## ADDED Requirements

### Requirement: OpenClaw runs on its own pinned Node without touching the system Node

`task openclaw:install` SHALL install OpenClaw at the version pinned in
`taskfiles/Taskfile.openclaw.yml` using a Node 24 tarball whose SHA-256 is pinned in the same
file, extracted to `$HOME/.local/opt/node24`. A checksum mismatch SHALL abort the installation
before extraction. The Taskfile SHALL NOT install, uninstall or detect opencode and SHALL NOT use `sudo`; reading the
OpenCode Go key from `~/.local/share/opencode/auth.json` in `configure` is permitted.

#### Scenario: Taskfile pins Node by checksum and no longer installs opencode

- **GIVEN** the repository is checked out
- **WHEN** `taskfiles/Taskfile.openclaw.yml` is parsed as YAML
- **THEN** `NODE24_SHA256` is a 64-character hexadecimal string
- **AND** the file contains no `sudo`, no `npm install -g opencode` and no `command -v opencode`

### Requirement: The gateway is loopback-only and carries no secret in tracked files

The tracked configuration template `openclaw/openclaw.json5` SHALL bind the gateway to loopback
on port 18789 with token authentication, and SHALL reference every secret through an environment
variable. `openclaw/.env.example` SHALL list `OPENCLAW_GATEWAY_TOKEN`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `OPENCLAW_LOCAL_BASE_URL`, `OPENCODE_GO_API_KEY`, `OPENCLAW_GO_SESSION` and
`OPENCLAW_LOG_LEVEL`, with empty values for the five secret, chat and session variables.

#### Scenario: Template binds loopback and uses env references

- **GIVEN** `openclaw/openclaw.json5`
- **WHEN** the test parses it after stripping comments
- **THEN** `gateway.bind` is `loopback`, `gateway.port` is `18789`
- **AND** `gateway.auth.token` is `${OPENCLAW_GATEWAY_TOKEN}`

### Requirement: The ops agents may read and recommend but not write

The template SHALL define the agents `ops` (default, heartbeat every 30 minutes, delivery target
`telegram`) and `task-runner`. Both SHALL deny the tools `write`, `edit` and `apply_patch`, and
command execution SHALL run in allowlist mode restricted to read-only command patterns.
`openclaw/heartbeat-scratch.md` SHALL list each check with its exact command and the condition
that counts as a finding, and SHALL instruct the agent to reply `NO_REPLY` when there is no
finding. It SHALL be applied as the monitor scratch of the `ops` heartbeat job by
`task openclaw:start`, and no `HEARTBEAT.md` SHALL be placed in the OpenClaw workspace.

#### Scenario: Write tools are denied for both agents

- **GIVEN** `openclaw/openclaw.json5`
- **WHEN** the test reads `agents.entries.ops.tools.deny` and `agents.entries.task-runner.tools.deny`
- **THEN** both lists contain `write`, `edit` and `apply_patch`

### Requirement: The model chain prefers the local model

The template SHALL set `local/local-default` (base URL from `OPENCLAW_LOCAL_BASE_URL`) as primary
model and `opencode-go/muse-spark-1.3-contributor` as the only fallback, with thinking level `low`
for the fallback.

#### Scenario: Primary is local, fallback is OpenCode Go

- **GIVEN** `openclaw/openclaw.json5`
- **WHEN** the test reads `agents.defaults.model`
- **THEN** `primary` is `local/local-default` and `fallbacks` equals `["opencode-go/muse-spark-1.3-contributor"]`

### Requirement: Agents reach OpenClaw synchronously through openclaw-ask

`scripts/openclaw-ask.sh "<task>"` SHALL send the task to the agent `task-runner` via
`POST /v1/chat/completions` with model `openclaw/task-runner` and the gateway bearer token, and
SHALL print the returned message content. It SHALL exit 2 when no token is available, 3 when the
gateway does not answer, and 4 on an HTTP error or a response without message content.
`docs/agent-guide/registry/capabilities.yaml` SHALL register `cli:openclaw-ask` as canonical
instance for the role `orchestrator`.

#### Scenario: Successful call prints the answer

- **GIVEN** a fake gateway on a free local port that returns `{"choices":[{"message":{"content":"RESULT: done"}}]}` for the expected token
- **WHEN** `OPENCLAW_GATEWAY_URL=<fake> OPENCLAW_GATEWAY_TOKEN=<token> scripts/openclaw-ask.sh "status"` runs
- **THEN** it exits 0 and prints `RESULT: done`
- **AND** the fake gateway received the model `openclaw/task-runner`

#### Scenario: Gateway without listener

- **GIVEN** `OPENCLAW_GATEWAY_URL` points to a port with no listener
- **WHEN** `scripts/openclaw-ask.sh "status"` runs with a token set
- **THEN** it exits 3 and the output names that URL
