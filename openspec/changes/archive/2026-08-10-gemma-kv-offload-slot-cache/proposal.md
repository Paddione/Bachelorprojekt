# Proposal: gemma-kv-offload-slot-cache

## Why

Der Gemma-4-12B-Server auf :8091 haelt seinen KV-Cache heute vollstaendig im VRAM und verwirft
den geprefillten Guardrail-Praefix bei jedem Neustart. Der eingesetzte llama.cpp-Fork-Build
(`llama-bonsai-cuda13.3`) beherrscht beides bereits — belegt aus `llama-server.exe --help`:
`-kvo, --kv-offload, -nkvo, --no-kv-offload` und `--slot-save-path PATH`. Genutzt wird davon
im Startskript nichts.

Der Hebel ist zweifach: KV im CPU-RAM gibt VRAM fuer Sockel und mmproj-Tower frei, und ein
persistenter Slot-Cache erspart der Factory das wiederholte Prefillen desselben fixen
Guardrail-Blocks. Das ist der erste Implementierungs-Baustein des Epics T002370; die Kopplung
an `pipeline_slot` bleibt einem anderen Kind-Ticket vorbehalten.

## What

`scripts/llm/start-gemma-server.ps1` bekommt zwei unabhaengige, per Default abgeschaltete
Schalter:

- `-KvOffload` haengt `-nkvo` an die Parameterliste und nimmt den KV-Anteil aus der
  VRAM-Bedarfsrechnung heraus, damit das Skript im KV-Offload-Modus nicht vor einem
  VRAM-Mangel warnt, den es gerade beseitigt.
- `-SlotSavePath <dir>` legt das Verzeichnis an und aktiviert `--slot-save-path`, wodurch der
  Server `POST /slots/{id}?action=save|restore` bedient. Das Speichern selbst bleibt Sache des
  Aufrufers; das Skript bekommt keinen REST-Client.

Vorgeschaltet ist eine Kapabilitaets-Probe am Live-Host: Gemma 4 nutzt Sliding-Window-Attention,
und ob dieser Build Slot-State-Serialisierung mit SWA ohne den ebenfalls vorhandenen Schalter
`--swa-full` beherrscht, laesst sich weder aus dem Hilfetext noch aus dem Binary ableiten. Das
Ergebnis der Probe entscheidet, ob ein gekoppelter `-SwaFull`-Schalter mitkommt.

Ohne die neuen Schalter bleibt `$Params` unveraendert — das ist die Regressionsbedingung, unter
der die bestehenden Guards in `tests/spec/llm-pipeline.bats` und das Loadout `gemma-factory` in
`scripts/llm/loadouts.json` unberuehrt bleiben.

Entwurfsentscheidungen und Trade-offs: `design.md` in diesem Change-Ordner.

_Ticket: T002482_
