# Proposal: gpu-loadout-exclusivity

## Why

`startUnit()` in `scripts/llm-proxy/runner.mjs` startet ein Loadout bedingungslos. Auf der
RTX 5070 Ti (16 GB, geteilt mit dem Windows-Desktop) passen die GPU-gebundenen Loadouts nicht
nebeneinander: `gemma26-factory` wiegt allein 14,25 GB an Gewichten, `gemma9-factory` 5,76 GB.

Der Schaden ist deshalb schwer zu erkennen, weil llama.cpp beim zweiten Start **keinen**
VRAM-Fehler meldet. `--fit` lagert stattdessen still Layer ins RAM aus: beide Server laufen,
beide antworten, beide sind zäh — und keine Meldung nennt die Ursache. Die Messreihe aus T002534
beziffert den Preis: bereits 6 von 30 ausgelagerten Layern kosten Faktor 7 beim Decoding
(166 → 21,5 tok/s).

Die bestehenden Margen schützen davor nicht. `gemma26-factory` fährt `targetMarginMib` 256
(gemessenes Optimum im Alleinbetrieb, T002534), `gemma9-factory` 8192 (Platz für ein paralleles
Finetuning, T002608). `targetMarginMib` regelt aber nur, wieviel **ein** Prozess freilässt — es
hindert einen zweiten nicht am Start. Die Margen anzugleichen wäre kein Schutz, sondern die
faktische Stilllegung des größeren Loadouts.

## What

Ein Guard in `startUnit()`, der den Start verweigert, solange ein anderes GPU-gebundenes Loadout
als systemd-User-Unit aktiv ist.

- **Umfang:** alle Loadouts mit `fit.enabled === true` schließen einander aus — `gptoss-context`,
  `devstral-quality`, `gemma-factory`, `gemma-multiagent`, `gemma26-factory`, `gemma9-factory`.
  Ausgenommen bleiben `bge-embed-cpu` und `bge-rerank-cpu` (`fit.enabled=false`, CPU-gebunden).
  Das Prädikat wird aus `fit.enabled` abgeleitet; ein zusätzliches JSON-Feld wäre eine zweite,
  handgepflegte Wahrheit über dieselbe Eigenschaft.
- **Verhalten bei Konflikt:** Abbruch. Es wird **nichts** automatisch gestoppt — ein laufender
  Server könnte gerade eine Factory-Anfrage bedienen. Die Meldung nennt den blockierenden Slug,
  dessen Zustand und den nötigen `stop`-Befehl.
- **Ort:** in `startUnit()`, nicht im Aufrufer. Heute gibt es genau einen (`server.mjs:264`);
  ein Guard dort schützt genau diesen einen. `server.mjs` fängt den spezifischen Fehlertyp und
  mappt ihn auf HTTP 409 statt 500.

Mitgeliefert wird der fehlende `## Purpose` des SSOT-Specs `local-llm-proxy` — er trägt dort die
Notiz „beim nächsten inhaltlichen Delta ergänzen", und dies ist dieses Delta.

### Bekannte Grenzen

Beide sind bewusst in Kauf genommen, nicht übersehen:

1. **Nur systemd-User-Units sind sichtbar.** Ein von Hand gestarteter `llama-server` oder der
   Windows-Pfad `scripts/llm/start-gemma-server.ps1` (seit T002459 entwidmet, nur noch
   Break-Glass) bleibt für den Guard unsichtbar.
2. **Kein Lock.** Zwischen Prüfung und `systemd-run` liegt ein Zeitfenster; zwei exakt
   gleichzeitige Starts können beide durchrutschen. Für einen manuell bedienten
   Einzelplatz-GPU-Host wäre ein Lock mehr Maschinerie als Problem.

_Ticket: T002616_
