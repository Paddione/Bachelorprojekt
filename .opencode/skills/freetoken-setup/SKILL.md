---
name: freetoken-setup
description: Set up, switch, and tune the FreeToken MoE serving backend (:1919, Windows) with the optimal config per model - Qwen3.6-35B-A3B-NVFP4, gpt-oss-20b, Gemma-4-26B-A4B-NVFP4 under C:\Users\PatrickKorczewski\models. Use when starting or restarting ft serve, switching the resident model, sizing KV/expert caches, wiring opencode to the local backend, or diagnosing slow decode and context-limit drops.
---

# FreeToken Setup

Optimal per-model configs for the local FreeToken engine on PK-Desktop
(RTX 5070 Ti, 16 GB VRAM), serving OpenAI/Anthropic-compatible APIs on :1919.

## Environment facts

| What | Value |
|---|---|
| Engine | `ft.exe` at `%LOCALAPPDATA%\FreeToken\venv\Scripts\` (Windows) |
| Models dir | `C:\Users\PatrickKorczewski\models` |
| Server | `http://127.0.0.1:1919` (`--host 0.0.0.0` for LAN) |
| Daemon | `http://127.0.0.1:1900/engine/status` — reports resident model |
| Restart w/ flags | `scripts/llm/restart-freetoken.ps1` (from WSL: `powershell.exe -NoProfile -File ...`) |
| Prefill A/B | `scripts/llm/bench-freetoken-prefill.sh` |

## Golden rules (from the FreeToken source, engine.py)

1. **MoE models bigger than VRAM default to `offload`** — experts stream from
   pinned host-RAM banks into an auto-sized GPU slot cache. `auto` never picks
   `fused`; a wrong fused guess is a weight-load OOM, not a slower run.
2. **Dense models are forced to `fused`** (fully resident). If weights exceed
   the ~14.7 GB budget (16 GB × `--memory-ratio 0.9`), the model cannot run.
3. **Run `ft bench bw` once per machine** — its profile lets `auto` upgrade
   offload → hybrid when CPU bandwidth > 2× PCIe gather.
4. **Usable context = KV pages actually configured**, NOT the advertised
   `max_model_len`. opencode auto-compacts at 95% of `limit.context`, so the
   per-model entries in `.opencode/agent-models.jsonc` must match the serve
   flags exactly (plugin `freetoken-active.ts` copies them onto the alias).
5. **SWA models need page-size 1** (auto); radix cache picks SWA/GDN-aware
   variants automatically.

## Resident-model matrix (measured 2026-08-23)

| Model | Weights | Backend | Decode | KV / ctx | Details |
|---|---|---|---|---|---|
| Qwen3.6-35B-A3B-NVFP4 | 23.4 GB | offload (auto) | ~104 tok/s short, 62–70 @63k | 131072 | [matrix](references/model-matrix.md#qwen36-35b-a3b-nvfp4) |
| gpt-oss-20b (FTW) | 13.8 GB | offload (auto) | ~112 @64k, ~128 @32k | 65536 / 32768 | [matrix](references/model-matrix.md#gpt-oss-20b) |
| Gemma-4-26B-A4B-NVFP4 | 18.8 GB | offload (auto) | ~73 @32k | 32768 | [matrix](references/model-matrix.md#gemma-4-26b-a4b-nvfp4) |
| Qwen3.6-27B-NVFP4 | 21.9 GB | **cannot run** | — | — | dense, forced fused > VRAM. [matrix](references/model-matrix.md#qwen36-27b-nvfp4-not-viable) |

## Workflow

1. **Pick/switch model** → exact `ft serve` line from the matrix; start via
   `restart-freetoken.ps1 -Model <path> -NumTokens <n> [-ExtraArgs "..."]`.
2. **Validate** → `bash scripts/smoke-test.sh` (health, served id, stats,
   advertised-vs-configured context warning).
3. **Wire opencode** → keep `.opencode/agent-models.jsonc`
   `provider.freetoken-local.models.<CheckpointName>.limit.context` equal to
   the served KV token count; the plugin syncs the `active` alias at startup.
4. **Tune** → live pool resize without restart:
   `ft ctl cache --kv <tokens> --moe <slots> [--swa <n>] [--wait 300]`.

Per-model deep dive (commands, VRAM math, gotchas):
[references/model-matrix.md](references/model-matrix.md)
