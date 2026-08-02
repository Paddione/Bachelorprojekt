## ADDED Requirements

### Requirement: Start scripts free their listen port before launching

Every start script under `scripts/llm/start-*.ps1` SHALL terminate any process
already listening on its target port before launching a new `llama-server`
instance. Without this, the new process fails silently at bind while the old one
keeps holding its model in VRAM — measured at roughly 1.8 GB per invocation on a
16 GB card shared by three models, accumulating with every further run.

The port SHALL be exposed as an `[int]$Port` script parameter defaulting to the
service's established port, so the cleanup block and the `--port` argument refer
to a single value rather than a repeated literal.

#### Scenario: Restarting a running server leaves exactly one process
- **GIVEN** a `llama-server` is listening on the script's port
- **WHEN** the start script is invoked again
- **THEN** the previously listening process is terminated, exactly one
  `llama-server` remains on that port, and it answers functional requests — not
  merely `/health`

#### Scenario: Starting on a free port needs no special case
- **GIVEN** no process is listening on the script's port
- **WHEN** the start script is invoked
- **THEN** the cleanup block matches nothing and the server starts normally

#### Scenario: Guard covers start scripts added later
- **GIVEN** a new `scripts/llm/start-*.ps1` is added without a port cleanup block
- **WHEN** the BATS suite `tests/spec/llm-pipeline.bats` runs
- **THEN** the directory-wide guard fails and names the offending file
