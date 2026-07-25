# Agent Configuration Standard

Standardized schema and field semantics for defining subagent configurations across local LLMs and agent tooling.

## Field Semantics

- **name**: Unique string identifier for the subagent (e.g. `bonsai-8b-1`).
- **model**: Target LLM model name (e.g. `Ternary-Bonsai-8B`).
- **effort**: Execution effort level (`low`, `medium`, `high`).
- **context_length**: Maximum supported token context length.
- **port**: Local model endpoint port.
- **write_capable**: Boolean flag indicating if the agent has file write and command execution privileges.

## Dispatch & Parallelism Rules

- Read-only agents dispatch via `delegate(prompt, agent)`.
- Write-capable agents dispatch via `task` runner.
- Maximum inflight execution cap strictly enforced per agent pool.
