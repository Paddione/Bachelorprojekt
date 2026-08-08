# local-llm-proxy — Delta (T002753)

## ADDED Requirements

### Requirement: Loadout weights must resolve

Every loadout in `scripts/llm/loadouts.json` that carries model weights SHALL resolve its
`model` field to an existing file under one of the configured `modelRoots`. Loadouts marked
`managed: "external"` are exempt, because their `model` field names an identifier handled by
a foreign process rather than a path.

#### Scenario: A loadout points at a missing model file

- **GIVEN** a loadout whose `model` field resolves to no file under any `modelRoots` entry
- **WHEN** the loadout guard runs
- **THEN** the guard fails and names the offending loadout slug

#### Scenario: The resolution itself is exercised, not the JSON text

- **GIVEN** the guard is asked to prove a loadout's weights exist
- **WHEN** it evaluates the loadout
- **THEN** it calls `resolveModelPath()` from `scripts/llm-proxy/models.mjs` and judges its
  return value, rather than matching model paths in the JSON source

#### Scenario: An externally managed loadout is not treated as broken

- **GIVEN** a loadout with `managed: "external"` whose `model` field is an identifier
- **WHEN** the guard runs
- **THEN** the loadout is skipped and does not fail the guard

## MODIFIED Requirements

### Requirement: Chat template provenance for Gemma 4 loadouts

A Gemma 4 loadout used for multi-turn tool calling SHALL load its chat template from a file
under `scripts/llm/templates/` via `--chat-template-file`, and SHALL NOT rely on the template
embedded in the GGUF. The embedded template re-injects each assistant turn's
`reasoning_content` after the last user message into the following prompt, which drives
agentic tool chains into verbatim repetition; a re-download silently restores it.

#### Scenario: History reasoning is not replayed into a later prompt

- **GIVEN** a multi-turn conversation whose earlier assistant tool-call step carried a
  `reasoning_content`
- **WHEN** the prompt for the next agentic step is rendered
- **THEN** that earlier reasoning text does not appear in the rendered prompt

#### Scenario: The check can actually fail

- **GIVEN** the unpatched upstream template
- **WHEN** the same conversation is rendered against it
- **THEN** the check reports the re-injection and fails, proving the passing case is not vacuous

## REMOVED Requirements

### Requirement: gemma9-factory context extension

**Reason:** The loadout is removed. Its weights are absent from the host, no consumer
dispatches to it since 2026-08-03, and its `--override-kv gemma2.context_length=int:98304`
stretched the context to twelve times the trained range — `unsloth/gemma-2-9b-it/config.json`
reports `max_position_embeddings: 8192` with `rope_theta: 10000.0` unscaled. The number
appeared in the log; the capability did not exist.
