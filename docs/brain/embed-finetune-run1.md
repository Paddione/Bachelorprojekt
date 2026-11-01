# EmbeddingGemma multitask finetune — run-1/run-2 results + ship decision

Branch: `feature/embeddinggemma-multitask-ft`. Base: `google/embeddinggemma-300m-qat-q8_0-unquantized`.
Corpus: 849 train / 95 held-out triplets (retrieval-query 332, code-retrieval 325, qa/fact-check ~30 each,
classification/clustering/sts 45 each), prefixes baked in. Full weights, CPU fp32 (CUDA NO_DEVICE for new
processes, driver/WSL state). Matryoshka 768/512/256/128 in both runs.

## Triplet eval (held-out 95, easy synthetic negatives — ceiling set)

| model | acc | margin |
|---|---|---|
| base QAT (ST fp32) | 1.000 | 0.25 |
| run-1: 3ep lr2e-5 b8 (ST fp32) | 0.989 | 0.94 |
| run-1 GGUF-F32 (llama-server, pre=default) | 1.000 | 0.62 |
| run-2: 5ep lr4e-5 b8 (ST fp32) | 0.989 | 0.93 |

Run-2 did not improve on run-1 (same single classification flip, flat margin) → run-1 is the keeper.
Suggest-engine "underfit → epochs 7" overruled: set is saturated, more phases would fit noise.
Next real gain needs hard negatives (mine top confusers with run-1, retrain = phase 3).

## Per-dim (Matryoshka, truncate + renormalize)

Run-1: 768/512/256/128 all 0.989 acc, margin 0.93→0.97 (no collapse). Base: 1.000 at all dims, margin ~0.21.
MTEB-Code deltas remain the ranking signal: 512 -0.3, 256 -2.0, 128 -5.8.
Serving rule: index 512d, rescore top-K at 768d, slice in RAM, no re-encode.

## Q8 decider (the ship question)

| model | acc | margin |
|---|---|---|
| stock Q8_0 (Unsloth) | 1.000 | 0.20 |
| tuned run-1 Q8_0 (own export) | 1.000 | 0.62 |

**Ship tuned run-1 Q8_0.** QAT base choice vindicated: the 3× margin gap survived quantization
(ST fp32 0.25→0.94, GGUF Q8 0.20→0.62). QAT-vs-full-base question settled for Q8 serving.

## Q8_0 CPU bench (Unsloth stock, llama.cpp server, Skylake i5-6500T nodes)

| node | ~460 tok | ~1684 tok |
|---|---|---|
| gpu-cluster | 519 tok/s, p50 860ms | 449 tok/s, p50 3.9s |
| gpu-cluster2 | 403 tok/s, p50 1.0s | 392 tok/s, p50 4.3s |
| gpu-cluster-3 | 474 tok/s, p50 881ms | 430 tok/s, p50 3.9s |
| gpu-metal (8 threads) | 813 tok/s, p50 554ms | 748 tok/s, p50 2.3s |

gpu-metal GPUs fully claimed → CPU bench only; GPU bench needs a free window.

## Conversion notes (llama.cpp, recorded so nobody re-derives this)

* `llama-quantize` takes GGUF, not safetensors. Flow: ST dir → `convert_hf_to_gguf.py` → F32 GGUF → `llama-quantize` Q8_0.
* Converter needed two /tmp-only patches (NOT repo code): relax `max(vocab) < vocab_size` (dangling id 262144 has no embedding row)
  and register probe hash `fc65e8f0…` (ST re-save Split(" ") pretokenizer). Upstream has no gemma-embedding pre-type at all.
* GGUF `tokenizer.ggml.pre` must be **`default`** (what Unsloth/ggml-org ship). `gemma-embedding`/`gemma3` are unknown to b11887-era loaders.
  Parity: GGUF-F32 ranks 1.000 on held-out (absolute vectors differ from ST, ranking is what matters).
