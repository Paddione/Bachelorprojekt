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

## Routing

- opencode-Provider: `freetoken-local/Qwen3.6-35B-A3B-NVFP4`
  (`.opencode/agent-models.jsonc`).
- Factory-Fallback/PIN-Pfad: `provider=freetoken`,
  `baseUrl=http://127.0.0.1:1919/v1` (`scripts/factory/route-provider.sh`).
- DB-Seite (Deployment): `tickets.provider_config` muss eine FreeToken-Zeile
  bekommen; llama-Zeilen demoten.
