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
| Qwen3.6-35B-A3B-NVFP4 | 200000/8192 | — | `ok` |

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

## Agenten

| Agent | Modell | Status |
|---|---|---|
| local | llamacpp-local/Qwen3.6-35B-A3B-NVFP4 | `ok` |
| reviewer | llamacpp-local/Qwen3.6-35B-A3B-NVFP4 | `ok` |
| deepseek-helper-go | opencode-go/deepseek-v4-flash | `ok` |
| deepseek-helper | deepseek/deepseek-v4-flash | `ok` |
| deepseek-pro | opencode-go/deepseek-v4-pro | `ok` |
| deepseek-pro-direct | deepseek/deepseek-v4-pro | `ok` |
| deepseek-flash | opencode-go/deepseek-v4-flash | `ok` |
| deepseek-flash-direct | deepseek/deepseek-v4-flash | `ok` |
| orchestrator | opencode-zen/laguna-s-2.1-free | `ok` |
| big-pickle | opencode-zen/big-pickle | `ok` |
| ox-alpha-free | opencode-zen/laguna-s-2.1-free | `ok` |
| ox-alpha | opencode-zen/laguna-s-2.1-free | `ok` |
| qwen38-primary | llamacpp-local/Qwen3.6-35B-A3B-NVFP4 | `ok` |

## Zusatz-Config: /mnt/c/Users/PatrickKorczewski/.config/opencode/opencode.jsonc

> Gegen die SSOT validiert; Abweichungen sind als `stale`/`unbelegt` markiert.

### llamacpp-local

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| hauhau-qwen36 | 131072/8192 | — | `unbelegt` |
| gemma12-vision | 262144/8192 | — | `unbelegt` |
| qwen38-220k | 114688/8192 | — | `unbelegt` |
| qwen36-35b-a3b-262k | 262144/8192 | — | `unbelegt` |

### alibaba-intl

| Modell | Limit (ctx/output) | SSOT-Limit | Status |
|---|---|---|---|
| qwen3.8-max | 131072/8192 | — | `unbelegt` |
| deepseek-v4-flash-0731 | 131072/8192 | — | `unbelegt` |
| deepseek-v4-pro | 131072/16384 | — | `unbelegt` |

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

### Agenten

| Agent | Modell | Status |
|---|---|---|
| qwen38 | llamacpp-native/qwen3.8-27b | `unbelegt` |
| qwen-cloud | alibaba-intl/qwen3.8-max | `unbelegt` |
| qwen38-primary | llamacpp-native/qwen3.8-27b | `unbelegt` |
| deepseek-helper | deepseek/deepseek-v4-flash | `ok` |
| deepseek-helper-go | opencode-go/deepseek-v4-flash | `ok` |
| deepseek-helper-alibaba | alibaba-intl/deepseek-v4-flash-0731 | `unbelegt` |
| deepseek-pro | opencode-go/deepseek-v4-pro | `ok` |
| deepseek-pro-direct | deepseek/deepseek-v4-pro | `ok` |
| deepseek-pro-alibaba | alibaba-intl/deepseek-v4-pro | `unbelegt` |
| deepseek-flash | opencode-go/deepseek-v4-flash | `ok` |
| deepseek-flash-direct | deepseek/deepseek-v4-flash | `ok` |
| orchestrator | opencode-zen/laguna-s-2.1-free | `ok` |
| alibaba-primary | alibaba-intl/qwen3.8-max | `unbelegt` |
| big-pickle | opencode-zen/big-pickle | `ok` |
| ox-alpha-free | opencode-zen/laguna-s-2.1-free | `ok` |
| ox-alpha | opencode-zen/laguna-s-2.1-free | `ok` |
