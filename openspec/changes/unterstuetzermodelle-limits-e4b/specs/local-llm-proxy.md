## MODIFIED Requirements

### Requirement: Support model slots for the laptop devices are registered in the lmstudio provider block

The system SHALL register the two laptop support models as model entries in the existing
`lmstudio` provider block of `.opencode/agent-models.jsonc`, following the `name@quant`
pattern of the existing entries: `gemma-4-e4b@ud-q4_k_xl` (served by PK-Tablet) and
`qwen3.5-4b@q6_k` (served by PK-L-1). The entries SHALL carry no baseURL of their own and
SHALL introduce no backend-port literal (`:1234`, `:8093`) into the tracked surfaces; the
entries SHALL carry the measured limits (`limit.context` 32768, `limit.output` 4096) with a
comment recording the measurement run, values and date (K3 measurement from T006842/T007033).

#### Scenario: Both support model slots are declared in the lmstudio block with measured limits

- **GIVEN** the T007033 change on the branch
- **WHEN** `.opencode/agent-models.jsonc` is inspected for the `lmstudio` provider
- **THEN** entries `gemma-4-e4b@ud-q4_k_xl` and `qwen3.5-4b@q6_k` exist with
  `limit.context` 32768 and `limit.output` 4096
- **AND** neither entry carries a backend-port literal
- **AND** both entries carry a comment naming the measurement run and date

#### Scenario: Tablet slot no longer references the 12B model

- **GIVEN** the T007033 change on the branch
- **WHEN** the `lmstudio` provider block is inspected
- **THEN** no entry named `gemma-4-12b@ud-iq3_xxs` exists
