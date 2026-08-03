## ADDED Requirements

### Requirement: GPU-bound loadouts are mutually exclusive

The loadout runner SHALL refuse to start a GPU-bound loadout while another GPU-bound loadout is
active as a systemd user unit. A loadout counts as GPU-bound exactly when `fit.enabled` is `true`
in `scripts/llm/loadouts.json`; no separate declaration field is introduced. CPU-bound loadouts
(`fit.enabled=false`, currently `bge-embed-cpu` and `bge-rerank-cpu`) SHALL neither block a start
nor be blocked.

The refusal SHALL abort the start. The runner SHALL NOT stop the conflicting unit, because it may
be serving a request. The error SHALL name the blocking slug, its unit state, and the command to
stop it. Over HTTP the proxy SHALL answer `409` rather than `500`.

Restarting a loadout that is itself already active SHALL NOT be treated as a conflict.

#### Scenario: Second GPU loadout is refused while the first runs

- **GIVEN** `gemma9-factory` is active as unit `llama-gemma9-factory.service`
- **WHEN** a start of `gemma26-factory` is requested
- **THEN** no `systemd-run` is executed, the error names `gemma9-factory` and its stop command,
  and the HTTP response status is `409`

#### Scenario: CPU loadout does not block a GPU loadout

- **GIVEN** only `bge-embed-cpu` (`fit.enabled=false`) is active
- **WHEN** a start of `gemma26-factory` is requested
- **THEN** the start proceeds

#### Scenario: Restarting the same loadout is not a self-conflict

- **GIVEN** `gemma26-factory` is active
- **WHEN** a start of `gemma26-factory` is requested
- **THEN** the guard reports no conflict
