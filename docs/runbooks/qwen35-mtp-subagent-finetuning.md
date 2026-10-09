# Runbook: End-to-End Fine-Tuning & Deployment for Qwen3.5-4B-MTP Subagent

> **RETIRED 2026-10-03:** The `qwen35-mtp` rail (Qwen3.5-4B-MTP, :1920) has been retired — production
> is the Qwen3.5-4B-MTP UD-Q4_K_XL worker pool, Windows-native llama.cpp on :8080, see
> `.opencode/agent-models.jsonc` (`llamacpp-qwen3`) and `scripts/llm/register-qwen35-4b-autostart.ps1`.
> This runbook remains as the fine-tuning lifecycle reference; deployment now targets the :8080 pool
> (no systemd unit — copy the GGUF and point the Windows start script at it).

## 1. Overview & Objectives

This runbook documents the complete lifecycle to produce an optimized, specialized fine-tune of **Qwen3.5-4B** with **MTP (Multi-Token Prediction)** speculative decoding.

### Role & Topology
* **Target Hardware:** Dedicated NVIDIA RTX 3060 Ti (8 GB VRAM) running via `llama-server` on `127.0.0.1:1920`.
* **Consumer Agents:**
  * Primary Cloud Orchestrator: `opencode-go-oai/muse-spark-1.3-contributor` (inside Meta Muse Code 1.4 / OpenCode).
  * Local Orchestrators: `llamacpp-local/Muse-Glimmer-30B` (RTX 5070 Ti on `:1919`) and `ISTA-DASLab/Qwen3.8-27B-GSQ-RCO-GGUF`.
  * CLI Dispatch: `bash scripts/vda.sh oracle '<goal>'` and autonomous autopilot loops.
* **Subagent Purpose (`qwen35-mtp`):**
  * Fast, text-only subagent for bounded research, file examination, and structured implementation packets.
  * Surgical code edits (`edit` tool allowed, `write` denied).
  * Strict adherence to bounded token budgets, tool schemas (MCP servers), and deterministic return formats.

### Core Problems Addressed
1. **Model/Prompt Mismatch:** The default subagent configuration borrowed prompts intended for Muse Glimmer/Spark, causing architectural and behavioral confusion.
2. **Tool-Calling Protocol Incompatibility:** Muse models use OpenAI response schemas or custom delimiters, while Qwen requires ChatML with `<tool_call>` syntax.
3. **MTP Speculative Decoding Stability:** Quantized draft prediction heads require calibrated draft token lengths (`--spec-draft-n-max 2`) and clean training loss masking.

---

## 2. Phase 0: Baseline Evaluation & Harness Alignment

Before training, establish a clean evaluation baseline on the base model by removing prompt interference.

### 2.1 Decouple Subagent Prompt
Do not reuse [`.opencode/prompts/local-subagent.md`](file:///home/patrick/Bachelorprojekt/.opencode/prompts/local-subagent.md). Create a dedicated prompt file [`.opencode/prompts/qwen35-subagent.md`](file:///home/patrick/Bachelorprojekt/.opencode/prompts/qwen35-subagent.md):

```markdown
You are `qwen35-mtp`, a fast local execution subagent running on Qwen3.5-4B via llama.cpp (:1920).
You receive bounded task packets dispatched by the primary orchestrator.

## Execution Rules
- Execute tool calls strictly using the provided function calling schema (<tool_call>).
- Never narrate steps before calling tools.
- NEVER fabricate execution results. Report exact tool output or error strings.
- You have access to: `read`, `edit`, `glob`, `grep`, `bash`.
- The `write` tool is denied; make surgical edits with `edit`.
- Conclude every dispatch with a structured completion report:
  STATUS: <DONE | FAILED | BLOCKED>
  FILES_CHANGED: <list of files modified>
  FINDINGS: <concise summary of results>
```

Update [`.opencode/agent-models.jsonc`](file:///home/patrick/Bachelorprojekt/.opencode/agent-models.jsonc#L266-L275) to reference this prompt:
```jsonc
"qwen35-mtp": {
  "description": "Fast text-only local subagent: Qwen3.5-4B MTP via llama.cpp :1920 on RTX 3060 Ti.",
  "mode": "subagent",
  "model": "llamacpp-qwen35/Qwen3.5-4B-MTP",
  "prompt": "{file:./prompts/qwen35-subagent.md}",
  "temperature": 0.2,
  "steps": 40,
  "permission": { "edit": "allow", "write": "deny", "bash": "allow", "task": "deny" }
}
```

---

## 3. Phase 1: Training Dataset Architecture & Synthesis

An effective 4B subagent requires high-signal, multi-turn trajectories focused on tool execution and task reporting.

### 3.1 Target Data Schema (Qwen ChatML)
Every training trajectory must be formatted in standard ChatML with Qwen tool call delimiters:

```xml
<|im_start|>system
You are a specialized execution subagent. Output tool calls inside <tool_call> tags.
Tools available:
[{"name": "read_file", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
 {"name": "edit_file", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "target": {"type": "string"}, "replacement": {"type": "string"}}, "required": ["path", "target", "replacement"]}}]<|im_end|>
<|im_start|>user
[DISPATCH_PACKET]
Ticket: T900380
Goal: Fix port reference in scripts/llm/qwen35-mtp.service
Budget: 4000 tokens
Constraints: Surgical edit only, verify syntax.<|im_end|>
<|im_start|>assistant
<tool_call>
{"name": "read_file", "arguments": {"path": "scripts/llm/qwen35-mtp.service"}}
</tool_call><|im_end|>
<|im_start|>tool
<tool_response>
[file content returned here]
</tool_response><|im_end|>
<|im_start|>assistant
<tool_call>
{"name": "edit_file", "arguments": {"path": "scripts/llm/qwen35-mtp.service", "target": "--port 1919", "replacement": "--port 1920"}}
</tool_call><|im_end|>
<|im_start|>tool
<tool_response>
{"status": "success", "lines_replaced": 1}
</tool_response><|im_end|>
<|im_start|>assistant
STATUS: DONE
FILES_CHANGED:
- scripts/llm/qwen35-mtp.service
FINDINGS: Replaced incorrect port reference with 1920. Verified file structure intact.<|im_end|>
```

### 3.2 Dataset Composition
**Data source (T900750):** Agent traces from all harnesses are exported daily to
`s3://langfuse/exports/observations/<YYYY-MM-DD>.jsonl` on devmesh (CronJob `langfuse-export`,
one Langfuse observation per line with input and output).
Collect or synthesize **1,500 – 3,000 trajectories** with the following distribution:
1. **MCP & Tool Calling (40%):** Valid tool JSON generation, multi-turn execution, handling tool error outputs (e.g. non-existent files, syntax error recovery).
2. **Orchestrator Protocol & Status Reporting (25%):** Parsing orchestrator dispatch packets, respecting budgets, returning clean `STATUS / FILES_CHANGED / FINDINGS` summaries without conversational chatter.
3. **Surgical Code Modifications (20%):** Precise diffs and `edit` tool replacements (exact whitespace matching).
4. **Negative Samples & Tool Rejections (15%):** Refusing to execute out-of-scope tasks, refusing whole-file rewrites when only `edit` is allowed, terminating gracefully when context budget is exhausted.

---

## 4. Phase 2: Environment Setup & Base Weights

### 4.1 Prerequisites
Train on a machine with CUDA support (e.g., RTX 5070 Ti or cloud GPU).
Install Unsloth and training dependencies in an isolated virtual environment:

```bash
python3 -m venv .venv-unsloth
source .venv-unsloth/bin/activate
pip install --upgrade pip
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
pip install --upgrade --no-cache-dir trl peft accelerate datasets bitsandbytes
```

### 4.2 Source Weights
Do **not** use the GGUF file as a training base. Use the official Hugging Face Safetensors repo:
* Base Model: `Qwen/Qwen3.5-4B-Instruct` (or `unsloth/Qwen3.5-4B-Instruct-bnb-4bit` for memory-constrained setups).

---

## 5. Phase 3: Fine-Tuning Recipe with Unsloth

Create the training script `scripts/llm/train_qwen35_subagent.py`:

```python
#!/usr/bin/env python3
"""
train_qwen35_subagent.py
Fine-tunes Qwen3.5-4B on orchestrator dispatch and MCP tool execution.
"""
import torch
from datasets import load_dataset
from transformers import TrainingArguments
from trl import SFTTrainer, DataCollatorForCompletionOnlyLM
from unsloth import FastLanguageModel

# Configuration
MAX_SEQ_LENGTH = 8192
OUTPUT_DIR = "outputs/qwen35-4b-dispatch"
BASE_MODEL = "unsloth/Qwen3.5-4B-Instruct-bnb-4bit"

# 1. Load model in 4-bit QLoRA
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=BASE_MODEL,
    max_seq_length=MAX_SEQ_LENGTH,
    dtype=None,             # Auto-detect (bfloat16 on Ampere/Ada/Blackwell)
    load_in_4bit=True,
)

# 2. Add LoRA Adapters
# Target all linear projections for high tool-calling and instruction fidelity
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    lora_alpha=16,
    lora_dropout=0.0,       # Optimized by Unsloth kernel
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=3407,
)

# 3. Load & Format Dataset
# Dataset JSON containing 'conversations' lists formatted with roles: system, user, assistant, tool
raw_dataset = load_dataset("json", data_files="data/subagent_dispatch_dataset.jsonl", split="train")

def format_prompts(batch):
    texts = []
    for conv in batch["conversations"]:
        formatted = tokenizer.apply_chat_template(
            conv,
            tokenize=False,
            add_generation_prompt=False,
        )
        texts.append(formatted)
    return {"text": texts}

dataset = raw_dataset.map(format_prompts, batched=True)

# 4. Mask User Prompts from Loss Calculation (Train only on Assistant completions)
response_template = "<|im_start|>assistant\n"
collator = DataCollatorForCompletionOnlyLM(
    response_template=response_template,
    tokenizer=tokenizer,
)

# 5. Training Arguments
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    lr_scheduler_type="cosine",
    warmup_ratio=0.05,
    num_train_epochs=3,
    fp16=not torch.cuda.is_bf16_supported(),
    bf16=torch.cuda.is_bf16_supported(),
    logging_steps=5,
    save_strategy="epoch",
    optim="adamw_8bit",
    weight_decay=0.01,
    seed=3407,
)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=MAX_SEQ_LENGTH,
    data_collator=collator,
    dataset_num_proc=2,
    packing=False,          # Set to False when using DataCollatorForCompletionOnlyLM
    args=training_args,
)

# 6. Execute Training
trainer.train()

# 7. Save Adapter & Merged 16-bit Model
ADAPTER_PATH = f"{OUTPUT_DIR}/lora_adapter"
MERGED_PATH = f"{OUTPUT_DIR}/merged_16bit"

model.save_pretrained(ADAPTER_PATH)
tokenizer.save_pretrained(ADAPTER_PATH)

print("Merging LoRA weights into 16-bit base model...")
model.save_pretrained_merged(MERGED_PATH, tokenizer, save_method="merged_16bit")
print(f"Merged model saved to {MERGED_PATH}")
```

---

## 6. Phase 4: GGUF Quantization & MTP Draft Head Export

### 6.1 Export to GGUF
From the merged 16-bit model, export to GGUF using Unsloth or `llama.cpp`'s converter:

```python
# Direct export via Unsloth
model.save_pretrained_gguf(
    "outputs/qwen35-4b-dispatch-gguf",
    tokenizer,
    quantization_method="q4_k_m", # Or q4_k_xl
)
```

Alternatively, use `llama.cpp`'s native conversion script to preserve custom quantization matrices:
```bash
python3 /path/to/llama.cpp/convert_hf_to_gguf.py \
    outputs/qwen35-4b-dispatch/merged_16bit \
    --outfile outputs/qwen35-4b-dispatch.f16.gguf \
    --outtype f16

/path/to/llama.cpp/build/bin/llama-quantize \
    outputs/qwen35-4b-dispatch.f16.gguf \
    outputs/Qwen3.5-4B-Dispatch-UD-Q4_K_XL.gguf \
    UD-Q4_K_XL
```

### 6.2 MTP Compatibility Note
If utilizing native MTP draft heads:
- The base model's core layers are modified by LoRA while preserving head dimensionality.
- When running speculative decoding in `llama.cpp`, specify `--spec-type draft-mtp`.
- For small 4B architectures, cap `--spec-draft-n-max` to **2**. A value of 4 incurs a high rejection rate on complex tool syntax.

---

## 7. Phase 5: Service Deployment & llama.cpp Configuration

Deploy the new model to the dedicated systemd user unit on the RTX 3060 Ti.

### 7.1 Copy Model Weights
```bash
mkdir -p ~/models/Qwen3.5-4B-Dispatch
cp outputs/Qwen3.5-4B-Dispatch-UD-Q4_K_XL.gguf ~/models/Qwen3.5-4B-Dispatch/
```

### 7.2 Update systemd Unit
Edit [`scripts/llm/qwen35-mtp.service`](file:///home/patrick/Bachelorprojekt/scripts/llm/qwen35-mtp.service):

```ini
[Unit]
Description=llama-server Qwen3.5-4B-Dispatch (RTX 3060 Ti, 64k ctx) on :1920
After=network.target

[Service]
Type=simple
Environment=CUDA_DEVICE_ORDER=PCI_BUS_ID
Environment=CUDA_VISIBLE_DEVICES=GPU-6b9ac882-e9e9-a364-4423-92d838536b86
ExecStart=%h/opt/llama-current/bin/llama-server \
  -m %h/models/Qwen3.5-4B-Dispatch/Qwen3.5-4B-Dispatch-UD-Q4_K_XL.gguf \
  --alias Qwen3.5-4B-MTP \
  --spec-type draft-mtp --spec-draft-n-max 2 \
  -c 65536 \
  -fit off -ngl 999 \
  -fa on -ctk q8_0 -ctv q8_0 \
  -np 1 --jinja --no-mmproj \
  --host 127.0.0.1 --port 1920
Restart=on-failure
RestartSec=10
TimeoutStartSec=300

[Install]
WantedBy=default.target
```

*Note on KV Cache:* Dropping the served context from 128k to 64k tokens allows setting `-ctk q8_0 -ctv q8_0` within the 8 GB VRAM budget of the RTX 3060 Ti, eliminating quantization degradation during attention over multi-file tool outputs.

### 7.3 Reload and Restart
```bash
cp scripts/llm/qwen35-mtp.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user restart qwen35-mtp
systemctl --user status qwen35-mtp
```

---

## 8. Phase 6: Verification & Benchmarks

Run the following test suite before declaring the fine-tune ready for production dispatch:

### 8.1 Tool Calling & JSON Syntax Verification
Send a simulated dispatch request to `:1920`:

```bash
curl -s http://127.0.0.1:1920/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen3.5-4B-MTP",
    "messages": [
      {"role": "system", "content": "You are a subagent. Output tool calls in <tool_call> tags."},
      {"role": "user", "content": "Inspect scripts/vda.sh lines 1 to 10."}
    ],
    "temperature": 0.1
  }' | jq .
```
**Pass Criteria:** Response starts immediately with `<tool_call>` containing valid JSON and no extraneous conversational prose.

### 8.2 Speculative Acceptance Rate
Inspect `llama-server` logs during continuous execution:
```bash
journalctl --user -u qwen35-mtp -n 100 --no-pager
```
Look for the draft acceptance metric:
```
draft acceptance rate: >= 65%
```
If the acceptance rate is below 50%, reduce `--spec-draft-n-max` to `1` or review sampling temperature.

### 8.3 Live Orchestrator End-to-End Test
Dispatch a bounded task packet from the primary orchestrator:
```bash
bash scripts/vda.sh oracle 'Run a check on scripts/llm/routing-check.sh using qwen35-mtp subagent'
```
Verify that:
1. `qwen35-mtp` accepts the dispatch packet.
2. It executes surgical file reading or editing without hallucinating file contents.
3. It concludes with the expected `STATUS: DONE` footer.
