"""Native migration of tests/spec/unsloth-training-env/agent-discovery.bats."""

import re
import shutil

import pytest


@pytest.fixture
def repo(repo_root):
    if shutil.which("task") is None:
        pytest.skip("go-task nicht installiert")
    return repo_root


def test_agent_discovery_die_finetune_tasks_sind_ueber_den_task_oracle_im_trockenlauf_aufloesbar(run_cmd, repo):
    vda = str(repo / "scripts" / "vda.sh")
    # Positiv-Anker: bekannte Task loest ueber den strukturellen Fast-Path auf.
    r = run_cmd(["bash", vda, "oracle", "--dry-run", "llm:status"], cwd=repo)
    if r.returncode != 0:
        version = run_cmd(["task", "--version"], cwd=repo).output
        listing = "\n".join(run_cmd(["bash", "-c", "task --list-all 2>&1 | head -5"], cwd=repo).output.splitlines())
        pytest.fail(
            f"oracle --dry-run 'llm:status' exit={r.returncode}\n"
            f"oracle output: {r.output}\ntask --version: {version}\ntask --list-all (erste 5 Zeilen): {listing}"
        )
    assert "task llm:status" in r.output

    for t in ("measure", "guard", "train", "train-vision", "export"):
        r = run_cmd(["bash", vda, "oracle", "--dry-run", f"finetune:{t}"], cwd=repo)
        assert r.returncode == 0, f"finetune:{t} → exit={r.returncode} output={r.output}"
        assert f"task finetune:{t}" in r.output


def test_agent_discovery_der_fast_path_ueberlebt_eine_gefaerbte_task_ausgabe_t002587(run_cmd, repo):
    vda = str(repo / "scripts" / "vda.sh")
    r = run_cmd(["bash", vda, "oracle", "--dry-run", "llm:status"], cwd=repo)
    assert r.returncode == 0

    r = run_cmd(["env", "FORCE_COLOR=1", "bash", vda, "oracle", "--dry-run", "llm:status"], cwd=repo)
    assert r.returncode == 0, f"gefaerbte Ausgabe bricht den Fast-Path: {r.output}"
    assert "task llm:status" in r.output


def test_agent_discovery_toolset_context_sh_gibt_die_repo_instanz_fuer_eine_berechtigte_rolle_aus(run_cmd, repo):
    r = run_cmd(["bash", str(repo / "scripts" / "toolset-context.sh"), "bachelorprojekt-ops"], cwd=repo)
    assert r.returncode == 0
    assert "cli:scripts/finetune" in r.output

    registry = (repo / "docs" / "agent-guide" / "registry" / "capabilities.yaml").read_text(encoding="utf-8")
    count = len(re.findall(r"state: canonical", registry))
    # Positiv-Anker: es gibt canonical-Eintraege im Repo.
    assert count > 0
