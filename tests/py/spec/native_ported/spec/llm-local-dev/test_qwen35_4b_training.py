"""Native migration of tests/spec/llm-local-dev/qwen35-4b-training.bats."""

import os
from pathlib import Path

import pytest


@pytest.fixture
def train_env(repo_root):
    return {"PYTHONPATH": f"{repo_root / '.agents' / 'training'}:{os.environ.get('PYTHONPATH', '')}"}


def _py(run_cmd, repo_root, env, code):
    return run_cmd(["python3", "-c", code], cwd=repo_root, env=env)


def test_p1_upstream_hf_checkpoint_unsloth_qwen35_4b_documented_and_datasets_exist(repo_root):
    plan = (repo_root / ".agents" / "training" / "TRAINING_PLAN.md").read_text()
    assert "unsloth/Qwen3.5-4B" in plan, "unsloth/Qwen3.5-4B must be documented in TRAINING_PLAN.md"
    assert "Qwen3.5-4B-MTP-GGUF" in plan, "GGUF origin context documented"
    assert "13.000 MiB" in plan or "13000" in plan or "13 GB" in plan, "13 GB VRAM requirement documented"
    train_lines = (repo_root / ".agents" / "training" / "dataset_train.jsonl").read_text().strip().splitlines()
    val_lines = (repo_root / ".agents" / "training" / "dataset_val.jsonl").read_text().strip().splitlines()
    assert len(train_lines) >= 200, f"train set has {len(train_lines)} lines, expected >= 200"
    assert len(val_lines) >= 10, f"val set has {len(val_lines)} lines, expected >= 10"


def test_p2_config_4b_mtp_model_specs_use_unsloth_qwen35_4b_and_dataset_train_jsonl(repo_root, run_cmd, train_env):
    code = '''
import sys
sys.path.insert(0, ".agents/training")
import train_5070ti as t

spec = t.MODEL_SPECS.get("4b-mtp")
assert spec is not None, "4b-mtp must be in MODEL_SPECS"
assert spec["hf_16bit"] == "unsloth/Qwen3.5-4B", f"expected unsloth/Qwen3.5-4B, got {spec['hf_16bit']}"
assert spec["lora_16bit"] == "qwen35_4b_bp_lora", f"expected qwen35_4b_bp_lora, got {spec['lora_16bit']}"
assert spec["dataset"] == "dataset_train.jsonl", f"expected dataset_train.jsonl, got {spec['dataset']}"
assert spec["lora_r_16bit"] == 32, f"expected LoRA rank 32, got {spec['lora_r_16bit']}"
print("P2 config specs OK")
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output


def test_p2_preflight_gpu_vram_threshold_helper_and_dry_run_cli(repo_root, run_cmd, train_env):
    code = '''
import sys
sys.path.insert(0, ".agents/training")
import train_5070ti as t

# 16bit needs 13,000 MiB
ok_pass, msg = t.check_gpu_preflight(13_000, 15_950, device=1)
assert ok_pass is True, f"expected pass with 15950 MiB, got {msg}"

ok_fail, msg = t.check_gpu_preflight(13_000, 8_000, device=1)
assert ok_fail is False, f"expected fail with 8000 MiB, got {msg}"
assert "qwen38-gsq-iq3xxs" in msg, "error message should mention 27B rail service"
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output
    dry = run_cmd(["python3", ".agents/training/train_5070ti.py", "--model-size", "4b-mtp", "--dry-run", "--force"],
                  cwd=repo_root, env=train_env)
    assert dry.returncode == 0, dry.output
    assert "[dry-run]" in dry.output


def test_p3_eval_4b_model_defaults_scoring_and_thresholds(repo_root, run_cmd, train_env):
    code = '''
import sys
sys.path.insert(0, ".agents/training")
import eval as e

# 4B defaults or helper support
cfg = e.get_eval_config("4b-mtp")
assert cfg["base_model"] == "unsloth/Qwen3.5-4B", cfg
assert str(cfg["adapter_dir"]).endswith("qwen35_4b_bp_lora"), cfg
assert str(cfg["val_file"]).endswith("dataset_val.jsonl"), cfg
assert str(cfg["results_file"]).endswith("eval_results.json"), cfg

ref = "Run:\\n```bash\\ntask test:changed\\n```"
s = e.score_answer("Run:\\n```bash\\ntask test:changed\\n```", ref)
assert s["cmd_hit"] is True and not s["empty"] and not s["think_leak"], s
assert e.score_answer("no command here", ref)["cmd_hit"] is False
assert e.score_answer("<think>leak</think> ok", ref)["think_leak"] is True
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output


def test_p4_export_4b_paths_gguf_block_count_verification_and_issue_24737_guard(repo_root, run_cmd, train_env):
    code = '''
import sys
sys.path.insert(0, ".agents/training")
import export_model as exp

paths = exp.get_export_paths("4b-mtp")
assert str(paths["lora_dir"]).endswith("qwen35_4b_bp_lora"), paths
assert str(paths["merged_dir"]).endswith("qwen35_4b_bp_merged"), paths
assert str(paths["gguf_dir"]).endswith("qwen35_4b_bp_gguf"), paths

# Block count validation for Qwen3.5-4B (32 blocks, 33 is #24737 quirk)
ok, msg = exp.check_block_count(32)
assert ok is True and "OK" in msg, msg

ok, msg = exp.check_block_count(33)
assert ok is True and "24737" in msg, f"expected #24737 quirk notice, got {msg}"

ok, msg = exp.check_block_count(28)
assert ok is False and "FAIL" in msg, msg
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output
    noargs = run_cmd(["python3", ".agents/training/export_model.py", "--model-size", "4b-mtp"],
                     cwd=repo_root, env=train_env)
    assert noargs.returncode == 1
    assert ("Train first" in noargs.output) or ("LoRA adapter not found" in noargs.output)
