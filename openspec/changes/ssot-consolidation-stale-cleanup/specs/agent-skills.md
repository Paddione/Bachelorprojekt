## ADDED Requirements

### Requirement: Agent Model Routing and FreeToken Removal

All agent routing MUST target active model backends (`llamacpp-local/qwen38-220k`, `alibaba-intl/qwen3.8-max`, `deepseek-*`) and MUST NOT reference `freetoken-*` endpoints.

#### Scenario: Subagent model routing without FreeToken
- **GIVEN** an agent request dispatched to local subagents (`gptoss`, `devstral`, `gemma`, `gemma12`, `qwen38`, `reviewer`)
- **WHEN** model resolution occurs
- **THEN** the model resolves to `llamacpp-local/qwen38-220k`
- **AND** no `freetoken-local` configuration is loaded.
