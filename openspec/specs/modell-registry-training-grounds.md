# modell-registry-training-grounds

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu modell-registry-training-grounds ergänzen._

## Requirements

### Requirement: Model Registry tracks adapters across suitability, stats, provenance, and deployment

The system SHALL provide a database schema and CLI interface (`scripts/finetune/model-registry.sh`) to register, evaluate, measure, and query trained LoRA adapters with their suitability scores, hardware stats, provenance metadata, and deployment loadout parameters.

#### Scenario: Registering a model adapter

- **GIVEN** a trained LoRA adapter with base model and quantization
- **WHEN** `model-registry.sh register <name> <base_model> [--quant <quant>]` is invoked
- **THEN** an entry is created in `model_registry.adapters` and provenance records can be attached

#### Scenario: Running role-based evaluations

- **GIVEN** an existing adapter in the registry and a role testset
- **WHEN** `model-registry.sh eval <adapter> <role>` is executed
- **THEN** the adapter is evaluated against the role benchmark and accuracy scores are recorded in `model_registry.suitability`

#### Scenario: Collecting hardware statistics

- **GIVEN** an active model endpoint
- **WHEN** `model-registry.sh stats <adapter>` is run
- **THEN** VRAM usage and token throughput are measured and recorded in `model_registry.stats`

#### Scenario: Exporting loadouts

- **GIVEN** an adapter registered with deployment metadata
- **WHEN** `model-registry.sh export-loadout <adapter>` is invoked
- **THEN** a valid JSON block ready for `loadouts.json` is generated

<!-- merged from change delta modell-registry-training-grounds.md (9c42369cc53f) -->