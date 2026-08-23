"""Probe: adapter behavior with tools visible vs no tools in context."""
from pathlib import Path

from unsloth import FastLanguageModel

HERE = Path(__file__).parent
ADAPTER = str(HERE / "outputs" / "adapters")
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
Q = "Who wrote the novel '1984'?"

model, tok = FastLanguageModel.from_pretrained(ADAPTER, max_seq_length=2048, load_in_4bit=True)
FastLanguageModel.for_inference(model)

def gen(tools):
    msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": Q}]
    text = tok.apply_chat_template(msgs, tools=tools, tokenize=False, add_generation_prompt=True)
    inputs = tok(text, return_tensors="pt").to("cuda")
    out = model.generate(**inputs, max_new_tokens=128, temperature=0.1, use_cache=True)
    return tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=False).strip()

print("WITH TOOLS   :", gen(TOOLS)[:200].replace("\n", " | "))
print("WITHOUT TOOLS:", gen(None)[:200].replace("\n", " | "))
print("PROBE_DONE")
