"""Native migration of tests/spec/unsloth-training-env/train-config.bats."""

import pytest


@pytest.fixture
def tc(repo_root, tmp_path):
    """BATS setup(): report and corpus fixtures in a fresh work dir."""
    (tmp_path / "report.json").write_text('{"row_count":1,"tokenizer_source":"transformers"}\n')
    (tmp_path / "data.jsonl").write_text(
        '{"messages":[{"role":"user","content":"x"},{"role":"assistant","content":"y"}]}\n')
    return {"script": str(repo_root / "scripts" / "finetune" / "train.py"), "repo": repo_root, "dir": tmp_path}


def _train(run_cmd, tc, model, extra=(), env=None, report=None):
    d = tc["dir"]
    cmd = ["python3", tc["script"], "--corpus", str(d / "data.jsonl"), "--model", model,
           "--measure-report", str(report or d / "report.json"), *extra, "--dry-run"]
    return run_cmd(cmd, env=env)


def test_qwen3_5_selects_16_bit_lora_without_importing_the_gpu_stack(run_cmd, tc):
    r = _train(run_cmd, tc, "Qwen/Qwen3.5-4B", ["--max-seq-length", "2048"])
    assert r.returncode == 0
    assert '"precision": "16bit"' in r.output


def test_qwen3_5_bnb_base_is_rejected_for_the_recommended_16_bit_mode(run_cmd, tc):
    r = _train(run_cmd, tc, "unsloth/Qwen3.5-4B-bnb-4bit", ["--max-seq-length", "2048"])
    assert r.returncode != 0
    assert "kein 16bit-Basismodell" in r.output


def test_qwen3_bnb_remains_available_for_qlora(run_cmd, tc):
    r = _train(run_cmd, tc, "unsloth/Qwen3-4B-bnb-4bit", ["--max-seq-length", "2048"])
    assert r.returncode == 0
    assert '"precision": "4bit"' in r.output


def test_model_splitting_cannot_silently_run_with_ddp(run_cmd, tc):
    r = _train(run_cmd, tc, "Qwen/Qwen3-4B", ["--gpu-mode", "balanced", "--max-seq-length", "2048"],
               env={"WORLD_SIZE": "2"})
    assert r.returncode != 0
    assert "nicht mit DDP" in r.output


def test_corpus_estimator_uses_16_bit_weights_for_qwen3_5(run_cmd, tc):
    code = (
        "import sys\n"
        "sys.path.insert(0, sys.argv[1] + '/scripts/finetune')\n"
        "from measure_corpus import _feasibility_matrix\n"
        "qwen = _feasibility_matrix([2048], 16)['qwen3.5-4b']\n"
        "assert qwen['precision'] == '16bit'\n"
        "assert qwen['weight_gb_16bit'] > 9\n"
        "print(qwen['weight_gb_16bit'])\n"
    )
    r = run_cmd(["python3", "-c", code, str(tc["repo"])])
    assert r.returncode == 0


def test_dry_run_refuses_a_heuristic_token_count_before_a_gpu_job(run_cmd, tc):
    (tc["dir"] / "report.json").write_text(
        '{"row_count":1,"tokenizer_source":"heuristic-4-chars-per-token"}\n')
    r = _train(run_cmd, tc, "Qwen/Qwen3.5-4B", ["--max-seq-length", "2048"])
    assert r.returncode != 0
    assert "echtem Modell-Tokenizer" in r.output
