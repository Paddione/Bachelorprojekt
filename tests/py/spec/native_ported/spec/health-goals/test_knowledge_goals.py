"""Native migration of tests/spec/health-goals/knowledge-goals.bats."""

import os
import subprocess

import pytest


@pytest.fixture
def kg(repo_root):
    return str(repo_root / "scripts" / "lib" / "knowledge-goals.py")


@pytest.fixture
def work(tmp_path):
    """Mirrors setup(): registry dir plus a cwd holding tests/spec/real-guard.bats."""
    reg = tmp_path / "registry"
    reg.mkdir()
    (tmp_path / "tests" / "spec").mkdir(parents=True)
    (tmp_path / "tests" / "spec" / "real-guard.bats").touch()
    return tmp_path


def _git(run_cmd, *args, cwd):
    result = run_cmd(["git", *args], cwd=cwd)
    assert result.returncode == 0, result.output
    return result


def _commit(run_cmd, cwd, message, all_changes=False):
    args = ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q"]
    args += ["-am", message] if all_changes else ["-m", message]
    _git(run_cmd, *args, cwd=cwd)


def test_g_know01_zaehlt_docs_only_regeln(work, kg, run_cmd):
    reg = work / "registry"
    (reg / "guardrails.yaml").write_text(
        "- id: A\n  enforced_by: docs-only\n"
        "- id: B\n  enforced_by: tests/spec/real-guard.bats\n"
        "- id: C\n  enforced_by: \"docs-only\"\n",
        encoding="utf-8",
    )
    result = run_cmd(
        ["python3", kg, "docs-only"], cwd=work, env={"HG_KNOW_REGISTRY": str(reg)}
    )
    assert result.returncode == 0, result.output
    assert result.output == "2"


def test_g_know03_zaehlt_verweise_ohne_datei_docs_only_nicht(work, kg, run_cmd):
    reg = work / "registry"
    (reg / "guardrails.yaml").write_text(
        "- id: A\n  enforced_by: hook-ohne-datei\n"
        "- id: B\n  enforced_by: tests/spec/real-guard.bats\n"
        "- id: C\n  enforced_by: docs-only\n"
        "- id: D\n  where: tests/spec/real-guard.bats:3, tests/spec/fehlt.bats\n"
        "- id: E\n  where: tests/spec/real-guard.bats::setup\n",
        encoding="utf-8",
    )
    result = run_cmd(
        ["python3", kg, "dangling"], cwd=work, env={"HG_KNOW_REGISTRY": str(reg)}
    )
    assert result.returncode == 0, result.output
    assert result.output == "2"


def test_fehlende_registry_meldet_verletzung_statt_0(work, kg):
    # bats run merges stderr and stdout in write order, so use a merged pipe here.
    proc = subprocess.run(
        ["python3", kg, "dangling"],
        cwd=str(work),
        env={**os.environ, "HG_KNOW_REGISTRY": str(work / "leer")},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=60,
    )
    assert proc.returncode == 0, proc.stdout
    assert proc.stdout.splitlines()[-1] == "99999"


def test_g_know02_04_zaehlt_docs_markdown_ausser_adr(work, kg, run_cmd):
    repo = work / "repo"
    repo.mkdir()
    _git(run_cmd, "init", "-q", cwd=repo)
    (repo / "docs" / "adr").mkdir(parents=True)
    (repo / "docs" / "x").mkdir()
    for rel in ("docs/a.md", "docs/x/b.md", "docs/adr/ADR-001-x.md", "docs/x/c.txt"):
        (repo / rel).touch()
    _git(run_cmd, "add", ".", cwd=repo)
    _commit(run_cmd, repo, "init")
    result = run_cmd(["python3", kg, "docs-md"], cwd=repo)
    assert result.output == "2"


def test_g_know06_zaehlt_inhaltsaenderungen_nicht_status_zeilen(work, kg, run_cmd):
    repo = work / "repo"
    repo.mkdir()
    _git(run_cmd, "init", "-q", cwd=repo)
    (repo / "docs" / "adr").mkdir(parents=True)
    adr = repo / "docs" / "adr" / "ADR-001-x.md"
    adr.write_text("# ADR-001\n**Status:** Entwurf\nInhalt\n", encoding="utf-8")
    _git(run_cmd, "add", ".", cwd=repo)
    _commit(run_cmd, repo, "add")
    adr.write_text(adr.read_text(encoding="utf-8").replace("Entwurf", "Final", 1), encoding="utf-8")
    _commit(run_cmd, repo, "status", all_changes=True)
    result = run_cmd(["python3", kg, "adr-edits"], cwd=repo)
    assert result.output == "0"
    with adr.open("a", encoding="utf-8") as fh:
        fh.write("Nachtrag\n")
    _commit(run_cmd, repo, "edit", all_changes=True)
    result = run_cmd(["python3", kg, "adr-edits"], cwd=repo)
    assert result.output == "1"


def test_g_know05_summiert_agents_md_claude_md_symlinks_nicht(work, kg, run_cmd):
    repo = work / "repo"
    repo.mkdir()
    _git(run_cmd, "init", "-q", cwd=repo)
    (repo / "sub").mkdir()
    (repo / "AGENTS.md").write_text("12345", encoding="utf-8")
    (repo / "sub" / "CLAUDE.md").write_text("123", encoding="utf-8")
    os.symlink("../AGENTS.md", repo / "sub" / "AGENTS.md")
    _git(run_cmd, "add", ".", cwd=repo)
    _commit(run_cmd, repo, "init")
    result = run_cmd(["python3", kg, "agent-ctx-bytes"], cwd=repo)
    assert result.output == "8"
