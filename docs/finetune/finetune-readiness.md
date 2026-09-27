# Finetune-Readiness (agent-bench-Modellpool)

Stand: 2026-09-27. Je Familie des Bench-Pools (`scripts/llm/agent-bench/models.json`):
Was ein LoRA-Training braucht — fehlende Angaben als `Lücke` markiert (M143).
Korpusformat aus dem Bench-Export (`bench.mjs export-corpus`): `sft.jsonl`
(`{ messages, tools, meta }`, beste saubere Trajektorie je Variante/Rolle),
`preferences.jsonl` (`{ prompt_messages, chosen, rejected, meta }`), `gaps.json`.

| Familie | Basis-Checkpoint (HF-ID) | Chat-Template mit `{% generation %}` | Precision (`scripts/finetune/train.py`) | Trainingsort | Export-Ziel | Vision |
|---|---|---|---|---|---|---|
| Qwen3.5-4B | `Lücke` (Serving nutzt `unsloth/Qwen3.5-4B-MTP-GGUF` per HF-Cache-Pfad in `scripts/llm/qwen35-mtp.service`; 16-bit-Trainingsbasis nicht gepinnt) | `Lücke` (nur Verfahren: `template_guard.py`, kein gepatchtes Template je Familie) | 16-bit LoRA (Default; QLoRA nur mit `--allow-qwen35-4bit`) | lokal (`task finetune:train`, `GPU_MODE=single\|balanced`) oder HF Jobs (`task finetune:hf-jobs:train`, `FLAVOR=l4x1`) | GGUF via `scripts/finetune/export_gguf.py` (`task finetune:gguf-export`) | n/a (Textmodell; `train_vision.py` kennt nur Qwen3-VL) |
| Qwen3.8-27B | `Lücke` (lokal nur GGUF `~/models/Qwen3.8-27B/Qwen3.8-27B-UD-Q4_K_M.gguf`; 16-bit-Basis nicht gepinnt) | `Lücke` (wie oben) | 4-bit QLoRA (Default fuer Nicht-Qwen3.5; `PRECISION=auto\|4bit\|16bit`) | lokal oder HF Jobs (wie oben) | GGUF via `export_gguf.py` | n/a (Textmodell; `train_vision.py` kennt nur Qwen3-VL) |
| Gemma-4-12B | `Lücke` (Serving-Quant `unsloth/gemma-4-12b-it-NVFP4` unter `~/models/gemma-4-12b-it-NVFP4`; 16-bit-Basis nicht gepinnt) | `Lücke` (wie oben; `scripts/llm/templates/gemma4-26b-tools.jinja` nutzt nur `add_generation_prompt`, keinen `{% generation %}`-Marker) | 4-bit QLoRA (Default; `PRECISION` wie oben) | lokal oder HF Jobs (wie oben) | vLLM: `merged_16bit` + NVFP4-Requantisierung — `Lücke` (kein Skript im Repo); LoRA-Hot-Swap auf NVFP4-Basis: `Lücke (offen)` (siehe unten) | `Lücke` (`train_vision.py` bricht fuer Nicht-Qwen3-VL ab: `--model must identify Qwen3-VL`) |

## vLLM: LoRA auf NVFP4-Basis?

Geprueft am 2026-09-27 gegen das installierte vLLM 0.30.0 (`~/opt/vllm-nvfp4`).
Befehl:

```bash
V=~/opt/vllm-nvfp4/lib/python3.13/site-packages/vllm
grep -rn "LoRA is not supported\|not support LoRA\|LoRA with \|quantized.*LoRA\|LoRA.*quant" $V --include="*.py" | grep -vi test
```

Ergebnis: Kein explizites Verbot fuer LoRA auf NVFP4/FP4-Basis gefunden — die
Treffer betreffen nur MoE-Sonderfaelle (`fused_moe.py`: non-gated MoE,
Fused-MoE-EP) und V1-Runner ohne LoRA-Pfad. Gemma-4-12B ist dicht (kein MoE),
faellt also unter keinen dieser Gates. Ob der ModelOpt-FP4-Kernel den
LoRA-Pfad zur Laufzeit traegt, beweist nur ein GPU-Lauf mit `--enable-lora`
und geladenem Adapter — der steht aus (GPU belegt, siehe Messbericht).
Default-Annahme bis dahin: Hot-Swap riskant; Export-Ziel fuer vLLM ist
`merged_16bit` plus NVFP4-Requantisierung (dafuer fehlt ebenfalls das Skript:
`Lücke`, siehe Tabelle).

## Naechste Schritte (Folge-Change, kein Teil von T900561)

1. 16-bit-Basis je Familie pinnen (HF-ID) und lokal ablegen.
2. Gepatchtes Template je Familie erzeugen und per `template_guard.py`
   byte-gleich pruefen (`task finetune:template-check`).
3. NVFP4-Requant-Skript (ModelOpt) oder LoRA-Hot-Swap-Beweis auf der 5070 Ti.
4. Gemma-Vision-Training klaeren (`train_vision.py` kennt nur Qwen3-VL).
