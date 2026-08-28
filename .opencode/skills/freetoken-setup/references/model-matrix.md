# FreeToken model matrix — PK-Desktop (RTX 5070 Ti, 16 GB)

Usable VRAM budget: 16303 MiB x `--memory-ratio 0.9` = ~**14.7 GB** for
weights + expert slot cache + KV + CUDA graphs. All numbers below are
measurements from 2026-08-23 unless marked otherwise.

---

## Qwen3.6-35B-A3B-NVFP4

The daily driver. MoE with GDN hybrid attention - most layers carry a
constant-size recurrent state instead of growing KV, which is why 131k tokens
fit alongside a streamed expert set.

```powershell
# via restart script (from Git Bash), = baseline of 2026-08-23
powershell.exe -NoProfile -File scripts/llm/restart-freetoken.ps1 `
  -Model "$env:USERPROFILE\models\Qwen3.6-35B-A3B-NVFP4" -NumTokens 131072
```

- Weights 23.4 GB -> offload family is mandatory; `auto` resolves there.
- 131072 KV reserve leaves ~34% of experts resident in the GPU slot cache.
- Measured: ~104 tok/s decode at short context, 62-70 tok/s at 63k context.
- Prefill pathology (A/B via the restart script): default flags gave ~149 tok/s
  prefill but only 45 tok/s decode (3.3x ratio instead of the usual 50-200).
  Candidates: `--moe-prefill-hit-d2d` (needs CUDA >= 13),
  `--max-running-requests 1 --graph 1`, `--max-prefill-length`.
- Optional env A/B: `FREETOKEN_MAMBA_SSM_DTYPE=bfloat16` (`-EnvVars` on the
  restart script) - trades SSM state precision for speed.
- opencode entry: `limit.context: 131072`.

## gpt-oss-20b

Smallest model; the only one whose weights (13.8 GB MXFP4) *nearly* fit fused -
but fused would leave <1 GB for KV + graphs. Stay on `auto`/offload: dense
parts stay on GPU, experts stream, and the freed VRAM buys a large expert
cache (75.7% resident) plus real KV.

```powershell
powershell.exe -NoProfile -File scripts/llm/restart-freetoken.ps1 `
  -Model "$env:USERPROFILE\models\gpt-oss-20b" -NumTokens 65536
```

- FTW fast-load checkpoint already converted (`ft checkpoint`); serve
  auto-detects it. Native context 131072, SWA-128 on 12/24 layers,
  4 experts/token.
- Measured tradeoff: ~112 tok/s @64k KV vs ~128 tok/s @32k KV. Pick 65536 for
  agentic work, 32768 for throughput.
- Reasoning effort is low/medium/high (not on/off) - map agent "thinking"
  settings accordingly.
- Text-only by architecture.
- opencode entry: `limit.context: 65536` (or 32768 to match `-NumTokens`).

## Gemma-4-26B-A4B-NVFP4

MoE with sliding-window attention. Weights 18.8 GB -> offload.

```powershell
powershell.exe -NoProfile -File scripts/llm/restart-freetoken.ps1 `
  -Model "$env:USERPROFILE\models\Gemma-4-26B-A4B-NVFP4" -NumTokens 32768
```

- After load, trim the window pool and grow experts via live rebuild:
  `ft ctl cache --swa 8777 --moe 1540 --wait 300`
  -> measured ~73 tok/s decode @32k KV, 40% experts resident.
- SWA forces KV page-size 1 (auto-handled); radix cache uses the SWA-aware
  variant automatically.
- **FTW caveat**: the converted FTW checkpoint contains zero vision tensors -
  text-only until a vision-capable reconversion exists.
- opencode entry: `limit.context: 32768`.

## Qwen3.6-27B-NVFP4 — NOT VIABLE

Dense 27B, 21.9 GB of weights. FreeToken forces dense models onto the fully
resident `fused` path (engine.py rejects every non-fused backend for dense),
and 21.9 GB exceeds the ~14.7 GB budget -> weight-load OOM guaranteed. There
is no dense CPU-offload flag (`--moe-cpu-layers` is MoE-only).

Options if this model is really needed:
1. GPU with >= 24 GB VRAM (then plain `ft serve --model ...` works, `auto`
   resolves to fused).
2. Use Qwen3.6-35B-A3B-NVFP4 instead - similar generation quality class,
   runs fine via offload on this machine.

Do not add serve flags for it here; revisit only after a hardware change.

---

## Validation recipe

```bash
# from Git Bash, against the FreeToken backend on localhost
bash .opencode/skills/freetoken-setup/scripts/smoke-test.sh
```

Manual equivalents:

```bash
curl -s http://127.0.0.1:1919/health          # status + load progress
curl -s http://127.0.0.1:1919/v1/models       # served model id
curl -s http://127.0.0.1:1919/v1/stats        # tok/s, VRAM, pool occupancy
ft ctl cache                                   # pool table (needs ft on PATH)
```

Red flags:
- `usage` context drops "Input sequence length exceeds" -> served KV tokens
  < opencode `limit.context`; fix the jsonc entry or raise `-NumTokens`.
- Decode throughput far below matrix values -> check `--max-running-requests`
  contention (another agent holding a slot) and pool occupancy in `/v1/stats`.

## Measurement recipe (re-derive numbers after hardware/flag changes)

1. `ft bench bw --dtype nvfp4,mxfp4` once per machine -> cached profile at
   `~/.cache/freetoken/benchbw.json`, lets `auto` upgrade offload -> hybrid.
2. Restart with candidate flags via `restart-freetoken.ps1 -Tag <name>`.
3. `bash scripts/llm/bench-freetoken-prefill.sh` for prefill/decode timing.
4. Record results in `.opencode/agent-models.jsonc` model `name:` strings and
   update this matrix.

## opencode wiring

- Provider: `freetoken-local` -> `http://127.0.0.1:1919/v1` (see
  `.opencode/agent-models.jsonc`). FreeToken ignores the `model` field and
  always serves the resident checkpoint.
- Alias `freetoken-local/active`: plugin `.opencode/plugin/freetoken-active.ts`
  queries the daemon (:1900 `/engine/status`) at opencode start and copies
  limit + name from the matching per-model entry onto the alias. Fail-silent.
- Therefore: **per-model entries are the source of truth**; keep their
  `limit.context` equal to the `-NumTokens` actually served.
