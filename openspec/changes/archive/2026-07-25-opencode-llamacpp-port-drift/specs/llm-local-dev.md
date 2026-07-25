## ADDED Requirements

### Requirement: Single Definition Site for the opencode `llamacpp-mtp` Provider

The opencode provider key `llamacpp-mtp` SHALL be defined in exactly one place in
the repository, namely `.opencode/agent-models.jsonc`. `.opencode/opencode.jsonc`
SHALL NOT define a provider under that key.

Rationale: `.opencode/agent-models.jsonc` is the sync source that
`scripts/opencode-sync-agents.sh` (wired as `Taskfile.yml:223`) merges into
`~/.config/opencode/opencode.jsonc`. Because opencode layers the project config on
top of the global one, a second definition in `.opencode/opencode.jsonc` silently
overrides the synced value inside this repository, and the sync pipeline cannot
correct it — it only ever writes the global file (T002159).

#### Scenario: Projekt-Config definiert den Provider nicht erneut

- **GIVEN** `.opencode/agent-models.jsonc` definiert den Provider `llamacpp-mtp`
  mit `baseURL` `http://127.0.0.1:8091/v1`
- **WHEN** `.opencode/opencode.jsonc` auf eine erneute Definition desselben
  Provider-Keys geprüft wird
- **THEN** enthält die Datei keinen `llamacpp-mtp`-Eintrag, sodass der aus
  `agent-models.jsonc` gesyncte Wert im Projekt-Kontext wirksam bleibt

#### Scenario: Kein opencode-Provider zeigt auf den Bonsai-Port

- **GIVEN** Port `8093` ist gemäß
  `.claude/skills/llama-cpp/references/bonsai-server-windows.md` fest dem
  Ternary-Bonsai-Server zugewiesen und `llama-server` validiert das `model`-Feld
  einer Anfrage nicht, antwortet also unabhängig vom angefragten Modellnamen mit
  dem geladenen Modell
- **WHEN** die JSONC-Dateien unter `.opencode/` auf `baseURL`-Werte mit Port `8093`
  geprüft werden
- **THEN** existiert kein solcher `baseURL`-Eintrag, sodass ein laufender
  Bonsai-Server keine Antworten unter dem Label eines Gemma-Modells liefern kann

### Requirement: Declared Context Window Matches the Running Gemma Server

The `limit.context` declared for the model `gemma-4-12B-it-qat-UD-Q4_K_XL.gguf` in
`.opencode/agent-models.jsonc` SHALL match the context window the llama.cpp server
actually exposes, as reported by `GET /props` → `default_generation_settings.n_ctx`.

Rationale: the previous value of `4096` derived from a retired `-np 4` slot layout
(16384 total context divided across four slots). The current start script
`start-gemma4-12b-mtp.ps1` sets no `-np`, so a single slot owns the full `-c 16384`
context; declaring `4096` made opencode discard three quarters of the available
window (T002159).

#### Scenario: Deklariertes Kontextfenster entspricht dem Server-Wert

- **GIVEN** das Startskript startet `llama-server` mit `-c 16384` und ohne `-np`
- **WHEN** `.opencode/agent-models.jsonc` auf den `limit.context`-Wert des
  Gemma-Modelleintrags geprüft wird
- **THEN** ist der Wert `16384` und stimmt damit mit dem vom Server unter
  `/props` gemeldeten `n_ctx` überein
