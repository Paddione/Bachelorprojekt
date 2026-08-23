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
# Start (überlebt das WSL-Terminal):
Start-Process -FilePath 'C:\Users\PatrickKorczewski\AppData\Local\FreeToken\venv\Scripts\ft.exe' `
  -ArgumentList 'serve','--model','C:\Users\PatrickKorczewski\models\Qwen3.6-35B-A3B-NVFP4','--host','0.0.0.0' `
  -WindowStyle Hidden `
  -RedirectStandardOutput 'C:\Users\PatrickKorczewski\ft-serve.log' `
  -RedirectStandardError 'C:\Users\PatrickKorczewski\ft-serve.err.log'

# Stop:
Get-Process ft | Stop-Process -Force
```

Bereitschaft: Log-Zeile `API server is ready to serve on 0.0.0.0:1919`.

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
