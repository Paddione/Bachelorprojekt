## ADDED Requirements

### Requirement: Decommissioned loadouts are excluded from GGUF-resolution verification

Ein Loadout, dessen top-level `enabled` den Wert `false` trägt (T002753), ist
vom Proxy zur Laufzeit bereits über `isLoadoutEnabled()` in
`scripts/llm-proxy/loadouts.mjs:353-364` (`return loadout?.enabled !== false`)
vom Start ausgeschlossen. Die GGUF-Auflösungs-Verification
(`tests/spec/local-llm-proxy/loadout-model-files-exist.bats`, T002753) SHALL
diesen Zustand ebenfalls kennen: ein deaktiviertes Loadout, das keine
Modelldatei mehr referenziert, ist environment-bedingt tot und darf als MISSING
gemeldet werden — es wird übersprungen und erscheint nicht in der Ausgabe.

Dies ist bewusst top-level `enabled:false` und NICHT `fit.enabled:false`:
beides heiß dasselbe und steuert diametral andere Dinge. `fit.enabled` schaltet
den llama.cpp Kontext-Fit (`--fit`) ein/aus und verlangt `args.ctx` +
`args.ngl` (loadouts.mjs:168); `enabled` deaktiviert das Loadout vollständig.

#### Scenario: a disabled loadout is excluded from the guard

- **GIVEN** a loadout `enabled:false` (e.g. `gemma26-factory`) whose GGUF does
  not exist on disk
- **WHEN** the T002753 guard resolves every non-external loadout
- **THEN** the loadout is skipped and is NOT reported as MISSING (it does not
  appear in the resolution output at all)

### Requirement: only surviving active loadouts are asserted as present

Der Positiv-Anker des Guards beweist, dass überhaupt aufgelöst wird. Er SHALL
sich auf ein aktives Loadout mit vorhandener GGUF beziehen, nicht auf ein
deaktiviertes.

#### Scenario: the positive anchor is an active loadout with GGUF

- **GIVEN** the T002753 guard runs
- **WHEN** it resolves the enabled loadouts
- **THEN** it asserts `qwen38-220k OK` (the only surviving active chat loadout
  with a present GGUF), and that assertion passes

## CHANGED Requirements

### Decommissioned agent loadouts marked enabled:false

Die Loadouts `gemma26-factory`, `gemma4`, `gemma26-throughput` und
`gemma12-vision` in `scripts/llm/loadouts.json` tragen `enabled:false` mit der
Bemerkung, dass sie seit der FreeToken-Migration (T014105) durch die
FreeToken-native Engine (`freetoken-local/active`, :1919) ersetzt wurden.
`gptoss-context` ist bereits `enabled:false`. Die GGUFs wurden von der Platte
entfernt; die Messwerte in den jeweiligen `notes` bleiben unverändert als
Referenz erhalten.

### brain-ingest loadout marked enabled:false after migration

Das `brain-ingest`-Loadout (Port 8100) wird `enabled:false` markiert, JUICHT
nur nachdem `scripts/brain-ingest.sh` auf die FreeToken-native Engine
(`:1919`) migriert wurde (LM_STUDIO_URL + LM_MODEL). Die Migration ist ein
Discovery-gateder Schritt (siehe tasks.md P3); das Loadout-Deaktivierungs-
Flag wird erst im erfolgreichen Verzweigungsfall gesetzt, damit die Pipeline
nicht in einen toten Zustand gerät, bevor ein Ersatz-Backend steht.

#### Scenario: brain-ingest is excluded from the guard only after cutover

- **GIVEN** `brain-ingest.sh` points at FreeToken `:1919` and a transform run
  produces valid frontmatter
- **WHEN** the `brain-ingest` loadout is marked `enabled:false`
- **THEN** the T002753 guard no longer resolves it and it is not reported MISSING
