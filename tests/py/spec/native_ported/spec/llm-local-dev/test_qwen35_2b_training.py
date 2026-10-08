"""Native migration of tests/spec/llm-local-dev/qwen35-2b-training.bats."""

import os

import pytest


@pytest.fixture
def train_env(repo_root):
    return {"PYTHONPATH": f"{repo_root / '.agents' / 'training'}:{os.environ.get('PYTHONPATH', '')}"}


def _py(run_cmd, repo_root, env, code, *args):
    return run_cmd(["python3", "-c", code, *args], cwd=repo_root, env=env)


def test_p1_slice_fixture_filter_dedup_matches_expected_stats_json(repo_root, run_cmd, train_env):
    fix = str(repo_root / "tests" / "spec" / "llm-local-dev" / "fixtures")
    code = '''
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
'''
    res = _py(run_cmd, repo_root, train_env, code, fix)
    assert res.returncode == 0, res.output


def test_p1_slice_real_2b_artifacts_exist_with_95_5_split_and_domain_sum(repo_root, run_cmd, train_env):
    code = '''
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
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output


def test_p2_config_2b_defaults_base_model_lora_r32_200_steps_slice_data(repo_root, run_cmd, train_env):
    code = '''
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
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output
    help_res = run_cmd(["python3", ".agents/training/train_5070ti.py", "--help"], cwd=repo_root, env=train_env)
    assert help_res.returncode == 0, help_res.output
    assert "--model-size" in help_res.output
    assert "--max-steps" in help_res.output


def test_p3_eval_scoring_and_thresholds_pass_fail_on_fixtures(repo_root, run_cmd, train_env):
    code = '''
import sys
sys.path.insert(0, ".agents/training")
import eval as e
assert e.BASE_MODEL == "unsloth/Qwen3.5-2B"
assert str(e.VAL_FILE).endswith("dataset_2b_val.jsonl")
assert str(e.RESULTS_FILE).endswith("eval_2b_results.json")
ref = "Run:\\n```bash\\ntask test:changed\\n```"
s = e.score_answer("Run:\\n```bash\\ntask test:changed\\n```", ref)
assert s["cmd_hit"] is True and not s["empty"] and not s["think_leak"], s
assert e.score_answer("no idea", ref)["cmd_hit"] is False
assert e.score_answer("<think>x</think> task test:changed", ref)["think_leak"] is True
assert e.score_answer("   ", ref)["empty"] is True
ok, _ = e.check_thresholds(0.9, 0.01, 0.0); assert not ok
ok, _ = e.check_thresholds(0.9, 0.0, 0.01); assert not ok
print("eval-fixture OK")
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output


def test_p4_export_2b_paths_block_count_verify_clean_abort_without_adapter(repo_root, run_cmd, train_env):
    code = '''
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
'''
    res = _py(run_cmd, repo_root, train_env, code)
    assert res.returncode == 0, res.output
    noargs = run_cmd(["python3", ".agents/training/export_model.py"], cwd=repo_root, env=train_env)
    assert noargs.returncode == 1
    assert "Train first" in noargs.output
