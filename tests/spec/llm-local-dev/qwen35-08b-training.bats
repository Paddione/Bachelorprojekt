#!/usr/bin/env bats
# tests/spec/llm-local-dev/qwen35-08b-training.bats — T900979 P5
#   0.8B minimal instruct worker: slice (P1) / config (P2) /
#   viability-gate (P3) / export 24-block guard (P4) on fixtures.
#   No GPU, no network: pure-python helpers + dry-run / stub runs only.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  export PYTHONPATH="$REPO/.agents/training:${PYTHONPATH:-}"
  cd "$REPO"
}

@test "P1 slice: 08b domains + anchor filter keeps mechanical, drops rest" {
  run python3 - <<'EOF'
import sys
sys.path.insert(0, ".agents/training")
from generate_dataset import (
    SLICE_08B_DOMAINS, is_slice_08b, apply_slice_08b, pair,
)
assert SLICE_08B_DOMAINS == {"cli", "gotchas", "boilerplate"}, SLICE_08B_DOMAINS
anchored_cli = pair("rename helper?", "Run:\n```bash\ntask test:changed\n```")
assert is_slice_08b("cli", anchored_cli) is True
assert is_slice_08b("gotchas", anchored_cli) is True
assert is_slice_08b("boilerplate", anchored_cli) is True
# non-mechanical domain dropped even when anchored
assert is_slice_08b("workflow", anchored_cli) is False
assert is_slice_08b("runbooks", anchored_cli) is False
# unanchored answer dropped even in mechanical domain
plain = pair("how are you?", "I am a helpful assistant.")
assert is_slice_08b("cli", plain) is False
raw = [("cli", anchored_cli), ("workflow", anchored_cli), ("cli", plain)]
kept, info = apply_slice_08b(raw)
assert len(kept) == 1, info
assert info["slice_kept"] == 1 and info["slice_dropped"] == 2, info
assert info["slice_domains"] == ["boilerplate", "cli", "gotchas"], info
print("slice-08b-filter OK")
EOF
  [ "$status" -eq 0 ]
}

@test "P1 slice: real 08b artifacts exist with train/val split and stats" {
  run python3 - <<'EOF'
import json
from pathlib import Path
s = json.load(open(".agents/training/dataset_stats.json"))
sl = s.get("slice_08b")
assert sl, "slice_08b stats missing"
assert sorted(sl["slice_domains"]) == ["boilerplate", "cli", "gotchas"], sl
full = Path(".agents/training/dataset_08b.jsonl").read_text().strip().splitlines()
train = Path(".agents/training/dataset_08b_train.jsonl").read_text().strip().splitlines()
val = Path(".agents/training/dataset_08b_val.jsonl").read_text().strip().splitlines()
assert sl["slice_kept"] == len(full), (sl, len(full))
assert len(train) + len(val) == len(full), (len(train), len(val), len(full))
assert len(val) >= 1, "val split must not be empty"
assert abs(len(val) / len(full) - 0.05) < 0.03, (len(val), len(full))
print("slice-08b-artifacts OK")
EOF
  [ "$status" -eq 0 ]
}

@test "P2 config: 0.8b specs (unsloth 0.8B, r=16, slice data) and CLI" {
  run python3 - <<'EOF'
import sys
sys.path.insert(0, ".agents/training")
import train_5070ti as t
s = t.MODEL_SPECS["0.8b"]
assert s["hf_16bit"] == "unsloth/Qwen3.5-0.8B", s
assert s["hf_4bit"] == "unsloth/Qwen3.5-0.8B-bnb-4bit", s
assert s["lora_16bit"] == "qwen35_08b_bp_lora", s
assert s["dataset"] == "dataset_08b_train.jsonl", s
assert s["lora_r_16bit"] == 16, s
assert "2b" in t.MODEL_SPECS and "4b-mtp" in t.MODEL_SPECS, "ladder branches kept"
print("config-08b OK")
EOF
  [ "$status" -eq 0 ]
  run python3 .agents/training/train_5070ti.py --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"0.8b"* ]]
}

@test "P3 viability: 0.8b config, 0.65 gate, VIABILITY_GATE_FAILED marker" {
  run python3 - <<'EOF'
import sys
sys.path.insert(0, ".agents/training")
import eval as e
cfg = e.get_eval_config("0.8b")
assert cfg["base_model"] == "unsloth/Qwen3.5-0.8B", cfg
assert str(cfg["adapter_dir"]).endswith("qwen35_08b_bp_lora"), cfg
assert str(cfg["val_file"]).endswith("dataset_08b_val.jsonl"), cfg
assert str(cfg["results_file"]).endswith("eval_08b_results.json"), cfg
t08 = e.get_viability_thresholds("0.8b")
assert t08["min_command_match"] == 0.65, t08
assert t08["max_empty_rate"] == 0.0 and t08["max_think_leak_rate"] == 0.0, t08
t2 = e.get_viability_thresholds("2b")
assert t2["min_command_match"] == 0.70, t2
# 0.66 passes the relaxed 0.8b gate but fails the global 0.70 gate
ok, msg = e.check_thresholds(0.66, 0.0, 0.0, model_size="0.8b"); assert ok, msg
ok, _ = e.check_thresholds(0.66, 0.0, 0.0); assert not ok
ok, msg = e.check_thresholds(0.64, 0.0, 0.0, model_size="0.8b")
assert not ok and "VIABILITY_GATE_FAILED" in msg, msg
ok, msg = e.check_thresholds(0.90, 0.01, 0.0, model_size="0.8b")
assert not ok and "VIABILITY_GATE_FAILED" in msg, msg
ok, msg = e.check_thresholds(0.90, 0.0, 0.01, model_size="0.8b")
assert not ok and "VIABILITY_GATE_FAILED" in msg, msg
ok, msg = e.check_thresholds(0.90, 0.0, 0.0, model_size="0.8b"); assert ok, msg
# legacy 3-arg callers keep global behavior
ok, _ = e.check_thresholds(0.85, 0.0, 0.0); assert ok
ok, _ = e.check_thresholds(0.50, 0.0, 0.0); assert not ok
print("viability-08b OK")
EOF
  [ "$status" -eq 0 ]
  run python3 .agents/training/eval.py --model-size 0.8b --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Config OK"* ]]
}

@test "P4 export: 0.8b paths, 24-block guard, #24737 quirk" {
  run python3 - <<'EOF'
import sys
sys.path.insert(0, ".agents/training")
import export_model as e
p = e.get_export_paths("0.8b")
assert str(p["lora_dir"]).endswith("qwen35_08b_bp_lora"), p
assert str(p["merged_dir"]).endswith("qwen35_08b_bp_merged"), p
assert str(p["gguf_dir"]).endswith("qwen35_08b_bp_gguf"), p
assert p["expected_blocks"] == 24, p
ok, m = e.check_block_count(24, expected=24); assert ok and "OK" in m, m
ok, m = e.check_block_count(25, expected=24); assert ok and "24737" in m, m
ok, m = e.check_block_count(32, expected=24); assert not ok and "FAIL" in m, m
ok, m = e.check_block_count(23, expected=24); assert not ok, m
print("export-08b OK")
EOF
  [ "$status" -eq 0 ]
  run python3 .agents/training/export_model.py --model-size 0.8b --dry-run --lora-path /tmp
  [ "$status" -eq 0 ]
  [[ "$output" == *"expected_blocks=24"* ]]
  run python3 .agents/training/export_model.py --model-size 0.8b --lora-path /tmp/does-not-exist-08b
  [ "$status" -eq 1 ]
}
