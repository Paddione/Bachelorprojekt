# Local LLM Proxy Capability Delta (mishap-t002408)

## ADDED Requirements

### Requirement: KV Cache Budget Calculator
The platform SHALL include a parameterizable KV cache RAM/VRAM budget calculation utility (`scripts/llm/kv-budget.sh`).

#### Scenario: Running KV budget calculator
- GIVEN the `scripts/llm/kv-budget.sh` script is executed
- WHEN passed model context and slot flags
- THEN it outputs expected memory footprints for `-kvu` and `-no-kvu` configurations.
