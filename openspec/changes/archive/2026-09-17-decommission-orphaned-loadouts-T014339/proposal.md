# Proposal: decommission-orphaned-loadouts-T014339

## Why

Seit der FreeToken-Migration (T014105) laufen alle lokalen LLM-Agents auf die
FreeToken-native Engine (`freetoken-local/active`, :1919) statt auf einzelne
llama.cpp-Loadouts. Die GGUFs der alten Agent-Loadouts (`gemma26-factory`,
`gemma4`, `gemma26-throughput`, `gemma12-vision`, `gptoss-context`) wurden von
der Platte entfernt; nur drei blieben uebrig (`qwen38-220k`, `bge-embed`,
`bge-rerank`). Der T002753-Guard `loadout-model-files-exist.bats` kennt jedoch
kein top-level `enabled:false` — er prueft alle nicht-`external`-Loadouts und
meldet deaktivierte sowie orphane als MISSING. Ergebnis: dauerhaft rot, ohne
dass ein fehlendes Gewicht einen Laufblocker darstellt. `gptoss-context` ist
bereits `enabled:false`, aber der Guard ueberspringt es nicht — deshalb
schlägt auch der Positiv-Anker `gptoss-context OK` fehl.

## What

1. **loadouts.json**: orphane Agent-Loadouts (`gemma26-factory`, `gemma4`,
   `gemma26-throughput`, `gemma12-vision`) `enabled:false` markieren mit
   Migrations-Notiz (FreeToken T014105). `gptoss-context` bereits disabled.
2. **Guard** (`loadout-model-files-exist.bats`): ueberspringt `enabled:false`
   Loadouts in `_resolve_all` (unterschied zu `fit.enabled` = llama.cpp --fit);
   Positiv-Anker von `gptoss-context OK` auf `qwen38-220k OK` umstellen
   (letzteres ist aktiv und GGUF vorhanden).
3. **brain-ingest (P3, discovery-gated)**: Port-8100-Loadout ist kein orphanes
   Agent-Loadout, sondern ein aktives, aber seit T014105 GGUF-loses
   Pipeline-Frontend (`brain-ingest.sh` + `brain-ingest-swap.sh`). Es auf
   FreeToken `:1919` migrieren (`LM_STUDIO_URL` + `LM_MODEL`); danach Loadout
   `enabled:false`. Falls FreeToken kein geeignetes Text-Checkpoint ausliefert,
   ist der Rueckweg die Wiederherstellung der 12B-GGUF (Folgeticket).

_Ticket: T004339_
