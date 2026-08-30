# Runbook: FreeToken-native Betrieb (lokales LLM-Backend)

Seit T014028 ist FreeToken das lokale Standard-Backend für Subagenten und
Factory-Routing. Die llama.cpp-Loadouts `gemma26-throughput` (:8092) und
`qwen38-220k` (:8094) sind stillgelegt (`enabled: false` in
`scripts/llm/loadouts.json`).

## Setup (Stand 2026-08-23)

- **Engine:** Windows-seitig unter
  `C:\Users\PatrickKorczewski\AppData\Local\FreeToken\venv\Scripts\ft.exe`
  (Wheels aus `FlashML-org/FreeToken-Web` Release `beta`; Desktop-App zusätzlich
  installiert). WSL-seitige Zweitinstallation existiert unter `~/.freetoken`.
- **Modell:** `Qwen3.6-35B-A3B-NVFP4` (23,5 GB) als lokales Verzeichnis mit
  NTFS-Hardlinks auf den HF-Blob-Cache:
  `C:\Users\PatrickKorczewski\models\Qwen3.6-35B-A3B-NVFP4`.
- **Server:** OpenAI- + Anthropic-API auf `0.0.0.0:1919`; aus WSL dank
  `networkingMode=mirrored` + `hostAddressLoopback` via `127.0.0.1:1919`
  erreichbar.
- **Ressourcen:** `.wslconfig` seit 2026-08-23 auf `memory=24GB`,
  `processors=12` (Host: 64 GB, RTX 5070 Ti 16 GB).

## Start / Stop (Windows-seitig, detached)

```powershell
# Default: calibrated Qwen profile, fixed 200k KV pool.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1

# Other resident-model profiles:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Profile gptoss-65k
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Profile gemma-vision-32k

# Stop:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Stop
```

Bereitschaft: Log-Zeile `API server is ready to serve on 0.0.0.0:1919`.

**KV-Budget:** Ohne Größenflag wählt `--moe-cache-auto` nur ~8200 KV-Tokens
(0,16 GiB) — Requests über `prompt + generation > 8199` werden mit
`context_length_exceeded` abgewiesen (beobachtet beim Brain-Ingest,
2026-08-23). Für große Prompts explizit setzen, z. B. `--num-tokens 32768`
(kostet ~0,62 GiB VRAM; Log-Zeile `Allocating N tokens for KV cache`).

## Kalibrierte Profile (2026-08-28)

| Profil | Kontext | Decode warm | KV | GPU-Expert-Slots |
|--------|---------|-------------|----|------------------|
| `qwen-200k` | 200.000 | ~115 tok/s | 3,81 GiB | 3.712 / 10.240 |
| `gptoss-65k` | 65.536 | ~112 tok/s | modellabhaengig | auto |
| `gemma-vision-32k` | 32.768 | ~73 tok/s | modellabhaengig | auto |

Alle Profile pinnen `--max-running-requests 1 --graph 1`, `--moe-backend
offload --moe-cpu-layers 0`, `--moe-cache-auto`, einen KV-Reserve-Floor in
Profilgroesse, Radix-Cache und 8192-Token-Prefill-Chunks. "Plain offload"
bedeutet: fehlende Experten werden ueber PCIe auf die GPU geholt; der
Hybrid-Backend-Zweig berechnet keine Misses auf der CPU. Mehrere OpenCode-
Subagenten teilen daher keinen gleichzeitigen 200k-Pool: bei einem laufenden
Request warten weitere Requests in der Queue.

Der 200k-Qwen-Lauf verliert gegenueber 131k rund 7 % Decode-Durchsatz
(115 statt 124 tok/s in der Kalibrierung), stellt dafuer den vollen Kontext
ohne nachtraeglichen Ladder-Rebuild bereit. 23k uncached Prefill sank in der
Messung von etwa 2796 auf 1590 tok/s.

FreeToken exponiert fuer diese Checkpoints keinen 4-Bit-KV-Schalter. NVFP4
bezeichnet die Modell-/Expertengewichte, nicht automatisch einen 4-Bit-KV-
Cache. Die oben genannten KV-Groessen sind die tatsaechlich alloziierten Pools.

## Gemma Vision

Das Profil erwartet den mit `FREETOKEN_LOAD_VISION=1` konvertierten Checkpoint
`%USERPROFILE%\models\Gemma-4-26B-A4B-NVFP4-Vision-Enabled-FTW` und setzt die
Variable beim Serverstart erneut. Die lokale FreeToken-Venv benoetigt Pillow
und eine zur installierten CUDA-Torch-Version passende torchvision-Version.
Die verifizierte Konvertierung enthaelt 356 Vision-/Projector-Tensoren (rund
1,07 GB); der aeltere Text-Checkpoint enthaelt diese nicht.

Vision wurde ueber FreeTokens Python-API (`LLM.generate(mm_inputs=...)`)
erfolgreich verifiziert. Im verwendeten FreeToken-Stand nimmt die OpenAI-/
Anthropic-kompatible HTTP-Schicht Bildinhalte noch nicht verlaesslich an.
OpenCode bleibt deshalb ueber `freetoken-local/active` text-only, bis der
HTTP-Multimodalpfad upstream funktioniert und separat getestet ist.

## Messwerte (2026-08-23)

| Metrik | Wert |
|--------|------|
| Decode warm | ~103 tok/s (kalt: erste Requests durch Triton-JIT deutlich langsamer) |
| CPU-MoE nvfp4 | 22,4 GB/s (`ft bench bw`, Profil: `~/.cache/freetoken/benchbw.json` je OS separat) |
| PCIe-Gather | 25,9 GB/s |
| Backend | `offload` (Auto-Wahl; Hybrid-Overlap holt ~60 % der Misses auf der CPU) |
| VRAM | ~15,7/16 GB — **exklusiv**, keine llama-Loadouts parallel starten |

## Fallstricke

- **JIT-Warmup:** Die ersten Requests nach Serverstart sind langsam (4–40 tok/s),
  bis die Triton-Kerneln kompiliert sind. Für Messungen immer warm fahren.
- **`triton_kernels` fehlt auf Windows** (kein Wheel): der MoE-Router läuft als
  Pure-Torch-Fallback — vom Engine-Log als expected markiert.
- **WSL-Symlinks im HF-Cache sind für Windows-Python giftig**
  (`WinError 1314`): WSL legt im `/mnt/c`-Cache Symlinks ab, die Windows ohne
  Entwicklermodus nicht lesen/erzeugen kann. Deshalb: Modellverzeichnis mit
  NTFS-Hardlinks (`cmd /c mklink /H`) statt HF-Repo-ID verwenden, wenn der
  Cache von beiden Seiten beschrieben wurde.
- **Interop-Hänger:** Mehrere schnelle `powershell.exe`-/`cmd.exe`-Aufrufe aus
  WSL können hängen. Besser: ein einziges PS-Skript schreiben, per
  `Start-Process`/nohup ausführen, Ergebnis über Datei lesen.
- **FreeToken kennt den Proxy-[switch]-Mechanismus nicht:** Der llama-Proxy
  evictet FreeToken nicht und umgekehrt. Wer llama-Loadouts braucht, muss
  FreeToken vorher stoppen.
- **Die `hf`-CLI ist auf pk-desktop ein verwaister Launcher:**
  `%APPDATA%\Python\Python313\Scripts\hf.exe` zeigt auf `C:\Python313\python.exe`,
  die nicht mehr existiert (der Interpreter ist heute 3.14). Jeder Aufruf —
  auch `hf --help` — endet **wortlos mit rc=1**; in einer Pipe sieht das aus wie
  ein fehlgeschlagener Download statt wie eine kaputte CLI. Funktionierender Weg
  ist die Bibliothek statt des Wrappers:
  ```bash
  py -3.14 -c "from huggingface_hub import snapshot_download; \
    snapshot_download(repo_id='ggml-org/gpt-oss-20b-GGUF', \
                      local_dir=r'F:\models\ggml-org\gpt-oss-20b-GGUF')"
  ```
  `huggingface_hub` 1.21.0 liegt unter `py -3.14`; `HF_TOKEN` aus der Umgebung
  wird automatisch verwendet.

## Routing

- opencode-Provider: `freetoken-local/Qwen3.6-35B-A3B-NVFP4`
  (`.opencode/agent-models.jsonc`).
- Factory-Fallback/PIN-Pfad: `provider=freetoken`,
  `baseUrl=http://127.0.0.1:1919/v1` (`scripts/factory/route-provider.sh`).
- DB-Seite (Deployment): `tickets.provider_config` muss eine FreeToken-Zeile
  bekommen; llama-Zeilen demoten.

## OpenDesign als BYOK-Client (T900008)

[OpenDesign](https://github.com/nexu-io/open-design) (Electron, v0.21.0, Installation
unter `%LOCALAPPDATA%\Programs\Open Design`) spricht FreeToken direkt als
OpenAI-kompatiblen Endpunkt an. Es braucht **kein** zweites Backend und keinen
Modellwechsel.

| Feld | Wert |
|------|------|
| Base-URL | `http://127.0.0.1:1919/v1` |
| Modell | `Qwen3.6-35B-A3B-NVFP4` |
| Preset | „vLLM" oder „LM Studio" (beide generisch OpenAI-kompatibel) |

Konfiguriert wird das in OpenDesigns GUI (BYOK); `%APPDATA%\Open Design\` enthält vor
dem ersten Start nur eine `installationId`, keine Provider-Datei zum Vorbelegen.

### Verifikation (2026-08-30, ft `0.1.2+g816c324d0`, Profil `qwen-200k`)

Geprüft wurde genau das, was OpenDesigns BYOK-Proxy voraussetzt — Streaming und
Tool-Calls:

```bash
# Erreichbarkeit + Kontextfenster: status=ok/serving, context_length=262144
curl -sS http://127.0.0.1:1919/health
curl -sS http://127.0.0.1:1919/v1/models

# Tool-Calls => finish_reason "tool_calls" + valides arguments-JSON
curl -sS -X POST http://127.0.0.1:1919/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"Qwen3.6-35B-A3B-NVFP4","max_tokens":600,
       "messages":[{"role":"user","content":"What is the weather in Berlin? Use the tool."}],
       "tools":[{"type":"function","function":{"name":"get_weather",
         "parameters":{"type":"object","properties":{"city":{"type":"string"}},
                       "required":["city"]}}}]}'

# Streaming => korrekte chat.completion.chunk-Frames
curl -sS -N -X POST http://127.0.0.1:1919/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"Qwen3.6-35B-A3B-NVFP4","max_tokens":16,"stream":true,
       "messages":[{"role":"user","content":"Count: 1 2 3"}]}'
```

### Warum Vision hier nicht gebraucht wird

FreeToken lehnt Bildinhalte ab, solange ein Text-Checkpoint geladen ist:

```
HTTP 400 {"error":{"message":"Unsupported content part type for text-only server: image_url"}}
```

Das ist für OpenDesign folgenlos, weil dessen **BYOK-Chat-Pfad keine Bild-Parts
baut**. Nachgesehen im ausgelieferten Daemon
(`resources/app/prebundled/daemon/chunks/server-NJQOALF6.mjs`): alle 23
`image_url`-Konstruktionen liegen im Media-Generierungspfad
(`buildOpenAIImageEditUrl`, `body2.frame_images`/`frame_type:"first_frame"`,
`buildSeedanceContent`, `FAL_IMAGE_SIZES`/`falQueueRun`) und gehen an separate
Media-Provider — keine im Chat-Proxy
(`/api/proxy/{openai,anthropic,google,azure,ollama,aihubmix}/stream`).

> **Falle bei der Nachprüfung:** Eine naive Suche nach `vision` in diesem Bundle
> liefert 482 Treffer, die **ausnahmslos Substring-Artefakte** sind — `revision`
> (145), `revisions` (32), `revisionClock` (30), `stardivision`, `provisionalKey`.
> Kein einziger Treffer betrifft Bildverarbeitung. Wer die Zahl ungeprüft
> übernimmt, dokumentiert das Gegenteil des Befunds. Nachstellbar mit:
> ```bash
> py -3.14 -c "import re,collections; \
>   s=open(r'<pfad>\server-NJQOALF6.mjs',encoding='utf-8',errors='replace').read(); \
>   print(collections.Counter(re.findall(r'\w*vision\w*',s,re.I)).most_common(5))"
> ```

**Funktionsgrenze:** OpenDesign bietet im Brief „Match a reference site / screenshot
— I'll attach it" an. Angehängte Referenzbilder landen als Datei im Projekt; der
Agent greift per Dateizugriff darauf zu, **sieht** sie aber nicht. Wer erwartet,
dass das Modell ein Mockup visuell interpretiert, wird enttäuscht — mit jedem
text-only Backend gleichermaßen.

### Einschränkung: Requests queuen

Alle Profile pinnen `--max-running-requests 1` (siehe „Kalibrierte Profile").
OpenDesign-Requests laufen daher **nicht** parallel zu opencode-Subagenten, sondern
reihen sich hinter ihnen ein.

### Alternativweg: LM Studio — NICHT verifiziert

Ein zweiter Weg ist LM Studio als lokaler OpenAI-Endpunkt. Der Modellordner ist
`F:\models` in der LM-Studio-Struktur `publisher/repo/datei.gguf`:

```bash
py -3.14 -c "from huggingface_hub import snapshot_download; \
  snapshot_download(repo_id='ggml-org/gpt-oss-20b-GGUF', \
                    local_dir=r'F:\models\ggml-org\gpt-oss-20b-GGUF')"
```

Modellbegründung nicht hier duplizieren — sie steht mit Benchmark-Belegen im
Kopfkommentar von [`scripts/llm/start-gptoss-server.ps1`](../../scripts/llm/start-gptoss-server.ps1)
(kurz: Rang 2 auf LiquidAI/ifstruct für strukturiertes Instruction-Following, also
die tool_calls-Disziplin, bei nativ MXFP4 und ~12 GB).

**Was daran gemessen ist** (2026-08-30): `lms ls` listet nach dem Download
`gpt-oss-20b@mxfp4` (arch `gpt-oss`, 12,11 GB) als lokales Modell — die
Ordnerstruktur wird also erkannt. Die beiden `eagle3-*.gguf` erscheinen als eigene
Einträge (Drafter für Speculative Decoding).

**Was NICHT gemessen ist:** ob OpenDesign gegen LM Studio als Backend trägt. Dieser
Abschnitt ist Setup-Anleitung, keine Verifikation.

Zwei harte Randbedingungen:

- **NVFP4 ist für LM Studio unbrauchbar.** Es ist ein vLLM/TensorRT-Format; LM
  Studio fährt llama.cpp (GGUF). Bestätigt: nach dem Download von
  `nvidia/Qwen3.6-35B-A3B-NVFP4` nach `F:\models\nvidia\…` taucht es in `lms ls`
  **nicht** auf, während `gpt-oss-20b@mxfp4` gelistet wird.
- **LM Studio und FreeToken können nicht gleichzeitig laden.** FreeToken belegt
  ~15,7 von 16 GB — siehe „Messwerte": VRAM **exklusiv**. Vor dem Start von LM
  Studio deshalb:
  ```bash
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Stop
  ```
