# Proposal: feat-gpu-loadout-consolidation-T003204

## Why

Auf einer RTX 5070 Ti mit 16 GB liegen alle Chat-Loadouts in `exclusiveGroup "chat-gpu"` — es
läuft strukturell immer nur eines. Damit ist „ist dieses Loadout noch nützlich?" keine
Geschmacksfrage, sondern eine **Dominanzprüfung**: ein Loadout, das in keiner Dimension führt,
kostet nicht Speicher, sondern **Umschaltzeit und Auswahlfehler**. Es steht in Listen, wird
versehentlich geroutet, und jeder Wechsel dorthin entlädt das bessere Modell.

| Loadout | Kontext | tok/s | führt in |
|---|---|---|---|
| `gemma12-vision` | 262.144 | 137–149 | Kontext + Vision |
| `gemma4` / `gemma26-factory` | 177.920 | 126–128 | — |
| `gemma26-throughput` | 118.016 | 159–169 | Durchsatz (verbleibend) |
| `gptoss-context` | 131.072 | 198–215 | wird abgeschaltet (Operator-Entscheidung) |
| `devstral-quality` | 33.536 | 59 | **nichts** |
| `qwen3-coder-30b` | 96.000 | 47,9 (unter Konkurrenz) | ungemessen |

Die ursprünglich geplante Messreihe **entfällt** auf Operator-Entscheidung. Das ist begründbar
und nicht bloß abkürzend: eine Ordnungsaussage über alle Dimensionen ist vollständig, eine neue
Messung könnte sie nur bestätigen. Für `devstral-quality` liegt genau das vor.

### qwen3-coder-30b: geprüft, nicht besser

|  | `gptoss-context` | `qwen3-coder-30b` |
|---|---|---|
| Parameter | 20B | 30B |
| Quantisierung | **MXFP4-nativ** | **UD-IQ3_XXS** |
| Datei | 11,5–12,1 GB | 11,9 GB |
| Kontext | 131.072 | 96.000 |
| gemessen | 198–215 tok/s | 47,9 tok/s (Untergrenze) |

Beide belegen praktisch gleich viel VRAM — darin liegt die Antwort. `gptoss` fährt sein Modell in
**nativer** Präzision; MXFP4 ist kein nachträglich weggerechnetes Format, es gibt keinen
Quantisierungsverlust. `qwen` presst 30B in denselben Platz, also auf ~3 Bit: bei gleichem
Speicher wird Präzision gegen Parameterzahl getauscht, und IQ3_XXS ist die Stufe, auf der
Codegenerierung typischerweise sichtbar leidet. Die 47,9 tok/s sind eine Untergrenze, aber eine
Vervierfachung durch Wegfall der Konkurrenz ist nicht plausibel. `qwen`s einziger Anspruch bleibt
agentische Tiefe — dafür gibt es keine Zahl, und gemessen wird nicht. `qwen` bleibt inaktiv.

### Der eigentliche Befund: „abschalten" ist heute nicht ausdrückbar

Loadouts kennen **kein `enabled`-Feld**. `LOADOUT_KEYS` in `scripts/llm-proxy/loadouts.mjs:15-19`
ist fail-closed — ein unbekanntes Feld lässt `parseLoadouts` scheitern. Ein Loadout lässt sich
heute nur **löschen**, nicht abschalten. Genau das ist der Grund, warum dominierte Loadouts
jahrelang stehen bleiben: Löschen nimmt die gemessenen `notes` mit, und niemand will die
Begründung wegwerfen.

## What

### A. Ein `enabled`-Feld für Loadouts

`LOADOUT_KEYS` um `enabled` erweitern (Default `true`, wenn nicht gesetzt). Ein Loadout mit
`enabled: false` wird von `startLoadout` und vom Auto-Start-Pfad **abgelehnt**, statt nur optisch
zu verschwinden.

Warum ein Flag statt Löschen: Die Absicht dieses Tickets ist, dass ein unbrauchbares Loadout
nicht mehr **wählbar** ist. Löschen erreicht das auch — aber es nimmt die gemessenen Werte und
die Begründung mit, und der nächste Bearbeiter legt es ohne dieses Wissen wieder an. Ein
`enabled: false` neben erhaltenen `notes` („führt in keiner Dimension, abgeschaltet T003204") ist
selbstdokumentierend und benutzt dasselbe Vokabular wie die Proxy-Backends in der Registry.

### B. Abschalten

- `gptoss-context` (`:8098`) und `devstral-quality` (`:8099`) auf `enabled: false`
- die zugehörigen Proxy-Backends per Migration auf `enabled=false`
- `qwen3-coder-30b` bleibt unverändert inaktiv — es wird **nicht** reaktiviert

### C. Agenten umhängen (`.opencode/agent-models.jsonc`)

Vier Definitionen zeigen auf die abgeschalteten Loadouts, dazu die Permission-Liste des
deepseek-Orchestrators. Zuordnung nach **Rolle**, vom Operator gesetzt:

| Rolle | heute | nachher |
|---|---|---|
| schnell, breites Allgemeinwissen (`gptoss`, `gptoss-primary`) | `gptoss-context` | `gemma26-throughput` (159–169 tok/s) |
| Code-Review, gründlich (`devstral`, `devstral-primary`) | `devstral-quality` | `gemma26-factory` (177.920 ctx) |
| — | — | zusätzlich `gemma12-vision` als Agent-Ziel (262.144 ctx + Vision) |

Ein Agent, dessen Loadout deaktiviert ist, verschwindet nicht — er scheitert beim ersten
Dispatch. `tests/spec/local-llm-proxy/opencode-agent-model-drift.bats` wird bei diesem Umbau rot,
wenn die Agenten nicht mitgezogen werden. Das ist **erwünscht**: der Guard ist die Absicherung
gegen ein halbes Abschalten.

### D. `brain-ingest` ohne Reasoning

`brain-ingest` (`:8100`) ist ein **eigenes** Loadout, das zufällig dasselbe Modell fährt wie
`gptoss-context` (`gptoss20/gpt-oss-20b-UD-Q4_K_XL.gguf`). Es bleibt bestehen — abgeschaltet wird
nur das **Chat**-Loadout. Geändert wird allein `args.reasoning: "auto"` → aus: die Aufgabe ist
Formattreue bei `temperature 0.2`, kein Reasoning; die Denkphase kostet Tokens ohne Nutzen.
`brain-ingest-transform.sh` besitzt bereits ein `LM_DISABLE_THINKING`-Flag, was darauf hindeutet,
dass das schon einmal störte. Der Modell-A/B entfällt — `gptoss` bleibt.

## Geprüft und verworfen: bge in den VRAM

| | |
|---|---|
| `bge-m3-Q8_0` | 0,59 GB |
| `bge-reranker-v2-m3-Q8_0` | 0,59 GB |
| `gemma26-throughput` | **15,2 GB** auf einer 16-GB-Karte |

Das größte verbleibende Chat-Loadout füllt die Karte fast allein; 1,2 GB plus KV passen nicht
daneben. `--fit` bekäme weniger freien Speicher und kürzte den Kontext jedes Chat-Modells,
möglicherweise bis `gemma26-throughput` gar nicht mehr lädt. Der Ausweg wäre eine
`exclusiveGroup` für bge — was den Zweck zerstört: Embedding und Reranking werden gebraucht,
**während** ein Chat-Modell arbeitet (der RAG-Fall). Das kehrte zudem die Entscheidung aus T002729
um (`local-llm-proxy.md:913`, Guard `bge-loadout-cpu-bound.bats`). bge bleibt CPU-gebunden.

## Abgrenzung

Nicht Teil: T003203 (Port-8093-Kollision), T003205 (bge-Rollen-Routen im Proxy).

**Dateiüberschneidung mit T003205:** Beide Changes ändern `scripts/llm/loadouts.json` — T003205
fügt den Top-Level-Schlüssel `roles` hinzu, dieser Change ändert Loadout-Einträge. Dieser Branch
sollte nach dem Merge von T003205 auf frisches `main` rebasen, sonst entsteht ein vermeidbarer
Konflikt in derselben Datei.

_Ticket: T003204_
