# gaslamp.md — Roadbook for gemma_26b_qat_finetune
# Powered by Gaslamp · https://gaslamp.dev

---

## 1. Goal

- **Task:** Versatile coding and reasoning model for AI factory slots.
- **Success looks like:** The model successfully learns to output its reasoning process before generating high-quality code.

---

## 2. Method

**Chosen:** SFT
**Why for this project:** The `OpenThoughts-114k` dataset already contains verified, high-quality reasoning traces. SFT is perfect for teaching the model this format without the complex overhead of GRPO reward functions.

---

## 3. Model

**Chosen:** `unsloth/gemma-2-27b-bnb-4bit`
**Why for this project:** Highest capability open model in its weight class, optimized specifically for logic and code.

**Quantization:** 4-bit QLoRA
**Why:** It is the only way to fit a 27B parameter model onto a single 16 GB 5070TI for training.

**LoRA config:**
- Rank (r): 16
- Alpha (α): 16
- Target modules: q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj
- Dropout: 0

---

## 4. Data

**Source:** `open-thoughts/OpenThoughts-114k`
**Format:** SFT (Supervised Fine-Tuning) with chat format.
**Size:** 5,000 samples (subset for testing).

**Key formatting decision:**
Gemma does not natively support `system` prompts in its chat template. We wrote a custom map function in `train.py` to seamlessly merge any system instructions into the very first user message before applying the chat template.

---

## 5. Environment

- **Hardware:** NVIDIA GeForce RTX 5070 Ti (16GB VRAM)
- **Backend:** unsloth
- **Python:** 3.11.15
- **venv path:** .venv/

---

## 6. Hyperparameters

| Parameter | Value | Why |
|-----------|-------|-----|
| Learning rate | 2e-4 | Standard for LoRA fine-tuning |
| Batch size | 1 | Strictly required to prevent CUDA OOM on a 16GB card for a 27B model |
| Gradient accumulation | 8 | Combines 8 mini-batches to achieve an effective batch size of 8 |
| Effective batch size | 8 | Standard stability threshold |
| Steps / epochs | 60 steps | Proof-of-concept run |

---

## 9. File Inventory

| File | Source | Role |
|------|--------|------|
| `train.py` | copied from `scripts/unsloth_sft_example.py` | Training script (modified for batch size 1 and Gemma chat templates) |
| `project_brief.md` | custom | Phase 1 requirements |
| `data_strategy.md` | custom | Phase 2 data approach |
| `gaslamp_callback.py` | copied from `scripts/gaslamp_callback.py` | Live dashboard callback (NVIDIA/TRL) |
| `templates/dashboard.html`| copied from `templates/dashboard.html` | Web dashboard UI |

---

## 11. Workarounds & Critical Notes

**VRAM Allocation (CPU Offloading Bug):**
The Hugging Face `transformers` library attempts to offload layers to the CPU if memory gets too close to 16GB, which crashes Unsloth. 
*Fix:* Hardcode `device_map="cuda:0"` inside `FastLanguageModel.from_pretrained`.

**CUDA OOM during Forward Pass:**
A 27B model on 16GB VRAM will OOM during the first training step if the batch size is 2.
*Fix:* Hardcode `per_device_train_batch_size=1`, `gradient_accumulation_steps=8`, and `max_seq_length=1024`.

**Gemma Chat Templates:**
Gemma models throw `jinja2.exceptions.TemplateError` if a `system` prompt is passed.
*Fix:* Append the system string to the front of the `content` of the first `user` role message.
