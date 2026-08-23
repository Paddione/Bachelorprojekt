"""Diagnose: does the adapter actually change outputs vs the raw base model?"""
import json
from pathlib import Path

from unsloth import FastLanguageModel

HERE = Path(__file__).parent
ADAPTER = HERE / "outputs" / "adapters"
BASE = "unsloth/Qwen3-4B-Instruct-2507-unsloth-bnb-4bit"

SYSTEM = ("You are a helpful assistant with access to tools. "
          "Call tools when they help answer the request; "
          "answer directly when no tool is needed.")
TOOLS = [
    {"type": "function", "function": {
        "name": "get_weather", "description": "Get current weather for a city.",
        "parameters": {"type": "object",
                       "properties": {"location": {"type": "string"},
                                      "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}},
                       "required": ["location"]}}},
    {"type": "function", "function": {
        "name": "calculate", "description": "Evaluate an arithmetic expression.",
        "parameters": {"type": "object",
                       "properties": {"expression": {"type": "string"}},
                       "required": ["expression"]}}},
]
PROMPT = "Who wrote the novel '1984'?"

def generate(model, tokenizer):
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": PROMPT}]
    text = tokenizer.apply_chat_template(msgs, tools=TOOLS, tokenize=False,
                                         add_generation_prompt=True)
    inputs = tokenizer(text, return_tensors="pt").to("cuda")
    out = model.generate(**inputs, max_new_tokens=128, temperature=0.1, use_cache=True)
    return tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=False).strip()

# --- 1) adapter files sanity
for f in sorted(ADAPTER.glob("*")):
    print(f"ADAPTER FILE: {f.name}  {f.stat().st_size/1e6:.2f} MB")

# --- 2) base model output
base_model, tok = FastLanguageModel.from_pretrained(BASE, max_seq_length=2048, load_in_4bit=True)
FastLanguageModel.for_inference(base_model)
base_out = generate(base_model, tok)
print(f"\nBASE OUTPUT:\n{base_out[:300]}")
del base_model
import gc, torch
gc.collect(); torch.cuda.empty_cache()

# --- 3) adapter output
ft_model, tok2 = FastLanguageModel.from_pretrained(str(ADAPTER), max_seq_length=2048, load_in_4bit=True)
FastLanguageModel.for_inference(ft_model)
ft_out = generate(ft_model, tok2)
print(f"\nADAPTER OUTPUT:\n{ft_out[:300]}")

print(f"\nIDENTICAL: {base_out == ft_out}")
print("DIAG_DONE")
