## ADDED Requirements

### Requirement: Gemma server supports host-RAM KV cache

The Gemma start script SHALL provide an opt-in switch that moves the KV cache from VRAM into
host RAM by passing llama.cpp's `-nkvo` flag, and its VRAM estimate SHALL account for the mode.

#### Scenario: KV offload enabled

- **GIVEN** the Gemma start script is invoked with the KV-offload switch
- **WHEN** it assembles the llama-server argument list
- **THEN** the list contains `-nkvo`
- **AND** the printed VRAM requirement excludes the per-context-token KV term
- **AND** the script reports the corresponding host-RAM requirement instead

#### Scenario: KV offload not requested

- **GIVEN** the Gemma start script is invoked without the KV-offload switch
- **WHEN** it assembles the llama-server argument list
- **THEN** the list contains no `-nkvo` flag
- **AND** the VRAM estimate keeps the per-context-token KV term

### Requirement: Gemma server supports persistent slot caches

The Gemma start script SHALL provide an opt-in path parameter that enables llama.cpp's slot
save/restore endpoints, so a prefilled guardrail prefix survives across factory runs.

#### Scenario: Slot save path configured

- **GIVEN** the Gemma start script is invoked with a slot-save path
- **WHEN** it assembles the llama-server argument list
- **THEN** the directory is created if it does not exist
- **AND** the list contains `--slot-save-path` followed by that directory

#### Scenario: Slot save path omitted

- **GIVEN** the Gemma start script is invoked without a slot-save path
- **WHEN** it assembles the llama-server argument list
- **THEN** the list contains no `--slot-save-path` flag

### Requirement: Gemma start script stays ASCII and CRLF safe

Every PowerShell script under the LLM script directory SHALL remain pure ASCII without a byte
order mark, because Windows PowerShell 5.1 decodes BOM-less UTF-8 as CP1252.

#### Scenario: Script encoding guard

- **GIVEN** the Gemma start script in the repository
- **WHEN** its bytes are inspected
- **THEN** no byte outside the ASCII range is present
- **AND** no UTF-8 byte order mark precedes the first line
