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
    # Multimodale Modelle (Qwen3.5): tokenizer ist ein Processor — Text-Encoding
    # muss ueber den inneren LLM-Tokenizer laufen, sonst versucht der Image-
    # Processor, den Prompt als Bild zu oeffnen.
    tok_text = getattr(tokenizer, "tokenizer", tokenizer)
    inputs = tok_text(prompt, return_tensors="pt").to("cuda")
    out = model.generate(**inputs, max_new_tokens=512, temperature=0.1,
                         use_cache=True)
    text = tok_text.decode(out[0][inputs["input_ids"].shape[1]:],
                           skip_special_tokens=False)
    return name, text

results = {}
for case in CASES:
    name, text = run(*case)
    results[name] = text
    print(f"\n{'='*60}\nCASE: {name}\n{'-'*60}\n{text.strip()[:500]}")

# automatic verdicts — unterstuetzt Qwen3-JSON- UND Qwen3.5-function-Format
import re

def extract_calls(text: str):
    """Liefert [(name, args_dict)] aus JSON-<tool_call> oder <function=...>-Format."""
    calls = []
    for m in re.finditer(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", text, re.DOTALL):
        try:
            p = json.loads(m.group(1))
            calls.append((p.get("name"), p.get("arguments", {})))
        except Exception:
            pass
    for m in re.finditer(r"<function=(\w+)>(.*?)</function>", text, re.DOTALL):
        name, body = m.group(1), m.group(2)
        args = {pm.group(1): pm.group(2).strip()
                for pm in re.finditer(r"<parameter=(\w+)>(.*?)</parameter>", body, re.DOTALL)}
        calls.append((name, args))
    return calls

print(f"\n{'='*60}\nVERDICTS")
ok = True
for name, text in results.items():
    calls = extract_calls(text)
    if name == "no_tool_direct":
        verdict = "PASS" if not calls else f"FAIL (unnötiger Call: {calls})"
    else:
        if not calls:
            verdict = "FAIL (kein Tool-Call)"
        else:
            cname, cargs = calls[0]
            expected = {"single_call": "get_weather", "tool_for_math": "calculate"}[name]
            verdict = "PASS" if cname == expected else f"FAIL (falsches Tool: {cname}, args={cargs})"
    if not verdict.startswith("PASS"):
        ok = False
    print(f"{name}: {verdict}")

print("\nEVAL_OK" if ok else "\nEVAL_HAS_FAILURES")
