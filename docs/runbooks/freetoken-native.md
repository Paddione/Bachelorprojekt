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
erfolgreich verifiziert. Die HTTP-Schicht kann es **nicht** — und zwar
grundsaetzlich, nicht bloss unzuverlaessig: siehe
[Vision-Einschraenkung (T900009)](#opendesign-als-byok-client--vision-einschraenkung-t900009).
Dieses Profil laedt also die Vision-Tensoren, ohne dass ein HTTP-Client sie
nutzen koennte; erreichbar sind sie nur ueber die Python-API. OpenCode bleibt
ueber `freetoken-local/active` text-only.

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

OpenDesign kennt zwei Betriebsarten, und die Wahl bestimmt, wo der Provider
konfiguriert wird:

1. **BYOK-Direktanbindung** — OpenDesign spricht den Endpunkt selbst an. Das ist
   der hier zuerst beschriebene, gemessene Weg.
2. **Über einen lokalen Coding-Agent** — OpenDesign steuert eine mitgelieferte
   Agent-CLI, die ihrerseits einen Provider hat. Für dieses Repo relevant, weil
   **opencode im Bundle liegt**; siehe „Der Weg führt über opencode" weiter unten.

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

### Alternativweg: LM Studio — verifiziert (2026-08-31)

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

**Was daran gemessen ist** (2026-08-30): der LM-Studio-Server läuft auf
`:1234` und listet nach dem Download beide Modelle —
`gpt-oss-20b@mxfp4` (arch `gpt-oss`, 12,11 GB) und
`qwen3.6-35b-a3b-nvfp4` (arch `qwen3_5_moe`, 23,46 GB), beide `DEVICE=Local`.
Die Ordnerstruktur wird also erkannt. Die zwei `eagle3-*.gguf` erscheinen als
eigene Einträge (Drafter für Speculative Decoding).

```bash
lms server status          # -> "The server is running on port 1234."
lms ls                     # vollstaendig lesen, NICHT durch head abschneiden
curl -sS http://127.0.0.1:1234/v1/models
```

> **NVFP4 ist für LM Studio NICHT unbrauchbar** — eine frühere Fassung dieses
> Abschnitts behauptete das und lag falsch. Die Fehlbehauptung entstand aus einem
> `lms ls | head -12`: `qwen3.6-…` steht alphabetisch unterhalb des Schnitts, das
> abgeschnittene Listing wurde als Abwesenheitsbeweis gelesen. **Abwesenheit in
> einer gekürzten Ausgabe ist kein Beleg.** Ungeprüft bleibt allein, ob LM Studio
> das Modell auch tatsächlich *lädt* — Listing ist nicht Ladefähigkeit, und der
> Ladeversuch scheitert an der VRAM-Exklusivität unten.

**Stand 2026-08-31:** LM Studio *laedt* und *bedient* das Gemma-Vision-Modell —
gemessen unten unter „Verifikation LM Studio". Offen bleibt allein, ob LM Studio das
**NVFP4** laedt (Listing ist nicht Ladefaehigkeit) und ob OpenDesign den Weg im Alltag
traegt; dessen Chat-Proxy schickt jedenfalls keine Bilder (siehe T900009).

### Der Weg führt über opencode, nicht über BYOK-Direktanbindung

OpenDesign bringt **opencode als Coding-Agent mit** — `opencode.exe`
(Version `0.0.0--202608120330`) liegt im Bundle unter
`resources/open-design/bin/libexec/opencode/`. Neben der oben beschriebenen
BYOK-Direktanbindung ist das der zweite, für dieses Repo natürlichere Pfad:

```
OpenDesign ──► opencode ──► Provider (freetoken :1919  ODER  lmstudio :1234)
```

opencode kennt LM Studio bereits als Provider — `.opencode/opencode.jsonc`
definiert `lmstudio` über `@ai-sdk/openai-compatible` mit
`baseURL: http://127.0.0.1:1234/v1`. In `.opencode/agent-models.jsonc` ist
`lmstudio` bislang allerdings nur **Registry für die LAN-Geräte**; laut Kommentar
dort dispatcht kein Agent direkt darauf. Wer OpenDesign über opencode gegen LM
Studio fahren will, muss also erst eine Agent-Zuordnung anlegen — der Provider
allein genügt nicht.

### VRAM: die harte Trennung

**LM Studio und FreeToken können nicht gleichzeitig laden.** FreeToken belegt
~15,7 von 16 GB — siehe „Messwerte": VRAM **exklusiv**. Der LM-Studio-*Server*
darf laufen (er hält ohne geladenes Modell kein VRAM), aber der erste Request
löst JIT-Loading aus und kollidiert dann mit FreeToken. Vorher deshalb:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Stop
```

## OpenDesign als BYOK-Client — Vision-Einschraenkung (T900009)

FreeToken kann über HTTP **grundsätzlich kein Vision** — für kein Modell und mit keinem
Checkpoint. Belegstelle: `freetoken/server/generation.py:240`, `_flatten_text_parts` wirft
bedingungslos bei jedem Nicht-Text-Part, ohne Modell- oder Flag-Pruefung. Die bisherige
Formulierung "nimmt Bildinhalte noch nicht verlaesslich an" ist zu schwach.

`qwen3_5_moe` traegt in FreeToken `vision_config=None` ("text-only milestone");
`FREETOKEN_LOAD_VISION` greift nur in `gemma4` und `minimax_m3`.

Der funktionierende Weg ist LM Studio auf `:1234` mit `gemma-4-26b-a4b-it`
(`type: "vlm"`, `capabilities: ["tool_use"]`), Vision 4/4 Merkmale erkannt.

### Messreihe (RTX 5070 Ti 16 GB, 128k Kontext, K `q8_0` / V `q4_0`, `mmproj-F16`)

| Quant | offloadRatio | Durchsatz | VRAM-Reserve |
|-------|--------------|-----------|--------------|
| MXFP4_MOE | 0,76 | 33,1 tok/s | 772 MiB |
| IQ4_XS | 0,90 | 44,0 tok/s | 1328 MiB |
| IQ4_XS | 0,95 | 50,1 tok/s | 579 MiB, ein Lauf brach ab |

**Gegenintuitive Erkenntnis:** Mehr GPU-Offload ist unterhalb einer VRAM-Reserveschwelle
langsamer statt schneller. MXFP4 lieferte bei `0,82` nur 26,8 tok/s (350 MiB Reserve),
bei `0,76` dagegen 33,1 tok/s. Das Optimum liegt knapp unterhalb des Limits, nicht am Limit.

**Fallstricke:** FreeToken und LM Studio koennen nicht gleichzeitig laden. FreeToken sauber
stoppen NICHT ueber `restart-freetoken.ps1 -Stop` — das findet eine von der Desktop-App
gestartete Engine nicht, weil sie als `python.exe` unter einem `ft.exe daemon` laeuft.
Stattdessen die Daemon-Control-API: `POST http://127.0.0.1:1900/engine/stop`, Start ueber
`POST /engine/start` mit `{model, port, args}`.

LM Studio loest Nicht-Standard-Quantnamen (`MXFP4_MOE`, `UD-IQ4_XS`) nicht als Varianten
auf und zeigt `@?`. Abhilfe: die Variante in einen eigenen `publisher/repo`-Ordner legen —
sie wird dann sofort als eigenes Modell erkannt, ohne App-Neustart.

### Verifikation LM Studio (2026-08-31, `gemma-4-26b-a4b-it-iq4xs`)

Gemessen wurde genau das, was OpenDesigns BYOK-Proxy voraussetzt — plus Vision,
das FreeToken ueber HTTP prinzipiell nicht kann.

| Merkmal | Ergebnis |
|---|---|
| Laden | 15,5 s, 13,77 GiB, `--gpu 0.90 --context-length 131072` |
| VRAM | 14398 / 16303 MiB belegt — **1905 MiB Reserve** |
| Vision | ✅ drei Farbbaender korrekt benannt, HTTP 200 in 3,6 s |
| Tool-Calls | ✅ `finish_reason: tool_calls`, `{"city":"Berlin"}` |
| Streaming | ✅ 198 gueltige `chat.completion.chunk`-Frames |
| Durchsatz | ~51 tok/s (Messreihe oben: 44,0 bei `offloadRatio` 0,90) |

Die VRAM-Reserve liegt hoeher als die 1328 MiB der Messreihe oben — dort war der
FreeToken-Daemon vermutlich noch nicht vollstaendig gedrained.

Nachstellbar (Bild lokal erzeugen, damit kein Rateweg offen bleibt — drei Baender
in der *unerwarteten* Reihenfolge gruen/blau/rot):

```bash
lms server start && lms load gemma-4-26b-a4b-it-iq4xs --gpu 0.90 --context-length 131072 -y
py -3.14 - <<'EOF'
import zlib, struct, base64, json, urllib.request
W = H = 96
bands = [(0,170,0), (0,0,200), (220,0,0)]
raw = b"".join(b"\x00" + bytes(bands[min(y*3//H, 2)]) * W for y in range(H))
chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t+d) & 0xffffffff)
png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
body = {"model": "gemma-4-26b-a4b-it-iq4xs", "max_tokens": 300, "messages": [{"role": "user", "content": [
    {"type": "text", "text": "The image has three horizontal color bands. Name them from top to bottom."},
    {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(png).decode()}}]}]}
req = urllib.request.Request("http://127.0.0.1:1234/v1/chat/completions",
    data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
print(json.load(urllib.request.urlopen(req, timeout=300))["choices"][0]["message"]["content"])
EOF
# erwartet: Green, blue, red
```

**Was das NICHT beweist:** dass OpenDesign davon profitiert. Der Client schickt keine
Bilder (naechster Abschnitt) — die Faehigkeit liegt am Server, ungenutzt.

### Befund reproduziert: OpenDesign schickt keine Bilder (2026-08-31)

Der Befund aus T900008 wurde gegen die installierte App nachgeprueft, nicht uebernommen.
Version weiterhin **0.21.0** (`resources/app/package.json`), gleiche Bundle-Datei,
**23 `image_url`-Treffer** — Zahl identisch. Die vier Treffer, die im Kontext-Grep nach
Chat-Content aussahen (`fullText`, `content`), im Volltext gelesen:

- Treffer 3/4: Videogenerierung, `ctx.imageRef.dataUrl` → `POST /contents/generations/tasks`
- Treffer 5/6: OpenRouter-**Bild**generierung, liest `image_url` aus der *Antwort*

Alle im Media-Pfad, keiner im Chat-Proxy. **Der Flaschenhals ist der Client, nicht das
Backend** — ein Vision-Modell am Endpunkt aendert an „Match a reference site / screenshot"
nichts.

```bash
B="$LOCALAPPDATA/Programs/Open Design/resources/app/prebundled/daemon/chunks"
grep -roh "image_url" "$B" | wc -l   # 23
```

### Fallstrick: `/engine/start` traf das falsche Modell

Beim Zurueckschalten auf FreeToken lieferte `POST /engine/start` mit
`{model: …Qwen3.6-35B-A3B-NVFP4, port, args}` zwar `{"pid":69800}`, resident war danach
aber **gpt-oss-20b** unter einer voellig anderen PID (104772) — ein Supervisor bzw. die
Desktop-App war schneller. Wer nach dem Start nicht **verifiziert, welches Modell
tatsaechlich resident ist**, arbeitet ahnungslos gegen das falsche Modell; FreeToken
ignoriert das `model`-Feld der Anfrage und meldet den Fehler also nie.

```bash
curl -sS http://127.0.0.1:1900/engine/status   # .model gegenpruefen, nicht nur .running
```

Abhilfe: `POST /engine/switch` mit `{model, port, args, force: true}` — das drainte die
gpt-oss-Instanz sauber (Receipt) und brachte Qwen resident.
