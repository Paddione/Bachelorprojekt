"""Native migration of tests/spec/local-llm-proxy/pick-small-model-deterministic.bats."""

# [T002872]

import pytest


@pytest.fixture
def fixture_dirs(tmp_path):
    root_a = tmp_path / "root_a"
    root_b = tmp_path / "root_b"
    root_a.mkdir()
    root_b.mkdir()
    # Groesste Datei zuerst angelegt (widerlegt "erste gefundene Datei gewinnt").
    (root_a / "big-model.gguf").write_bytes(b"\0" * 5_000_000)
    (root_b / "small-model.gguf").write_bytes(b"\0" * 100_000)
    (root_a / "mmproj-tiny.gguf").write_bytes(b"\0")
    (root_b / "draft-tiny.gguf").write_bytes(b"\0")
    return root_a, root_b


def _pick(run_cmd, repo_root, a, b):
    helper = repo_root / "tests/spec/local-llm-proxy/lib/pick-small-model.sh"
    return run_cmd(["bash", "-c", f"source '{helper}' && pick_small_test_model '{a}' '{b}'"], cwd=repo_root)


def test_pick_small_model_deterministic_pick_small_test_model_waehlt_die_kleinste_nicht_hilfsdatei(run_cmd, repo_root, fixture_dirs):
    assert (repo_root / "tests/spec/local-llm-proxy/lib/pick-small-model.sh").is_file()
    root_a, root_b = fixture_dirs
    res = _pick(run_cmd, repo_root, root_a, root_b)
    assert res.returncode == 0, res.output
    assert res.output == str(root_b / "small-model.gguf")


def test_pick_small_model_deterministic_pick_small_test_model_schliesst_mmproj_draft_dateien_aus(run_cmd, repo_root, fixture_dirs):
    assert (repo_root / "tests/spec/local-llm-proxy/lib/pick-small-model.sh").is_file()
    root_a, root_b = fixture_dirs
    (root_a / "big-model.gguf").unlink()
    (root_b / "small-model.gguf").unlink()
    res = _pick(run_cmd, repo_root, root_a, root_b)
    assert res.returncode == 1
    assert res.output == ""
