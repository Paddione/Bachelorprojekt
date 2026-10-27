"""Native migration of tests/spec/unsloth-training-env/agent-discovery.bats."""

import re
import shutil

import pytest


@pytest.fixture
def repo(repo_root):
    if shutil.which("task") is None:
        pytest.skip("go-task nicht installiert")
    return repo_root



    vda = str(repo / "scripts" / "vda.sh")
    r = run_cmd(["bash", vda, "oracle", "--dry-run", "llm:status"], cwd=repo)
    assert r.returncode == 0

    r = run_cmd(["env", "FORCE_COLOR=1", "bash", vda, "oracle", "--dry-run", "llm:status"], cwd=repo)
    assert r.returncode == 0, f"gefaerbte Ausgabe bricht den Fast-Path: {r.output}"
    assert "task llm:status" in r.output


def test_agent_discovery_toolset_context_sh_gibt_die_repo_instanz_fuer_eine_berechtigte_rolle_aus(run_cmd, repo):
    r = run_cmd(["bash", str(repo / "scripts" / "toolset-context.sh"), "bachelorprojekt-ops"], cwd=repo)
    assert r.returncode == 0
    assert "cli:gh-axi" in r.output

    registry = (repo / "docs" / "agent-guide" / "registry" / "capabilities.yaml").read_text(encoding="utf-8")
    count = len(re.findall(r"state: canonical", registry))
    # Positiv-Anker: es gibt canonical-Eintraege im Repo.
    assert count > 0
