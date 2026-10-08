"""Native migration of tests/spec/llm-local-dev/qwen35-08b-training.bats."""

import os

import pytest


@pytest.fixture
def train_env(repo_root):
    return {"PYTHONPATH": f"{repo_root / '.agents' / 'training'}:{os.environ.get('PYTHONPATH', '')}"}


def _py(run_cmd, repo_root, env, code):
    return run_cmd(["python3", "-c", code], cwd=repo_root, env=env)


def test_p1_slice_08b_domains_and_anchor_filter_keeps_mechanical_drops_rest(repo_root, run_cmd, train_env):
    code = '''
import sys
sys.path.insert(0, ".agents/training")
from generate_dataset import (
    SLICE_08B_DOMAINS, is_slice_08b, apply_slice_08b, pair,
)
assert SLICE_08B_DOMAINS == {"cli", "gotchas", "boilerplate"}, SLICE_08B_DOMAINS
anchored_cli = pair("rename helper?", "Run:\\n```bash\\ntask test:changed\\n```")
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
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output


def test_p1_slice_real_08b_artifacts_exist_with_train_val_split_and_stats(repo_root, run_cmd, train_env):
    code = '''
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
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output


def test_p2_config_08b_specs_unsloth_08b_r16_slice_data_and_cli(repo_root, run_cmd, train_env):
    code = '''
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
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output
    help_res = run_cmd(["python3", ".agents/training/train_5070ti.py", "--help"], cwd=repo_root, env=train_env)
    assert help_res.returncode == 0, help_res.output
    assert "0.8b" in help_res.output


def test_p3_viability_08b_config_065_gate_viability_gate_failed_marker(repo_root, run_cmd, train_env):
    code = '''
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
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output
    dry = run_cmd(["python3", ".agents/training/eval.py", "--model-size", "0.8b", "--dry-run"],
                  cwd=repo_root, env=train_env)
    assert dry.returncode == 0, dry.output
    assert "Config OK" in dry.output


def test_p4_export_08b_paths_24_block_guard_24737_quirk(repo_root, run_cmd, train_env):
    code = '''
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
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output
    dry = run_cmd(["python3", ".agents/training/export_model.py", "--model-size", "0.8b", "--dry-run",
                   "--lora-path", "/tmp"], cwd=repo_root, env=train_env)
    assert dry.returncode == 0, dry.output
    assert "expected_blocks=24" in dry.output
    missing = run_cmd(["python3", ".agents/training/export_model.py", "--model-size", "0.8b",
                       "--lora-path", "/tmp/does-not-exist-08b"], cwd=repo_root, env=train_env)
    assert missing.returncode == 1
