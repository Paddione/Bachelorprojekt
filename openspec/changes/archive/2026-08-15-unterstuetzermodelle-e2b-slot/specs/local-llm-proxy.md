## MODIFIED Requirements

### Requirement: Support model slots for the laptop devices are registered in the lmstudio provider block

The system SHALL register the two laptop support models as model entries in the existing
`lmstudio` provider block of `.opencode/agent-models.jsonc`, following the `name@quant`
pattern of the existing entries: `gemma-4-e2b@ud-q4_k_xl` (served by PK-Tablet) and
`qwen3.5-4b@q6_k` (served by PK-L-1). The entries SHALL carry no baseURL of their own and
SHALL introduce no backend-port literal (`:1234`, `:8093`) into the tracked surfaces; the
entries SHALL carry limits matching the device hardware (`limit.context` 16384 on the
8-GB-tablet, `limit.output` 4096) with a comment recording the measurement run, values and
date where a measurement exists (K3 measurement from T006842/T007033 for the qwen slot).

#### Scenario: Both support model slots are declared in the lmstudio block with device limits

- **GIVEN** the T007055 change on the branch
- **WHEN** `.opencode/agent-models.jsonc` is inspected for the `lmstudio` provider
- **THEN** entries `gemma-4-e2b@ud-q4_k_xl` and `qwen3.5-4b@q6_k` exist with
  `limit.context` 16384 respectively 32768 and `limit.output` 4096
- **AND** neither entry carries a backend-port literal
- **AND** the entries carry a comment naming the measurement run and date where measured

#### Scenario: Support models are discoverable through the llm-proxy

- **GIVEN** the llm-proxy is running and LM Studio on the laptop devices has the support
  models loaded
- **WHEN** the guard queries `:18235/v1/models`
- **THEN** both support model ids are listed; when the devices or the proxy are offline,
  the guard skips instead of failing

#### Scenario: Context limits reflect measured values after the Vulkan measurement

- **GIVEN** the Vulkan measurement task has been executed and its result recorded as a
  ticket comment with the executable command
- **WHEN** the measured values are available
- **THEN** the entry's `limit` values are updated to the measured sizes and the entry
  carries a GEMESSEN note naming the measurement run
