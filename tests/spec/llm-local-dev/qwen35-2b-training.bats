#!/usr/bin/env bats
# tests/spec/llm-local-dev/qwen35-2b-training.bats — T900978 P5
#   Slice (P1) / Config (P2) / Eval-Thresholds (P3) / Export (P4) on fixtures.
#   No GPU, no network: pure-python helpers + stub runs only.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  FIX="$BATS_TEST_DIRNAME/fixtures"
  export PYTHONPATH="$REPO/.agents/training:${PYTHONPATH:-}"
  cd "$REPO"
}

@test "P1 slice: fixture filter/dedup matches expected-stats.json" {
  run python3 - "$FIX" <<'EOF'
import json, sys
sys.path.insert(0, ".agents/training")
from generate_dataset import pair, apply_slice_2b, dedup
fix = sys.argv[1]
rows = [json.loads(l) for l in open(f"{fix}/qwen35-2b-mini.jsonl")]
exp = json.load(open(f"{fix}/qwen35-2b-expected-stats.json"))
assert len(rows) == exp["fixture_rows"], f"fixture rows {len(rows)}"
raw = [(r["domain"], pair(r["q"], r["a"])) for r in rows]
sliced, sinfo = apply_slice_2b(raw)
assert sinfo["slice_kept"] == exp["slice_kept"], sinfo
assert sinfo["slice_dropped"] == exp["slice_dropped"], sinfo
kept, stats = dedup(sliced)
assert stats["dropped_exact"] == exp["dedup_dropped_exact"], stats
assert len(kept) == exp["dedup_kept"], len(kept)
print("slice-fixture OK")
EOF
  [ "$status" -eq 0 ]
}

@test "P1 slice: real 2B artifacts exist with 95/5 split and domain sum" {
  run python3 - <<'EOF'
import json
from pathlib import Path
s = json.load(open(".agents/training/dataset_stats.json"))
sl = s.get("slice_2b")
assert sl, "slice_2b stats missing (T900979 coexistence: preserved across slice runs)"
full = Path(".agents/training/dataset_2b.jsonl").read_text().strip().splitlines()
train = Path(".agents/training/dataset_2b_train.jsonl").read_text().strip().splitlines()
val = Path(".agents/training/dataset_2b_val.jsonl").read_text().strip().splitlines()
assert sl["slice_kept"] == len(full), (sl, len(full))
assert len(train) + len(val) == len(full), (len(train), len(val), len(full))
assert abs(len(val) / len(full) - 0.05) < 0.02, (len(val), len(full))
print("slice-artifacts OK")
EOF
  [ "$status" -eq 0 ]
}

@test "P2 config: 2b defaults (base model, LoRA r=32, 200 steps, slice data)" {
  run python3 - <<'EOF'
import sys
sys.path.insert(0, ".agents/training")
import train_5070ti as t
s = t.MODEL_SPECS["2b"]
assert s["hf_16bit"] == "unsloth/Qwen3.5-2B", s
assert s["lora_r_16bit"] == 32, s
assert s["lora_16bit"] == "qwen35_2b_bp_lora", s
assert s["dataset"] == "dataset_2b_train.jsonl", s
assert "4b-mtp" in t.MODEL_SPECS, "4B branch kept"
print("config-defaults OK")
EOF
  [ "$status" -eq 0 ]
  run python3 .agents/training/train_5070ti.py --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"--model-size"* ]]
  [[ "$output" == *"--max-steps"* ]]
}

@test "P3 eval: scoring + thresholds pass/fail on fixtures" {
  run python3 - <<'EOF'
import sys
sys.path.insert(0, ".agents/training")
import eval as e
assert e.BASE_MODEL == "unsloth/Qwen3.5-2B"
assert str(e.VAL_FILE).endswith("dataset_2b_val.jsonl")
assert str(e.RESULTS_FILE).endswith("eval_2b_results.json")
ref = "Run:\n```bash\ntask test:changed\n```"
s = e.score_answer("Run:\n```bash\ntask test:changed\n```", ref)
assert s["cmd_hit"] is True and not s["empty"] and not s["think_leak"], s
assert e.score_answer("no idea", ref)["cmd_hit"] is False
assert e.score_answer("<think>x</think> task test:changed", ref)["think_leak"] is True
assert e.score_answer("   ", ref)["empty"] is True
ok, _ = e.check_thresholds(0.85, 0.0, 0.0); assert ok
ok, _ = e.check_thresholds(0.50, 0.0, 0.0); assert not ok
ok, _ = e.check_thresholds(0.9, 0.01, 0.0); assert not ok
ok, _ = e.check_thresholds(0.9, 0.0, 0.01); assert not ok
print("eval-fixture OK")
EOF
  [ "$status" -eq 0 ]
}

@test "P4 export: 2B paths, block-count verify, clean abort without adapter" {
  run python3 - <<'EOF'
import sys
sys.path.insert(0, ".agents/training")
import export_model as e
assert str(e.LORA_DIR).endswith("qwen35_2b_bp_lora"), e.LORA_DIR
assert str(e.MERGED_DIR).endswith("qwen35_2b_bp_merged"), e.MERGED_DIR
assert str(e.GGUF_DIR).endswith("qwen35_2b_bp_gguf"), e.GGUF_DIR
ok, m = e.check_block_count(32); assert ok, m
ok, m = e.check_block_count(33); assert ok and "24737" in m, m
ok, m = e.check_block_count(28); assert not ok, m
print("export-fixture OK")
EOF
  [ "$status" -eq 0 ]
  run python3 .agents/training/export_model.py
  [ "$status" -eq 1 ]
  [[ "$output" == *"Train first"* ]]
}
