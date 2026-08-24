# Proposal: freetoken-agent-roster-cleanup

## Why

Seit T014028/T014105 läuft der lokale Stack auf FreeToken-native (:1919, Windows);
der llama.cpp/llm-proxy-Stack (:18235) ist stillgelegt — alle GPU-Chat-Loadouts
in `scripts/llm/loadouts.json` sind `enabled: false`, der Proxy antwortet nicht.
Die opencode-Konfiguration behauptet davon unberührt weiterhin:

1. **Katalog-Leichen:** `llamacpp-local` deklariert `gptoss-context`,
   `gemma26-factory`, `gemma4` und `gemma26-throughput` — deren GGUF-Verzeichnisse
   (`gptoss20/`, `gemma4-26A4-it/`, `gemma4-26A4-qat/`) sind von der Platte weg.
   Jeder Eintrag verspricht Kontextgrenzen für Modelle, die es nicht mehr gibt.
2. **Roster-Lügen:** Sieben Tab-Primaries (`gemma26-primary`, `gemma26-vision`,
   `gptoss-primary`, `devstral-primary`, `gemma12-primary`,
   `gemma26-throughput-primary`, `qwen38-primary`) sind seit der Alias-Migration
   byte-identische Klone von `freetoken-primary` — gleicher Prompt, gleiche
   Permissions, nur Name/Farbe differieren. Ihre Namen referenzieren Loadouts,
   die nicht mehr existieren (derselbe Lügen-Muster wie vor T003204, nur ohne
   dessen Rechtfertigung: Primaries sind keine Dispatch-Handles).
3. **Toter Default:** `.opencode/opencode.jsonc` startet jede Projekt-Session mit
   `model: llamacpp-local/qwen38-220k` — ein deaktivierter Loadout auf einem
   toten Proxy. Die Global-Config trägt bereits keinen Default mehr.
4. **Nicht-viable Checkpoints:** `Qwen3.6-27B-NVFP4` (19 GB unter
   `C:\Users\PatrickKorczewski\models`) ist laut eigener Model-Matrix NOT VIABLE
   (dense, forced fused > VRAM). Operator-Entscheidung 2026-08-24: löschen statt
   deklarieren. Daraus abgeleitetes Constraint für das Backend-Note-down: dense
   Modelle passen grundsätzlich nicht ins VRAM-Budget — nur die drei MoE-FTW-
   Checkpoints sind viable.

## What

- **Katalog:** Entferne `gptoss-context`, `gemma26-factory`, `gemma4`,
  `gemma26-throughput` aus `llamacpp-local.models`. Die drei weiterhin auf Disk
  liegenden GGUFs (`hauhau-qwen36`, `gemma12-vision`, `qwen38-220k`) bleiben als
  Rückfallebene deklariert (AGENTS.md verspricht die Fallback-Ebene weiterhin;
  ihre Loadouts bleiben deaktiviert).
- **Roster:** Entferne die sieben Klon-Primaries; `freetoken-primary` bleibt als
  einziger lokaler Primary. Subagenten (`gptoss`, `devstral`, `gemma`, `gemma12`,
  `qwen38`) und alle Cloud-Rails bleiben unverändert — sie sind Dispatch-Handles
  in den Permission-Listen des Orchestrators/big-pickle.
- **Default:** `.opencode/opencode.jsonc` → `model: freetoken-local/active`
  samt Neufassung des veralteten exclusiveGroup-Kommentarblocks. Die Pin-Tests
  (`qwen38-default-backend.bats`, `sdlc-isolation/sdlc-default-loadout.bats`)
  werden auf die neue Realität umgeschrieben bzw. geprüft, ob ihr Gegenstand
  (SDLC_LLM_LOADOUT) obsolet ist.
- **Qwen3.6-27B-NVFP4:** Lösche das Checkpoint-Verzeichnis (19 GB) und streiche
  das Modell aus der Description-Zeile von `freetoken-setup/SKILL.md`; die
  NOT-VIABLE-Sektion der Model-Matrix bleibt als dokumentierte Begründung stehen.
- **Note-down:** AGENTS.md-Agententabelle und die betroffenen Kommentarblöcke
  beschreiben den Backend-Stand (FreeToken-native, drei MoE-Checkpoints,
  Dense-fits-not-Constraint) statt der llama.cpp-Ära-Prosa.
- **Spec-Delta:** MODIFIED „Model-Agnostic Active Alias" (acht lokale Primaries
  → einer) plus NEW „Project Default Model Targets the FreeToken Alias" auf
  `openspec/specs/llm-local-dev.md`.
- **Gates im Zug:** `tests/spec/llm-local-dev.bats` (Acht-Locals-Assert auf einen
  Local schrumpfen; gptoss-context-awk auf einen verbleibenden Katalogeintrag
  umzielen), `docs/agent-guide/registry/agents.yaml` (sieben Runtime-Einträge
  entfernen; P4.3/P4.3b), `agents-map.md` regenerieren (P4.5),
  `scripts/opencode-sync-agents.sh` ausführen.

_Verworfen_: Qwen3.6-27B-NVFP4 deklarieren (dense, nicht viable — Operator);
gesamten `llamacpp-local`-Provider entfernen (drei Checkpoints noch auf Disk,
Fallback-Versprechen, zwei weitere Guards ohne Auftrag brechen); Klon-Primaries
als Aliase behalten (Namen lügen, Referenzen tot).

_Ticket: T016419_
