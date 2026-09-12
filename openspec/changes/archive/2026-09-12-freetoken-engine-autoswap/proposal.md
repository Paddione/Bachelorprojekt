# Proposal: freetoken-engine-autoswap

## Why

Beim Wechsel auf ein freetoken-local-Modell im Model-Picker bleibt die residente FreeToken-Engine auf dem alten Engine-Modell stehen: Der Client spricht den neuen Alias an, aber die Engine serviert weiter das vorherige Modell — Kontext-Limit, Thinking-Verhalten und Modell-Identität passen nicht zum gewählten Alias. Umgekehrt läuft die Engine weiter, wenn der User auf ein Nicht-FreeToken-Modell wechselt, und blockiert VRAM. Ein Engine-Wechsel ist heute nur manuell über `/engine/switch` möglich.

## What

Der Plugin-`event`-Hook erkennt `session.next.model.switched` und führt die passende Engine-Aktion aus:

- **freetoken-local-Modell, anderes Engine-Modell** → `POST /engine/switch {model, port, args, force: true}` (bzw. `/engine/start` falls gestoppt), danach `contextLimit` aktualisieren.
- **gleiches Engine-Modell** (z.B. `active` → `active-thinking`) → nur `contextLimit` + Name aktualisieren, kein Engine-Call.
- **Nicht-FreeToken-Modell** → `POST /engine/stop` (VRAM-Freigabe).
- **Switch-Fehler** → notify + alte Engine weiterlaufen lassen (degraded, kein Blocking; Client ist bereits umgeschaltet).

Zusätzlich: Fetch-Wrapper-Safety-Net (Engine-Modell vs. erwartet, synchroner Swap bei Mismatch) und Repo-SSOT-Sync der Plugin-Datei (system-merge Fix in die stale Repo-Kopie übernehmen).

_Ticket: T900155_
