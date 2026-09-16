# Retired opencode runtimes / models (history, not live config)

Retired 2026-09-16 in the FreeToken-MoE consolidation (single `local` handle,
2 cloud rails Go + direct, static 200k-KV pool). Live SSOT:
`.opencode/agent-models.jsonc`; runtime mirror: `agents.yaml`.

## Removed agent handles (all pointed at the same resident checkpoint)

| Handle | Was | Why removed |
|---|---|---|
| `gptoss` / `devstral` / `gemma` / `gemma12` / `qwen38` | subagent, `llamacpp-local/Qwen3.6-35B-A3B-NVFP4`, `local-subagent.md` | 5 names, 1 slot, 1 radix cache — collapsed to `local` |
| `qwen-cloud` | subagent, `alibaba-intl/qwen3.8-max` (131k) | Alibaba 3rd rail dropped (2-rail decision) |
| `deepseek-helper-alibaba` | subagent, `alibaba-intl/deepseek-v4-flash-0731` | same |
| `deepseek-pro-alibaba` | all, `alibaba-intl/deepseek-v4-pro` | same |
| `alibaba-primary` | primary, `alibaba-intl/qwen3.8-max` [T004396] | same |

## Removed model entries (no agent referenced them)

- `llamacpp-local/hauhau-qwen36` (stale since 2026-09-12: loadout disabled, :8097 closed, ctx unmeasured)
- `llamacpp-local/gemma12-vision` (stale since 2026-09-12: loadout disabled, :8089 closed)
- `llamacpp-local/qwen38-220k` (llama.cpp :8094 down 2026-09-16; dual-GPU-split era over)
- `lmstudio/*` (8 LAN-laptop entries: qwen3.5-9b ×3, qwen3-14b, gemma-4-12b-qat, gemma4-fable MTP, gemma-4-e2b, qwen3.5-4b) — device inventory, never a dispatch target
- provider `alibaba-intl` (baseURL `token-plan…/compatible-mode/v1`; key in `~/.local/share/opencode/auth.json` retained for manual use)

## Dropped serve path

KV-ladder (`scripts/llm/freetoken-kv-ladder.ps1`, dynamic `/v1/cache/rebuild` growth):
rejected 2026-09-16 — large MoE-growth rebuilds OOM under fragmentation;
static `qwen-200k` pool (200k KV / moe 4150) measured healthy
(decode ~100 tok/s, cold prefill ~2.6–3.7k tok/s wall, radix hit ~12–43k tok/s).
