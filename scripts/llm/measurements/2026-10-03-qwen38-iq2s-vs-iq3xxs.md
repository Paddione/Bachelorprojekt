# Qwen3.8-27B GSQ-RCO: IQ2_S-mtp vs. IQ3_XXS-mtp (2026-10-03)

Hardware: NVIDIA GeForce RTX 5070 Ti (16 GB VRAM, alone), llama.cpp `~/opt/llama-current` (Build e85e15c).
Port: `http://127.0.0.1:1919` (`qwen38-gsq-iq2s.service` / `qwen38-gsq-iq3xxs.service`).

---

## 1. Optimal Settings per Model

| Parameter | IQ2_S-mtp (Max Context) | IQ3_XXS-mtp (Max Quality) | Rationale |
|---|---|---|---|
| **Quantization Class** | GSQ-RCO IQ2_S (2.75 BPW) | GSQ-RCO IQ3_XXS (3.00 BPW) | IQ3_XXS gains +2.3% on LCB v6, +2.5% GPQA-D |
| **GGUF File** | `Qwen3.8-27B-GSQ-RCO-IQ2_S-mtp.gguf` (8.95 GiB) | `Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` (9.73 GiB) | MTP head included for speculative decoding |
| **Context Window (`-c`)** | **196,608** (196k tokens) | **153,600** (150k tokens) | Safely bounded below the 15.9 GB WSL spill barrier |
| **Slots / Unified KV** | `-np 1 -ub 512` | `-np 1 -ub 512` | `-ub > 512` wastes VRAM without prefill speed benefit |
| **KV Cache Quant** | `-ctk q4_0 -ctv q4_0 -fa on` | `-ctk q4_0 -ctv q4_0 -fa on` | FlashAttention with 4-bit KV cache |
| **Speculative Decoding** | `--spec-type draft-mtp --spec-draft-n-max 4` | `--spec-type draft-mtp --spec-draft-n-max 4` | Optimal trade-off between draft overhead & decode gain |
| **RAM Cache (`-cram`)** | `-cram 12288` (12 GB Host RAM) | `-cram 12288` (12 GB Host RAM) | Evicted 51k orchestrator context restores in 2.9s |
| **GPU Offload** | `-fit off -ngl 999` | `-fit off -ngl 999` | 100% layers in VRAM |

---

## 2. VRAM & Memory Footprint

| Metric | IQ2_S-mtp (`-c 196608`) | IQ3_XXS-mtp (`-c 153600`) | Headroom / Safety |
|---|---|---|---|
| **VRAM Allocated** | **15,439 MiB** | **15,059 MiB** | Both remain within the 16,303 MiB physical capacity |
| **WSL Silent Spill Margin** | ~460 MiB below spill ceiling | **~840 MiB below spill ceiling** | IQ3_XXS has larger headroom against spill |
| **Max Context without Spill** | 196,608 tokens | 153,600 tokens | IQ2_S wins by +43k tokens context capacity |

---

## 3. Benchmark Measurements (Side-by-Side)

Measured using `scripts/llm/bench_qwen38_comparison.py`:

| Benchmark Test | IQ2_S-mtp | IQ3_XXS-mtp | Winner |
|---|---|---|---|
| **Short Prompt Decode** | 101.4 t/s | **106.3 t/s** (+4.8%) | **IQ3_XXS** |
| **MTP Acceptance (Short)** | 61.3% | **66.2%** (+4.9%) | **IQ3_XXS** |
| **Prefill Speed (6,641 tokens)** | 1,330.0 t/s | **1,471.1 t/s** (+10.6%) | **IQ3_XXS** |
| **Decode Speed (6,641 tokens prefill)** | 88.5 t/s | **98.6 t/s** (+11.4%) | **IQ3_XXS** |
| **Reasoning Decode (Thinking enabled)** | **96.1 t/s** | 85.8 t/s | **IQ2_S** |
| **MTP Acceptance (Reasoning)** | **57.9%** | 47.2% | **IQ2_S** |
| **Structured JSON Accuracy** | Valid JSON schema | Valid JSON schema | Tie |
| **Orchestration Bench (2026-09-26)** | 13/15 | **15/15** (Perfect) | **IQ3_XXS** |
| **LiveCodeBench v6 (HF Leaderboard)** | 82.29% | **84.57%** (+2.28%) | **IQ3_XXS** |
| **GPQA-Diamond (HF Leaderboard)** | 86.36% | **88.89%** (+2.53%) | **IQ3_XXS** |

---

## 4. How to Switch Services

Both services are installed in `~/.config/systemd/user/`:

```bash
# To run IQ3_XXS (recommended for coding, orchestration, reasoning):
systemctl --user stop qwen38-gsq-iq2s
systemctl --user start qwen38-gsq-iq3xxs

# To run IQ2_S (if 196k context is needed):
systemctl --user stop qwen38-gsq-iq3xxs
systemctl --user start qwen38-gsq-iq2s
```
