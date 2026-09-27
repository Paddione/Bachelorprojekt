---
title: "p3 — Modell-Pool, GPU-Loadouts und Sicherheitschecks"
ticket_id: T900561
domains: [llm-local-dev]
status: active
---

# p3 — Modell-Pool, GPU-Loadouts und Sicherheitschecks

Files: `scripts/llm/agent-bench/lib/loadouts.mjs`, `scripts/llm/agent-bench/models.json`,
`scripts/llm/agent-bench/vllm-kernel-check.py` (alle neu).

## Task 3.1: Modell-Pool (`models.json`)

Einträge `{ id, gpu: "5070ti"|"3060ti"|"remote", port, start: [argv...] | null, service: "<unit>"|null, capabilities: ["tools","vision"], max_context, engine: "llamacpp"|"vllm"|"api" }`:

- `qwen38-27b`: `service: "qwen38-gsq-iq2s.service"` (produktiv, `:1919`), `gpu: 5070ti`, `capabilities: ["tools"]`.
- `qwen35-4b`: `service: "qwen35-mtp.service"` (`:1920`), `gpu: 3060ti`, `capabilities: ["tools"]`.
- `gemma4-12b-nvfp4`: `gpu: 5070ti`, `port: 1921`, `engine: vllm`, `capabilities: ["tools","vision"]`, `start`:
  `~/opt/vllm-nvfp4/bin/vllm serve ~/models/gemma-4-12b-it-NVFP4 --served-model-name gemma4-12b-nvfp4 --host 127.0.0.1 --port 1921 --gpu-memory-utilization 0.88 --kv-cache-dtype fp8 --max-model-len 65536 --enable-auto-tool-choice --tool-call-parser <parser>`,
  mit `Environment=CUDA_DEVICE_ORDER=PCI_BUS_ID` und `CUDA_VISIBLE_DEVICES=GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4` (5070 Ti, UUID aus `scripts/llm/qwen38-gsq-iq2s.service`).
  Den Tool-Parser-Namen vor dem Eintragen mit `~/opt/vllm-nvfp4/bin/vllm serve --help=tool-call-parser` bzw. `vllm serve --help | grep -A3 tool-call-parser` ermitteln und den Gemma-4-Parser wählen; kein MoE-Backend setzen (Unsloth-Guide: Auto-Auswahl).
- `teacher`: `engine: api`, `gpu: remote`, deaktiviert per `"enabled": false` (Aktivierung nur per `--models`).

Residenz-Regel: Modelle mit gleicher `gpu` (außer `remote`) sind nie gleichzeitig geladen.

## Task 3.2: Loadout wechseln (`loadouts.mjs`)

`ensureLoadout(modelIds, pool)`:
1. `bash scripts/gpu-lock.sh acquire` einmal zu Beginn des Laufs (`acquireGpu()`), `release` in `releaseGpu()`.
2. Für jede benötigte GPU: laufende Belegung stoppen (`systemctl --user stop <service>` bzw. transiente Unit `agent-bench-<id>` stoppen), Zielmodell starten (`systemctl --user start <service>` oder `systemd-run --user --unit=agent-bench-<id> -p Environment=... <start...>`).
3. Warten auf `GET /v1/models` (Timeout 600 s, vLLM kompiliert beim ersten Start).
4. Checks aus Task 3.3; bei Fehler `{ ok: false, infra: true, reason }`.

`restoreProduction()`: stoppt alle `agent-bench-*`-Units, startet `qwen38-gsq-iq2s.service` und
`qwen35-mtp.service`, wartet auf beide Endpunkte, gibt den GPU-Lock frei. `installRestoreHooks()`
registriert `restoreProduction` für `SIGINT`, `SIGTERM`, `uncaughtException` und Prozessende
(synchroner Fallback per `execFileSync`), Requirement "Production orchestrator is restored after an abort".

## Task 3.3: Kernel- und Spill-Check

- `vllm-kernel-check.py`: importiert `torch` und `vllm`, prüft `torch.cuda.get_device_capability() == (12, 0)` auf dem per `CUDA_VISIBLE_DEVICES` sichtbaren Gerät und liest aus dem Serverlog (Pfad als Argument) die gewählte NVFP4-Kernel-Zeile; Exit 1, wenn `Marlin` gewählt wurde oder keine FP4-Kernel-Zeile gefunden wird, Exit 0 sonst. Ausgabe eine Zeile `kernel=<name> cap=<major>.<minor>`.
- Spill-Check in `loadouts.mjs`: `nvidia-smi --query-gpu=uuid,memory.used --format=csv,noheader,nounits`; Belegung > 15900 MiB auf der 5070 Ti → Infra-Fehler `spill` (WSL-Grenze aus `scripts/llm/qwen38-gsq-iq2s.service`).
- Binärpfade über Env überschreibbar (`AGENT_BENCH_NVIDIA_SMI`, `AGENT_BENCH_SYSTEMCTL`, `AGENT_BENCH_GPU_LOCK`) für die Tests in p9.

Akzeptanz: `node --check scripts/llm/agent-bench/lib/loadouts.mjs`; `python3 -m py_compile scripts/llm/agent-bench/vllm-kernel-check.py`; p9-Tests "Marlin fallback is refused" und "Production orchestrator is restored after an abort" mit Fake-Binaries.
