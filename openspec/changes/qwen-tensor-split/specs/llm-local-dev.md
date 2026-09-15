## MODIFIED Requirements

### Requirement: Start scripts leave -ngl to -fit

A start script under `scripts/llm/start-*.ps1` that launches `llama-server` with
`-fit on` SHALL NOT pass `-ngl` in its unconditional argument list. llama.cpp
aborts the layer placement step of parameter fitting as soon as `n_gpu_layers`
is set by the user; the context is still reduced towards the `-fitt` margins,
but the layers are spread in proportion to free VRAM instead of being placed
against the margins. The script MAY pass `-ngl` on a path that disables fitting
(`-fit off` with a fixed `-c`).

A start script MAY pass an explicit `-ts` split together with `-fit on` when the
split is measured and documented. `-ts` aborts layer placement the same way,
which makes the placement deterministic, while context fitting against `-fitt`
continues. The Qwen 27B dual-GPU loadout SHALL use `-ts 85,15` in both
`scripts/llm/start-qwen-server.ps1` and the `qwen38-220k` loadout.

Rationale: measured 2026-09-15 on the Qwen 27B dual-GPU loadout. With
`-ngl 999 -fit on -fitt 256,1500` the display GPU kept about 250 MiB free.
Without `-ngl` it kept 1752 MiB at 205,056 context and decoded at 31 tok/s,
leaving 2782 MiB unused on the RTX 5070 Ti. With `-ts 85,15` it kept 2628 MiB
at the same context and decoded at 38 tok/s.

#### Scenario: Measured split favours the faster GPU

- **GIVEN** `start-qwen-server.ps1` runs without `-Ctx` and without `-SingleGpu`
- **WHEN** `llama-server` loads the model
- **THEN** the argument list contains `-ts 85,15` and the secondary GPU keeps at least its configured margin free

#### Scenario: Script and loadout agree on the split

- **GIVEN** the `qwen38-220k` loadout in `scripts/llm/loadouts.json`
- **WHEN** `tests/spec/llm-local-dev/qwen-tensor-split.bats` runs
- **THEN** its `-ts` value equals the `-TensorSplit` default of `start-qwen-server.ps1`

#### Scenario: Fixed context keeps full offload

- **GIVEN** `start-qwen-server.ps1` runs with `-Ctx 65536`
- **WHEN** the argument list is built
- **THEN** it contains `-c 65536 -fit off -ngl 999`

#### Scenario: Guard covers start scripts added later

- **GIVEN** a `scripts/llm/start-*.ps1` passes `-fit on` and lists `-ngl` in its unconditional `$Params` block
- **WHEN** `tests/spec/llm-local-dev/fit-ngl-conflict.bats` runs
- **THEN** the guard fails and names the offending file
