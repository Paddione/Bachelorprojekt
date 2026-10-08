"""Native migration of tests/spec/local-llm-proxy/model-path-large-file.bats."""

# [T002536]

import os

import pytest


@pytest.fixture
def troot(tmp_path):
    root = tmp_path / "root"
    (root / "sub").mkdir(parents=True)
    # truncate -s 3G / 1M: sparse files, no real disk usage.
    with open(root / "sub" / "gross.gguf", "wb") as fh:
        fh.truncate(3 * 1024 ** 3)
    with open(root / "sub" / "klein.gguf", "wb") as fh:
        fh.truncate(1024 ** 2)
    return root


def _resolve(run_cmd, repo_root, troot, rel):
    js = f"""
    const {{ resolveModelPath }} = await import('file://{repo_root}/scripts/llm-proxy/models.mjs');
    const doc = {{ modelRoots: ['{troot}'] }};
    console.log(String(resolveModelPath(doc, {{ model: '{rel}' }})));
    """
    return run_cmd(["node", "--input-type=module", "-e", js], cwd=repo_root)


def test_model_path_large_file_resolvemodelpath_findet_ein_modell_ueber_2_gib(run_cmd, repo_root, troot):
    res = _resolve(run_cmd, repo_root, troot, "sub/gross.gguf")
    assert res.returncode == 0, res.output
    assert res.output == f"{troot}/sub/gross.gguf"


def test_model_path_large_file_resolvemodelpath_findet_auch_kleine_dateien_weiterhin(run_cmd, repo_root, troot):
    res = _resolve(run_cmd, repo_root, troot, "sub/klein.gguf")
    assert res.returncode == 0, res.output
    assert res.output == f"{troot}/sub/klein.gguf"


def test_model_path_large_file_resolvemodelpath_gibt_null_fuer_eine_fehlende_datei(run_cmd, repo_root, troot):
    res = _resolve(run_cmd, repo_root, troot, "sub/gibtsnicht.gguf")
    assert res.returncode == 0, res.output
    assert res.output == "null"


def test_model_path_large_file_resolvemodelpath_gibt_null_fuer_ein_verzeichnis_gleichen_namens(run_cmd, repo_root, troot):
    os.makedirs(troot / "sub" / "verzeichnis.gguf")
    res = _resolve(run_cmd, repo_root, troot, "sub/verzeichnis.gguf")
    assert res.returncode == 0, res.output
    assert res.output == "null"
