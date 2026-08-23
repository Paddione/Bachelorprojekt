"""QLoRA SFT of unsloth/Qwen3-4B-Instruct-2507-unsloth-bnb-4bit on tool-use data."""
import json
import time
from pathlib import Path

import torch
from datasets import Dataset
from unsloth import FastLanguageModel
from trl import SFTConfig, SFTTrainer

BASE_MODEL = "unsloth/Qwen3-4B-Instruct-2507-unsloth-bnb-4bit"
MAX_SEQ = 2048
SEED = 3407
HERE = Path(__file__).parent

# ---------------------------------------------------------------- load model
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=BASE_MODEL,
    max_seq_length=MAX_SEQ,
    load_in_4bit=True,          # QLoRA
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=SEED,
)

# ---------------------------------------------------------------- data
def load_rows(path):
    rows = [json.loads(l) for l in Path(path).read_text(encoding="utf-8").splitlines() if l.strip()]
    return rows

def to_text(rows):
    """Render each row with the model's own chat template (tools included)."""
    texts = []
    for r in rows:
        t = tokenizer.apply_chat_template(
            r["messages"], tools=r.get("tools"), tokenize=False)
        texts.append({"text": t})
    return texts

train_rows = load_rows(HERE / "data" / "tooluse_train.jsonl")
val_rows = load_rows(HERE / "data" / "tooluse_val.jsonl")
train_ds = Dataset.from_list(to_text(train_rows))
print(f"train: {len(train_ds)} rendered examples")
print("--- sample rendered text ---")
print(train_ds[0]["text"][:600])
print("---")

# ---------------------------------------------------------------- trainer
config_kwargs = dict(
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,      # effective batch 8
    num_train_epochs=1,
    learning_rate=2e-4,
    warmup_ratio=0.1,
    lr_scheduler_type="cosine",
    logging_steps=5,
    optim="adamw_8bit",
    seed=SEED,
    output_dir=str(HERE / "outputs" / "checkpoints"),
    report_to="none",
    dataset_text_field="text",
)
try:
    cfg = SFTConfig(max_length=MAX_SEQ, **config_kwargs)
except TypeError:
    cfg = SFTConfig(max_seq_length=MAX_SEQ, **config_kwargs)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=train_ds,
    args=cfg,
)

# Mask user/system/tool turns: train on assistant output only (+~1% accuracy per QLoRA paper)
from unsloth.chat_templates import train_on_responses_only
trainer = train_on_responses_only(
    trainer,
    instruction_part="<|im_start|>user\n",
    response_part="<|im_start|>assistant\n",
)

# ---------------------------------------------------------------- train
t0 = time.time()
trainer.train()
dt = time.time() - t0

adapter_dir = HERE / "outputs" / "adapters"
model.save_pretrained(str(adapter_dir))
tokenizer.save_pretrained(str(adapter_dir))

peak = torch.cuda.max_memory_reserved() / 1e9
free_now, total = torch.cuda.mem_get_info()
print(f"wall time: {dt:.0f}s | peak VRAM: {peak:.2f} GB | free now: {free_now/1e9:.2f}/{total/1e9:.2f} GB")
print(f"adapter saved: {adapter_dir}")
print("TRAIN_OK")
