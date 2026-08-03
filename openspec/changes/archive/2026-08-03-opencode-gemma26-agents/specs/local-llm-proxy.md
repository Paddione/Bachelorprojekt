## ADDED Requirements

### Requirement: Agent-Modell- und Kontextangaben entsprechen dem geladenen Loadout

The system SHALL configure the opencode subagents to match the actually loaded model and
context size, so that the agent definitions do not name a model that is not loaded and do not
promise a context size larger than what is available.

#### Scenario: Agent-Definition nennt das geladene Modell

- **GIVEN** `.opencode/agent-models.jsonc` verdrahtet die Subagenten
- **WHEN** die Modell-Referenz gegen das geladene Loadout geprüft wird
- **THEN** nennt die Definition das tatsächlich geladene Modell
  (`gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf`)
- **AND** keine Referenz auf das nicht geladene 12B-Modell ist enthalten

#### Scenario: Kontextangabe entspricht dem gemessenen n_ctx

- **GIVEN** die Agent-Beschreibung nennt eine Kontextgröße
- **WHEN** sie gegen den gemessenen Wert geprüft wird
- **THEN** entspricht sie `n_ctx=99840`
- **AND** die falsche Angabe von 262144 ist entfernt

### Requirement: Gemma26-Loadout fährt drei Slots mit unified context

The system SHALL configure the `gemma26-factory` loadout with three slots and the `-kvu`
flag for a unified KV buffer shared across sequences, while keeping `max_inflight` at 1, so
that each factory slot sees the full context without increasing KV memory fourfold.

#### Scenario: Loadout hat drei Slots und -kvu

- **GIVEN** `scripts/llm/loadouts.json` definiert `gemma26-factory`
- **WHEN** die Loadout-Konfiguration geprüft wird
- **THEN** ist `args.parallel` auf 3 gesetzt
- **AND** `-kvu` ist in `extraArgs` enthalten
- **AND** `max_inflight` bleibt bei 1

#### Scenario: fit.minCtx bleibt unverändert

- **GIVEN** das Loadout nutzt einen unified KV-Puffer
- **WHEN** `fit.minCtx` geprüft wird
- **THEN** bleibt es unverändert (32768)
- **AND** die KV-Quantisierung bleibt `q4_0`
