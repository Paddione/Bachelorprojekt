## ADDED Requirements

### Requirement: Start scripts leave -ngl to -fit

A start script under `scripts/llm/start-*.ps1` that launches `llama-server` with
`-fit on` SHALL NOT pass `-ngl` in its unconditional argument list. llama.cpp
aborts parameter fitting as soon as `n_gpu_layers` is set by the user, which
silently discards every `-fitt` per-device margin. The script MAY pass `-ngl`
on a path that disables fitting (`-fit off` with a fixed `-c`).

Rationale: measured 2026-09-15 on the Qwen 27B dual-GPU loadout. With
`-ngl 999 -fit on -fitt 256,1500` the display GPU kept about 250 MiB free.
Without `-ngl` it kept 1752 MiB at 205,056 context.

#### Scenario: Fitting honours the per-device margin

- **GIVEN** `start-qwen-server.ps1` runs without `-Ctx`
- **WHEN** `llama-server` loads the model
- **THEN** the log contains no `common_fit_params: failed to fit params` warning
  and the secondary GPU keeps at least its configured margin free

#### Scenario: Fixed context keeps full offload

- **GIVEN** `start-qwen-server.ps1` runs with `-Ctx 65536`
- **WHEN** the argument list is built
- **THEN** it contains `-c 65536 -fit off -ngl 999`

#### Scenario: Guard covers start scripts added later

- **GIVEN** a `scripts/llm/start-*.ps1` passes `-fit on` and lists `-ngl` in its unconditional `$Params` block
- **WHEN** `tests/spec/llm-local-dev/fit-ngl-conflict.bats` runs
- **THEN** the guard fails and names the offending file
