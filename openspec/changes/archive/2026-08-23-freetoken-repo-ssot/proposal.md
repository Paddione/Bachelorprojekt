# Proposal: freetoken-repo-ssot

## Why

Die FreeToken-Migration (T014028) und die Modellkalibrierung vom 2026-08-23 leben
ausschließlich in der Global-Config (`~/.config/opencode/opencode.jsonc`). Das
Repo-SSOT `.opencode/agent-models.jsonc` kennt den Provider `freetoken-local`
nicht — die lokalen Agenten zeigen dort noch auf `llamacpp-local/qwen38-220k`.
`scripts/opencode-sync-agents.sh` ersetzt den kompletten `agent`-Block der
Global-Config durch den Repo-Stand; der nächste Sync-Aufruf rollt damit die
Migration still zurück.

## What

- Provider `freetoken-local` (drei gemessene Checkpoints + modellagnostischer
  Alias `active`) in `.opencode/agent-models.jsonc` portieren; alle lokalen
  Familien- und Primär-Agenten auf `freetoken-local/active` umhängen.
- Plugin `.opencode/plugin/freetoken-active.ts` ins Repo aufnehmen;
  `scripts/opencode-sync-agents.sh` verteilt künftig auch Plugins in die
  Global-Config (analog zum bestehenden Prompt-Kopiervorgang).
- Spiegelung in `docs/agent-guide/registry/agents.yaml` und der AGENTS.md-Routing-
  Tabelle nachziehen (sonst schlägt `tests/spec/agent-roster.bats` P4.3 zu).
- Guard: fünf neue BATS-Tests in `tests/spec/llm-local-dev.bats`, die Provider,
  gemessene Limits, Alias-Verdrahtung, Plugin und Sync-Verteilung zusichern.

Messbasis (pk-desktop, RTX 5070 Ti, FreeToken 0.1.1+g30aa89115, 2026-08-23):
Qwen3.6-35B-A3B-NVFP4 131072 ctx nutzbar (~104 tok/s kurz, 62–70 @ 63k),
gpt-oss-20b 65536 ctx (~112 tok/s), Gemma-4-26B-A4B-NVFP4 32768 ctx (~73 tok/s);
alle text-only. FreeToken ignoriert das `model`-Feld von Anfragen — deshalb
trifft der Alias immer das residente Modell.

_Ticket: T014105_
