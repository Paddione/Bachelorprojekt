# opencode Agent-/Modell-Konfiguration — Uebersicht

> Generiert von `scripts/opencode-config-viz.sh` — **nie von Hand editieren**.
> Editier-Ziel ist die SSOT `.opencode/agent-models.jsonc`.

<!-- opencode-config-viz: extra-config=/mnt/c/Users/PatrickKorczewski/.config/opencode/opencode.jsonc -->

## README

- **SSOT:** `.opencode/agent-models.jsonc` — Provider, Modelle, Agenten.
- **Status-Taxonomie:** `ok` (SSOT-Eintrag ohne Stale-Marker) · `stale` (tot verifiziert / Limit-Drift) · `fehlt` (SSOT-Modell ohne Agenten-Referenz) · `unbelegt` (Referenz ohne SSOT-Eintrag).
- **nvim:** `nvim .opencode/agent-models.jsonc` — JSONC-Treesitter-Highlighting + `foldmethod=syntax` (`:set ft=jsonc foldmethod=syntax`).
- **Windows-Desktop-Config** (`C:\Users\PatrickKorczewski\.config\opencode\opencode.jsonc`): zeigt `llamacpp-local` auf den dekommissionierten `:18235`-Stack; `qwen38-220k` deklariert 114688 statt 205056 (SSOT), `qwen36-35b-a3b-262k` und `llamacpp-native/qwen3.8-27b` existieren nicht in der SSOT, `big-pickle` deklariert 1000000 statt 260000. Einmalige manuelle Korrektur erforderlich — kein Cross-OS-Schreibzugriff (T900162).
- **Reproduktion:** `bash scripts/opencode-config-viz.sh` regeneriert exakt dieses Dokument; die zusaetzlich validierte Config (`--config <pfad>`) wird als Markerzeile persistiert und beim Lauf ohne `--config` automatisch wiederverwendet.

## Provider

### llamacpp-local

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| Qwen3.8-27B | 131072/8192 | — | `ok` |

### llamacpp-qwen35

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| Qwen3.5-4B-MTP | 98304/8192 | — | `ok` |

### opencode-go

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| muse-spark-1.3-contributor | 1000000/131072 | — | `fehlt` |

### opencode-go-oai

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| muse-spark-1.3-contributor | 1000000/131072 | — | `ok` |

### opencode-zen

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| big-pickle | 260000/16384 | 2026-09-12 | `ok` |
| laguna-s-2.1-free | 256000/32000 | — | `ok` |
| muse-spark-1.3-contributor-free | 1000000/131072 | — | `fehlt` |

### opencode-zen-oai

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| muse-spark-1.3-contributor-free | 1000000/131072 | — | `fehlt` |

## Agenten

| Agent | Modell | Status |
|---|---|---|
| local | llamacpp-local/Qwen3.8-27B | `ok` |
| qwen35-mtp | llamacpp-qwen35/Qwen3.5-4B-MTP | `ok` |
| plan-worker-4b | llamacpp-qwen35/Qwen3.5-4B-MTP | `ok` |
| plan-worker-self | llamacpp-local/Qwen3.8-27B | `ok` |
| reviewer | llamacpp-local/Qwen3.8-27B | `ok` |
| exe-muse | opencode-go-oai/muse-spark-1.3-contributor | `ok` |
| big-pickle | opencode-zen/big-pickle | `ok` |
| ox-alpha-free | opencode-zen/laguna-s-2.1-free | `ok` |
| ox-alpha | opencode-zen/laguna-s-2.1-free | `ok` |
| glimmer-primary | llamacpp-local/Qwen3.8-27B | `ok` |

## Zusatz-Config: /mnt/c/Users/PatrickKorczewski/.config/opencode/opencode.jsonc

> Gegen die SSOT validiert; Abweichungen sind als `stale`/`unbelegt` markiert.

### llamacpp-local

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| hauhau-qwen36 | 131072/8192 | — | `unbelegt` |
| gemma12-vision | 262144/8192 | — | `unbelegt` |
| qwen38-220k | 114688/8192 | — | `unbelegt` |
| qwen36-35b-a3b-262k | 262144/8192 | — | `unbelegt` |

### freetoken-local

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| Qwen3.6-35B-A3B-NVFP4 | 200000/8192 | — | `unbelegt` |

### opencode-go

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|

### opencode-zen

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| big-pickle | 1000000/16384 | 260000 | `stale` (Limit-Drift) |
| laguna-s-2.1-free | 256000/32000 | 256000 | `ok` |

### lmstudio

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| qwen3.5-9b@q4_k_xl | 140000/8192 | — | `unbelegt` |
| qwen3.5-9b@q4_k_m | 48000/8192 | — | `unbelegt` |
| qwen3.5-9b@iq4_xs | 260000/8192 | — | `unbelegt` |
| qwen3-14b@q4_k_m | 32768/8192 | — | `unbelegt` |
| google/gemma-4-12b-qat | 180000/8192 | — | `unbelegt` |
| gemma-4-12b-agentic-fable5-composer2.5-v2-3.5x-tau2@q4_k_m | 150000/8192 | — | `unbelegt` |
| gemma-4-e2b@ud-q4_k_xl | 16384/4096 | — | `unbelegt` |
| qwen3.5-4b@q6_k | 32768/4096 | — | `unbelegt` |

### llamacpp-native

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| qwen3.8-27b | 85760/8192 | — | `unbelegt` |

### opencode

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|

### alibaba-token-plan

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|

### huggingface

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|

### openrouter

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|

### Agenten

| Agent | Modell | Status |
|---|---|---|
| qwen38 | llamacpp-native/qwen3.8-27b | `unbelegt` |
| qwen-cloud | freetoken-local/Qwen3.6-35B-A3B-NVFP4 | `unbelegt` |
| qwen38-primary | llamacpp-native/qwen3.8-27b | `unbelegt` |
| deepseek-helper-alibaba | freetoken-local/Qwen3.6-35B-A3B-NVFP4 | `unbelegt` |
| deepseek-pro-alibaba | freetoken-local/Qwen3.6-35B-A3B-NVFP4 | `unbelegt` |
| orchestrator | opencode/muse-spark-1.3-contributor-free | `unbelegt` |
| alibaba-primary | freetoken-local/Qwen3.6-35B-A3B-NVFP4 | `unbelegt` |
| big-pickle | opencode-zen/big-pickle | `ok` |
| ox-alpha-free | opencode-zen/laguna-s-2.1-free | `ok` |
| ox-alpha | opencode-zen/laguna-s-2.1-free | `ok` |
| compaction | (kein model) | `unbelegt` |
| muse | opencode-go/muse-spark-1.3-contributor | `ok` |
| general | opencode-go/muse-spark-1.3-contributor | `ok` |
| explore | opencode-go/muse-spark-1.3-contributor | `ok` |
