"""Quick eval: does the adapter produce valid Qwen-style tool calls?"""
import json
from pathlib import Path

from unsloth import FastLanguageModel

HERE = Path(__file__).parent
ADAPTER = str(HERE / "outputs" / "adapters")

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=ADAPTER,
    max_seq_length=2048,
    load_in_4bit=True,
)
FastLanguageModel.for_inference(model)

TOOLS = [
    {"type": "function", "function": {
        "name": "get_weather",
        "description": "Get current weather for a city.",
        "parameters": {"type": "object",
                       "properties": {"location": {"type": "string"},
                                      "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}},
                       "required": ["location"]}}},
    {"type": "function", "function": {
        "name": "calculate",
        "description": "Evaluate an arithmetic expression.",
        "parameters": {"type": "object",
                       "properties": {"expression": {"type": "string"}},
                       "required": ["expression"]}}},
]

CASES = [
    ("single_call", TOOLS,
     "What's the weather in Lisbon right now?"),
    ("no_tool_direct", TOOLS,
     "Who wrote the novel '1984'?"),
    ("tool_for_math", TOOLS,
     "Calculate 47 * 83 for me."),
]

# MUST match the SYSTEM prompt used in gen_dataset.py / training
SYSTEM = ("You are a helpful assistant with access to tools. "
          "Call tools when they help answer the request; "
          "answer directly when no tool is needed.")

def run(name, tools, user_msg):
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg}]
    prompt = tokenizer.apply_chat_template(msgs, tools=tools, tokenize=False,
                                           add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    out = model.generate(**inputs, max_new_tokens=256, temperature=0.1,
                         use_cache=True)
    text = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:],
                            skip_special_tokens=False)
    return name, text

results = {}
for case in CASES:
    name, text = run(*case)
    results[name] = text
    print(f"\n{'='*60}\nCASE: {name}\n{'-'*60}\n{text.strip()[:500]}")

# automatic verdicts
print(f"\n{'='*60}\nVERDICTS")
ok = True
for name, text in results.items():
    has_call = "<tool_call>" in text
    if name == "no_tool_direct":
        verdict = "PASS" if not has_call else "FAIL (called a tool unnecessarily)"
    else:
        verdict = "PASS" if has_call else "FAIL (no tool call)"
        if has_call:
            try:
                payload = text.split("<tool_call>")[1].split("</tool_call>")[0]
                parsed = json.loads(payload)
                assert "name" in parsed and "arguments" in parsed
            except Exception as e:  # noqa: BLE001
                verdict = f"FAIL (invalid JSON: {e})"
    if verdict != "PASS":
        ok = False
    print(f"{name}: {verdict}")

print("\nEVAL_OK" if ok else "\nEVAL_HAS_FAILURES")
