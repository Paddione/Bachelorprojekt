# Bonsai-Server (Windows) — repo-spezifische llama.cpp-Referenz

Ternary-Bonsai läuft als OpenAI-kompatibler `llama-server` auf dem Windows-Host
(nicht in k8s). Er ist das physische Substrat der parallelen Partialplan-Pipeline
(T002074): Implement- und Review-Partials routen auf dieses Modell.

> Das Server-Setup ist bereits erledigt. Diese Referenz dokumentiert nur Zugriff,
> Health-Checks und die Betriebskonventionen — sie richtet nichts ein.

## Ist-Zustand (verifiziert 2026-07-23)

| Was | Wert |
|---|---|
| Modell | `prism-ml/Ternary-Bonsai-8B-gguf/Ternary-Bonsai-8B-Q2_0.gguf` (2,03 GB) |
| Build | `C:\Users\PatrickKorczewski\llama-bonsai-cuda13.3\bin\llama-server.exe` (PrismML-Fork) |
| Startskript | `C:\Users\PatrickKorczewski\.lmstudio\start-bonsai-parallel.ps1` |
| Slots | `-np 1` — **ein** Slot mit dem vollen Kontext exklusiv |
| Kontext | `-c 65536` |
| Weitere Flags | `-ngl 99 -fa on -ctk q4_0 -ctv q4_0 --jinja --metrics --cache-ram 24576` |
| Durchsatz | pp ~6.300 tok/s, tg ~185 tok/s (RTX 5070 Ti) |

`start-bonsai-server.ps1` (Ternary-Bonsai-**27B** + Vision-Tower, „Quality-Modus")
existiert weiterhin als Alternative. Die beiden Skripte schließen sich gegenseitig
aus — jedes killt beim Start alles auf Port 8093.

## Zugriff (aus WSL)

```bash
powershell.exe -NoProfile -File 'C:\Users\PatrickKorczewski\.lmstudio\start-bonsai-parallel.ps1'
```

Logs schreibt das Skript neben den Build: `bonsai-parallel-out.log` /
`bonsai-parallel-err.log` in `llama-bonsai-cuda13.3\bin\`.

## Port & Base-URL

- Port `8093`, OpenAI-kompatibel.
- Base-URL: `http://127.0.0.1:8093/v1`
- `networkingMode=mirrored` (WSL teilt den Windows-Netzstack) → der Windows-Listener
  ist direkt auf WSL-`localhost` erreichbar.

## Health-/Props-/Metrics-Checks

```bash
curl -s http://127.0.0.1:8093/health
curl -s http://127.0.0.1:8093/props | jq '.default_generation_settings.n_ctx'   # erwartet: 65536
curl -s http://127.0.0.1:8093/metrics | head                                    # braucht --metrics
```

## Parallelität sitzt im llm-proxy, nicht am Server

Bis 2026-07-23 lief der Server mit `-np 4` (+ `--kv-unified`) und einer
„3 Worker + 1 Orchestrator"-Slot-Konvention. **Das gilt nicht mehr.** Unter echter
3-4×-Last blieben fertig generierte Slots wiederholt unfreigegeben (der Scheduler
kam bei einem gleichzeitig wachsenden Riesen-Prompt nicht dazu, andere Slots
abzuschließen), einmal mit stillem Server-Crash.

Jetzt: `-np 1` am Server, Serialisierung per FIFO-Queue in
`scripts/llm-proxy/server.mjs` (Port `18235`, eine In-Flight-Anfrage pro Backend).
Mehrfachdispatch — z. B. 3 opencode-Subagenten — wartet dort, nicht am Server.

Die DB-Provider-Zeilen registriert weiterhin (idempotent, beide Brands):

```bash
bash scripts/factory/provider-register-bonsai.sh
```

Das Skript upsertet `tickets.provider_config` (`factory-implement`/`factory-review`
→ `llamacpp @ http://127.0.0.1:8093/v1`, `max_concurrent=3`) und pinnt
`tickets.factory_model_slots` für `implement`/`verify`. `route-provider.sh` bevorzugt
`factory_model_slots` (phase-pin) vor `provider_config`.

> `max_concurrent=3` in der DB beschreibt die Worker-Parallelität der Factory,
> **nicht** Server-Slots. Die drei Worker teilen sich den einen Serverslot über die
> Proxy-Queue.

## Gotcha: `-ngl 99` garantiert keine GPU-Inferenz (T002111)

Fehlt dem Build der CUDA-Kernel für das Quantisierungsformat, schiebt `ggml-sched`
jeden Matmul still auf die CPU — ohne Fehlermeldung, mit belegtem VRAM und
plausibel aussehendem Log.

Am 2026-07-23 lief der Server so mit `Ternary-Bonsai-8B-TQ2_0.gguf`:

| | TQ2_0 | Q2_0 |
|---|---|---|
| Prompt processing | 54 tok/s | **6.355 tok/s** |
| Generierung | 12,8 tok/s | **184,7 tok/s** |
| GPU | 10–12 %, 80 W | 91 %, 265 W |
| CPU | 7,73 von 8 Threads | 0,17 Kerne |

Gleiche Gewichte, gleicher Build, gleiche GPU — nur das Format unterschied sich.
Der PrismML-Fork hat CUDA-Kernel für sein eigenes `Q2_0`, aber keine für das
Upstream-Ternärformat `TQ2_0`.

**Prüfung vor jedem Formatwechsel** (statisch, kostet Sekunden):

```bash
SRC=/mnt/c/Users/PatrickKorczewski/llama-bonsai-src/ggml/src
grep -ril "TQ2_0" $SRC/ggml-cuda/ | wc -l   # 0  -> laeuft auf der CPU
grep -ril "Q2_0"  $SRC/ggml-cuda/ | wc -l   # 8  -> GPU-Kernel vorhanden
```

**Prüfung nach jedem Start** (empirisch, entlarvt jede stille Regression):

```bash
# Unter Last: GPU muss hoch, CPU muss niedrig sein.
nvidia-smi --query-gpu=utilization.gpu,power.draw --format=csv,noheader
```

Ist die CPU am Anschlag und die GPU unter 20 %, läuft die Inferenz auf der CPU —
unabhängig davon, was das Startskript ins Log schreibt. Dessen VRAM-Budget-Logik
prüft nur *freien Speicher*, nie *Kernel-Verfügbarkeit*, und meldet deshalb auch
im CPU-Notbetrieb „GPU mode".

## Gotcha: mcp-kubernetes killt die Tool-Call-Grammatik (T002112)

`mcp-kubernetes` liefert JSON-Schema-`pattern` mit der Zeichenklasse
`[/_.\-A-Za-z0-9=, ()!]`. In Regex ist `\-` ein gültiges Escape, in GBNF nicht —
llama.cpp verwirft daraufhin die **komplette** generierte Grammatik:

```
parse: error parsing grammar: unknown escape at \-A-Za-z0-9=, ()!])+) "\"" space
E failed to parse grammar
```

Der Slot startet dann ohne Grammatik: constrained tool-call decoding ist für den
gesamten Request aus. Betroffen sind `pods_list`, `pods_list_in_namespace`,
`resources_list` (je `labelSelector`/`fieldSelector`) sowie `nodes_top` und
`pods_top` (`label_selector`).

Symptom im Log: `E failed to parse grammar` direkt vor `launch_slot_`. Wer
malformte Tool-Calls und Retries sieht, sucht zuerst hier — nicht am Modell.

## Risiko: langer Einzelkontext

Mit `-np 1` gibt es keine Slot-Kontention mehr, aber ein einzelner sehr langer
Request blockiert die Queue für alle anderen. Der Proxy loggt Wartezeiten über
250 ms als `[queue] … waited Xms behind an in-flight request` — das ist das
Frühwarnsignal für zu große Prompts, nicht für zu wenige Slots.
