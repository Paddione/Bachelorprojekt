"""Native migration of tests/unit/brain-verify-claims.bats."""
import os
import shutil
import subprocess

import pytest

STATE_JSON = """{
  "docs/mini.md#1": {"slug": "page-ok", "type": "note"},
  "docs/mini.md#2": {"slug": "page-bad", "type": "note"}
}
"""


@pytest.fixture
def testdir(tmp_path):
    """setup(): Fixture-Verzeichnis wie im BATS-Original."""
    root = tmp_path / "root"
    (root / "docs").mkdir(parents=True)
    (tmp_path / "brain/wiki").mkdir(parents=True)
    lines = ["## Alpha", "Der Dienst lauscht auf Port 1919."]
    lines += [f"- Pufferzeile {n:04d}" for n in range(1, 301)]
    lines += ["## Beta", "Die Statusfarbe ist blau."]
    lines += [f"- Pufferzeile {n:04d}" for n in range(301, 601)]
    (root / "docs/mini.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (tmp_path / "state.json").write_text(STATE_JSON)
    (tmp_path / "brain/wiki/page-ok.md").write_text(
        "---\ntype: note\n---\n\n# Ok\n\nDer Dienst lauscht auf Port 1919.\n\n"
        "Siehe auch [[page-bad]] für Details.\n", encoding="utf-8")
    (tmp_path / "brain/wiki/page-bad.md").write_text(
        "---\ntype: note\n---\n\n# Bad\n\nDie Statusfarbe ist rot.\n", encoding="utf-8")
    return tmp_path


def test_missing_source_fails_fast_without_llm(run_cmd, repo_root, testdir):
    run = run_cmd(
        ["bash", str(repo_root / "scripts/brain-verify-claims.sh"),
         "--source", "docs/nonexistent.md",
         "--wiki-dir", str(testdir / "brain/wiki"),
         "--root", str(testdir / "root"),
         "--state", str(testdir / "state.json")],
    )
    assert run.returncode == 2, run.output


def test_flags_contradiction_passes_faithful_summary(run_cmd, repo_root, testdir):
    lm_url = os.environ.get("LM_STUDIO_URL", "http://127.0.0.1:1919")
    if shutil.which("curl") is None:
        pytest.skip("LLM endpoint unreachable")
    probe = subprocess.run(["curl", "-sf", "-m", "8", f"{lm_url}/health"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if probe.returncode != 0:
        pytest.skip("LLM endpoint unreachable")
    run = run_cmd(
        ["bash", str(repo_root / "scripts/brain-verify-claims.sh"),
         "--source", "docs/mini.md",
         "--wiki-dir", str(testdir / "brain/wiki"),
         "--root", str(testdir / "root"),
         "--state", str(testdir / "state.json"),
         "--max-pairs", "0"],
        timeout=300,
    )
    assert run.returncode == 0, run.output
    assert "CLAIMS-OK: page-ok" in run.output
    assert "CLAIMS-FINDING: page-bad" in run.output
    assert "rot" in run.output
