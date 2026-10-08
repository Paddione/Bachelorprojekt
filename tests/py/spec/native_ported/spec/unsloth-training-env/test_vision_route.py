"""Native migration of tests/spec/unsloth-training-env/vision-route.bats."""

import base64

import pytest

PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Y5AAAAAASUVORK5CYII="

VISION_ROW = (
    '{"messages":[{"role":"user","content":[{"type":"text","text":"What failed?"},'
    '{"type":"image","image":"shot.png"}]},{"role":"assistant","content":[{"type":"text",'
    '"text":"Inspect the build log."}]}]}\n'
)


@pytest.fixture
def vr(repo_root, tmp_path):
    """BATS setup(): PNG fixture, vision corpus and text report in tmp_path."""
    (tmp_path / "shot.png").write_bytes(base64.b64decode(PNG_B64))
    (tmp_path / "vision.jsonl").write_text(VISION_ROW)
    (tmp_path / "report.json").write_text('{"row_count":1,"tokenizer_source":"transformers"}\n')
    return {"repo": repo_root, "dir": tmp_path}


def test_qwen3_vl_snapshot_validates_image_corpus_without_loading_cuda(run_cmd, vr):
    r = run_cmd(["python3", str(vr["repo"] / "scripts/finetune/train_vision.py"),
                 "--model", "unsloth/Qwen3-VL-4B-Instruct-unsloth-bnb-4bit",
                 "--corpus", str(vr["dir"] / "vision.jsonl"), "--max-seq-length", "1024", "--dry-run"])
    assert r.returncode == 0
    assert "1 rows, 1 images" in r.output


def test_vision_corpus_rejects_a_missing_image(run_cmd, vr):
    (vr["dir"] / "missing.jsonl").write_text(VISION_ROW.replace("shot.png", "missing.png"))
    r = run_cmd(["python3", str(vr["repo"] / "scripts/finetune/train_vision.py"),
                 "--model", "unsloth/Qwen3-VL-4B-Instruct-unsloth-bnb-4bit",
                 "--corpus", str(vr["dir"] / "missing.jsonl"), "--max-seq-length", "1024", "--dry-run"])
    assert r.returncode != 0
    assert "image not found" in r.output


def test_text_trainer_refuses_the_local_qwen3_vl_snapshot(run_cmd, vr):
    snapshot = vr["dir"] / "snapshot"
    snapshot.mkdir()
    (snapshot / "config.json").write_text('{"model_type":"qwen3_vl"}\n')
    r = run_cmd(["python3", str(vr["repo"] / "scripts/finetune/train.py"),
                 "--model", str(snapshot), "--corpus", str(vr["dir"] / "vision.jsonl"),
                 "--measure-report", str(vr["dir"] / "report.json"), "--max-seq-length", "1024", "--dry-run"])
    assert r.returncode != 0
    assert "train_vision.py" in r.output
