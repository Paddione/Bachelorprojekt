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
| hauhau-qwen36 | 131072/8192 | — | `stale` (2026-09-12) |
| gemma12-vision | 262144/8192 | — | `stale` (2026-09-12) |
| qwen38-220k | 205056/8192 | — | `ok` |

### freetoken-local

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| Qwen3.6-35B-A3B-NVFP4 | 200000/8192 | 2026-08-23 (Basis) | `fehlt` |
| gpt-oss-20b | 65536/8192 | 2026-08-23 (Basis) | `fehlt` |
| Gemma-4-26B-A4B-NVFP4 | 32768/8192 | 2026-08-23 (Basis) | `fehlt` |
| active | 131072/8192 | 2026-08-23 (Basis) | `ok` |
| active-thinking | 200000/16384 | 2026-08-23 (Basis) | `ok` |
| active-fast | 85000/8192 | 2026-08-23 (Basis) | `ok` |

### alibaba-intl

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| qwen3.8-max | 131072/8192 | — | `ok` |
| deepseek-v4-flash-0731 | 131072/8192 | — | `ok` |
| deepseek-v4-pro | 131072/16384 | — | `ok` |

### opencode-go

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| deepseek-v4-flash | 1000000/8192 | — | `ok` |
| deepseek-v4-pro | 1000000/16384 | — | `ok` |

### opencode-zen

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| big-pickle | 260000/16384 | 2026-09-12 | `ok` |
| laguna-s-2.1-free | 256000/32000 | — | `ok` |

### deepseek

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| deepseek-v4-flash | 1000000/8192 | — | `ok` |
| deepseek-v4-pro | 1000000/16384 | — | `ok` |

### lmstudio

| Modell | Limit (ctx/output) | Messung | Status |
|---|---|---|---|
| qwen3.5-9b@q4_k_xl | 140000/8192 | — | `fehlt` |
| qwen3.5-9b@q4_k_m | 48000/8192 | — | `fehlt` |
| qwen3.5-9b@iq4_xs | 260000/8192 | — | `fehlt` |
| qwen3-14b@q4_k_m | 32768/8192 | — | `fehlt` |
| google/gemma-4-12b-qat | 180000/8192 | — | `fehlt` |
| gemma-4-12b-agentic-fable5-composer2.5-v2-3.5x-tau2@q4_k_m | 150000/8192 | — | `fehlt` |
| gemma-4-e2b@ud-q4_k_xl | 16384/4096 | — | `fehlt` |
| qwen3.5-4b@q6_k | 32768/4096 | — | `fehlt` |

## Agenten

| Agent | Modell | Status |
|---|---|---|
| gptoss | freetoken-local/active | `ok` |
| devstral | freetoken-local/active | `ok` |
| gemma | freetoken-local/active | `ok` |
| gemma12 | freetoken-local/active | `ok` |
| qwen38 | freetoken-local/active | `ok` |
| qwen-cloud | alibaba-intl/qwen3.8-max | `ok` |
| reviewer | freetoken-local/active | `ok` |
| freetoken-primary | freetoken-local/active | `ok` |
| freetoken-thinking | freetoken-local/active-thinking | `ok` |
| freetoken-fast-1 | freetoken-local/active-fast | `ok` |
| freetoken-fast-2 | freetoken-local/active-fast | `ok` |
| freetoken-fast-3 | freetoken-local/active-fast | `ok` |
| deepseek-helper | deepseek/deepseek-v4-flash | `ok` |
| deepseek-helper-go | opencode-go/deepseek-v4-flash | `ok` |
| deepseek-helper-alibaba | alibaba-intl/deepseek-v4-flash-0731 | `ok` |
| deepseek-pro | opencode-go/deepseek-v4-pro | `ok` |
| deepseek-pro-direct | deepseek/deepseek-v4-pro | `ok` |
| deepseek-pro-alibaba | alibaba-intl/deepseek-v4-pro | `ok` |
| deepseek-flash | opencode-go/deepseek-v4-flash | `ok` |
| deepseek-flash-direct | deepseek/deepseek-v4-flash | `ok` |
| orchestrator | opencode-zen/laguna-s-2.1-free | `ok` |
| alibaba-primary | alibaba-intl/qwen3.8-max | `ok` |
| big-pickle | opencode-zen/big-pickle | `ok` |
| ox-alpha-free | opencode-zen/laguna-s-2.1-free | `ok` |
| ox-alpha | opencode-zen/laguna-s-2.1-free | `ok` |
| qwen38-primary | llamacpp-local/qwen38-220k | `ok` |

## Zusatz-Config: /mnt/c/Users/PatrickKorczewski/.config/opencode/opencode.jsonc

> Gegen die SSOT validiert; Abweichungen sind als `stale`/`unbelegt` markiert.

### llamacpp-local

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| hauhau-qwen36 | 131072/8192 | 131072 | `stale` (SSOT-stale) |
| gemma12-vision | 262144/8192 | 262144 | `stale` (SSOT-stale) |
| qwen38-220k | 114688/8192 | 205056 | `stale` (Limit-Drift) |
| qwen36-35b-a3b-262k | 262144/8192 | — | `unbelegt` |

### alibaba-intl

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| qwen3.8-max | 131072/8192 | 131072 | `ok` |
| deepseek-v4-flash-0731 | 131072/8192 | 131072 | `ok` |
| deepseek-v4-pro | 131072/16384 | 131072 | `ok` |

### opencode-go

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| deepseek-v4-flash | 1000000/8192 | 1000000 | `ok` |
| deepseek-v4-pro | 1000000/16384 | 1000000 | `ok` |

### opencode-zen

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| big-pickle | 1000000/16384 | 260000 | `stale` (Limit-Drift) |
| laguna-s-2.1-free | 256000/32000 | 256000 | `ok` |

### deepseek

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| deepseek-v4-flash | 1000000/8192 | 1000000 | `ok` |
| deepseek-v4-pro | 1000000/16384 | 1000000 | `ok` |

### lmstudio

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| qwen3.5-9b@q4_k_xl | 140000/8192 | 140000 | `ok` |
| qwen3.5-9b@q4_k_m | 48000/8192 | 48000 | `ok` |
| qwen3.5-9b@iq4_xs | 260000/8192 | 260000 | `ok` |
| qwen3-14b@q4_k_m | 32768/8192 | 32768 | `ok` |
| google/gemma-4-12b-qat | 180000/8192 | 180000 | `ok` |
| gemma-4-12b-agentic-fable5-composer2.5-v2-3.5x-tau2@q4_k_m | 150000/8192 | 150000 | `ok` |
| gemma-4-e2b@ud-q4_k_xl | 16384/4096 | 16384 | `ok` |
| qwen3.5-4b@q6_k | 32768/4096 | 32768 | `ok` |

### llamacpp-native

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| qwen3.8-27b | 85760/8192 | — | `unbelegt` |

### Agenten

| Agent | Modell | Status |
|---|---|---|
| qwen38 | llamacpp-native/qwen3.8-27b | `unbelegt` |
| qwen-cloud | alibaba-intl/qwen3.8-max | `ok` |
| qwen38-primary | llamacpp-native/qwen3.8-27b | `unbelegt` |
| deepseek-helper | deepseek/deepseek-v4-flash | `ok` |
| deepseek-helper-go | opencode-go/deepseek-v4-flash | `ok` |
| deepseek-helper-alibaba | alibaba-intl/deepseek-v4-flash-0731 | `ok` |
| deepseek-pro | opencode-go/deepseek-v4-pro | `ok` |
| deepseek-pro-direct | deepseek/deepseek-v4-pro | `ok` |
| deepseek-pro-alibaba | alibaba-intl/deepseek-v4-pro | `ok` |
| deepseek-flash | opencode-go/deepseek-v4-flash | `ok` |
| deepseek-flash-direct | deepseek/deepseek-v4-flash | `ok` |
| orchestrator | opencode-zen/laguna-s-2.1-free | `ok` |
| alibaba-primary | alibaba-intl/qwen3.8-max | `ok` |
| big-pickle | opencode-zen/big-pickle | `ok` |
| ox-alpha-free | opencode-zen/laguna-s-2.1-free | `ok` |
| ox-alpha | opencode-zen/laguna-s-2.1-free | `ok` |
