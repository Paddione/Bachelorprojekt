#!/usr/bin/env python3
"""
bench_qwen38_comparison.py
Standardized benchmark script to compare Qwen 3.8 GSQ-RCO quants (IQ2_S-mtp vs IQ3_XXS-mtp)
on RTX 5070 Ti alone (:1919).
"""

import sys
import time
import json
import urllib.request
import urllib.error

ENDPOINT = "http://127.0.0.1:1919/v1/chat/completions"

def run_query(messages, max_tokens=300, temperature=0.7, enable_thinking=False):
    payload = {
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "chat_template_kwargs": {"enable_thinking": enable_thinking}
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(ENDPOINT, data=data, headers={"Content-Type": "application/json"})
    
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            elapsed = time.time() - t0
            result = json.loads(resp.read().decode("utf-8"))
            choice = result["choices"][0]
            timings = result.get("timings", {})
            return {
                "success": True,
                "elapsed": elapsed,
                "content": choice["message"].get("content", ""),
                "reasoning": choice["message"].get("reasoning_content", ""),
                "prompt_tokens": timings.get("prompt_n", 0),
                "prompt_tps": timings.get("prompt_per_second", 0.0),
                "predicted_tokens": timings.get("predicted_n", 0),
                "predicted_tps": timings.get("predicted_per_second", 0.0),
                "draft_n": timings.get("draft_n", 0),
                "draft_accepted": timings.get("draft_n_accepted", 0),
                "accept_rate": (timings.get("draft_n_accepted", 0) / timings.get("draft_n", 1)) * 100 if timings.get("draft_n", 0) > 0 else 0.0
            }
    except Exception as e:
        return {"success": False, "error": str(e), "elapsed": time.time() - t0}

def main():
    label = sys.argv[1] if len(sys.argv) > 1 else "benchmark"
    print(f"--- Running Benchmark for {label} on {ENDPOINT} ---")
    
    # Warmup
    print("Warming up engine...")
    run_query([{"role": "user", "content": "Hello! Reply with OK."}], max_tokens=10)
    
    results = {}
    
    # Test 1: Short Prompt + Fast Decode (Direct generation, no thinking)
    print("Test 1: Fast Decode & MTP Acceptance (Short prompt, 200 tokens out)...")
    t1 = run_query(
        [{"role": "user", "content": "Write a clean Python function implementing binary search with detailed comments."}],
        max_tokens=220,
        enable_thinking=False
    )
    results["test1_short_decode"] = t1
    print(f"  -> Decode: {t1.get('predicted_tps', 0):.1f} t/s, MTP Accept: {t1.get('accept_rate', 0):.1f}%, Elapsed: {t1.get('elapsed', 0):.2f}s")
    
    # Test 2: Long Prefill Prompt (~2k tokens)
    print("Test 2: Medium/Long Prefill Speed (2,000+ token context)...")
    long_code_context = ("// Sample source buffer for context prefill benchmark\n" + 
                         "function processData(record) {\n"
                         "    const id = record.id;\n"
                         "    const value = Math.sqrt(record.val * 2.5);\n"
                         "    return { id, value, status: 'computed' };\n"
                         "}\n") * 120
    t2 = run_query(
        [
            {"role": "system", "content": "You are a code analyzer."},
            {"role": "user", "content": f"Analyze this code block:\n{long_code_context}\nSummarize what processData does in 2 sentences."}
        ],
        max_tokens=80,
        enable_thinking=False
    )
    results["test2_long_prefill"] = t2
    print(f"  -> Prefill: {t2.get('prompt_tps', 0):.1f} t/s ({t2.get('prompt_tokens', 0)} tokens), Decode: {t2.get('predicted_tps', 0):.1f} t/s")
    
    # Test 3: Complex Reasoning / Math (Thinking Enabled)
    print("Test 3: Complex Reasoning (Thinking enabled)...")
    t3 = run_query(
        [{"role": "user", "content": "A farmer has 17 sheep. All but 9 run away. How many sheep are left? Then solve: If 3 cats catch 3 mice in 3 minutes, how many cats are needed to catch 100 mice in 100 minutes? Explain the reasoning clearly."}],
        max_tokens=400,
        enable_thinking=True
    )
    results["test3_reasoning"] = t3
    print(f"  -> Reasoning tokens generated: {len(t3.get('reasoning', '').split())} words, Content: {len(t3.get('content', '').split())} words")
    print(f"  -> Total Decode: {t3.get('predicted_tps', 0):.1f} t/s, MTP Accept: {t3.get('accept_rate', 0):.1f}%")
    
    # Test 4: Structured Tool Calling / JSON Output
    print("Test 4: Structured JSON Generation (Tool calling protocol)...")
    t4 = run_query(
        [
            {"role": "system", "content": "You are a database agent. You must respond ONLY with a valid JSON object matching schema: {\"action\": string, \"tables\": string[], \"filter\": string}."},
            {"role": "user", "content": "Find all users in table 'accounts' registered after 2026-01-01."}
        ],
        max_tokens=100,
        enable_thinking=False
    )
    results["test4_json"] = t4
    print(f"  -> Output valid JSON: {t4.get('content', '').strip()[:80]}...")
    
    out_file = f"scripts/llm/measurements/bench-{label}.json"
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Results saved to {out_file}")

if __name__ == "__main__":
    main()
