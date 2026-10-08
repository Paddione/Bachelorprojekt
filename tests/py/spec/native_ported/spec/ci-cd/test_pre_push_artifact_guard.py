"""Native migration of tests/spec/ci-cd/pre-push-artifact-guard.bats.

[T901392] Die Testdateien im Wegwerf-Repo sind pytest-Module unter tests/py/spec/."""

import subprocess
from pathlib import Path

import pytest

TI = "components/website/src/data/test-inventory.json"
RI = "docs/code-quality/repo-index.json"
NEW_TEST = "tests/py/spec/test_neu.py"
OLD_TEST = "tests/py/spec/test_alt.py"


class _Repo:
    def __init__(self, path: Path):
        self.path = path

    def git(self, *args) -> str:
        return subprocess.run(["git", *args], cwd=str(self.path), capture_output=True,
                              text=True, check=True).stdout

    def write(self, rel: str, text: str):
        p = self.path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)

    def commit_test_with(self, *artifacts) -> str:
        self.write(NEW_TEST, '"""Neu."""\n\n\ndef test_neu():\n    pass\n')
        self.git("add", NEW_TEST)
        for artifact in artifacts:
            self.write(artifact, '{"changed":true}\n')
            self.git("add", artifact)
        self.git("commit", "-qm", "change test")
        return self.git("rev-parse", "HEAD").strip()


@pytest.fixture
def repo(repo_root, tmp_path):
    testrepo = tmp_path / "repo"
    testrepo.mkdir()
    r = _Repo(testrepo)
    r.git("init", "-q", "-b", "main", ".")
    r.git("config", "user.email", "test@example.invalid")
    r.git("config", "user.name", "Test")
    r.git("config", "commit.gpgsign", "false")
    # Basis-Commit: beide generierten Artefakte existieren bereits.
    r.write(RI, "{}\n")
    r.write(TI, "[]\n")
    r.write(OLD_TEST, '"""Alt."""\n\n\ndef test_alt():\n    pass\n')
    r.git("add", "-A")
    r.git("commit", "-qm", "base")
    r.base_sha = r.git("rev-parse", "HEAD").strip()
    r.script = repo_root / "scripts/hooks/check-freshness-artifacts.sh"
    return r


def _run(run_cmd, r, head):
    return run_cmd(["bash", str(r.script), r.base_sha, head], cwd=r.path)


def test_schweigt_wenn_test_inventory_im_push_liegt(run_cmd, repo):
    head = repo.commit_test_with(TI)
    res = _run(run_cmd, repo, head)
    assert res.returncode == 0
    assert res.output == ""


def test_fordert_repo_index_nie_ein(run_cmd, repo):
    # Positiv-Anker: das Skript schlaegt an und nennt test-inventory.
    head = repo.commit_test_with()
    res = _run(run_cmd, repo, head)
    assert res.output != ""
    assert "test-inventory.json" in res.output
    assert res.returncode != 0
    assert "repo-index.json" not in res.output


def test_meldet_test_inventory_wenn_nur_repo_index_im_push_liegt(run_cmd, repo):
    head = repo.commit_test_with(RI)
    res = _run(run_cmd, repo, head)
    assert res.output != ""
    assert "test-inventory.json" in res.output
    assert "repo-index.json" not in res.output
    assert res.returncode != 0


def test_schweigt_wenn_beide_im_push_liegen(run_cmd, repo):
    head = repo.commit_test_with(RI, TI)
    res = _run(run_cmd, repo, head)
    assert res.returncode == 0
    assert res.output == ""


def test_fordert_bei_reiner_aenderung_einer_nicht_test_datei_nichts(run_cmd, repo):
    # repo-index.json existiert im Fixture -> Modify, kein Add.
    repo.write(RI, '{"x":1}\n')
    repo.git("add", RI)
    repo.git("commit", "-qm", "modify only")
    head = repo.git("rev-parse", "HEAD").strip()
    res = _run(run_cmd, repo, head)
    assert res.returncode == 0
    assert res.output == ""


def test_schweigt_bei_neuer_nicht_test_datei(run_cmd, repo):
    repo.write("components/website/src/lib/neu.test.ts", "export const x = 1;\n")
    repo.git("add", "components/website/src/lib/neu.test.ts")
    repo.git("commit", "-qm", "add non-test file")
    head = repo.git("rev-parse", "HEAD").strip()
    res = _run(run_cmd, repo, head)
    assert res.returncode == 0
    assert res.output == ""


def test_fordert_test_inventory_bei_neuer_testdatei(run_cmd, repo):
    # Positiver Gegenpol zu den Schweige-Tests.
    repo.write(NEW_TEST, '"""Neu."""\n\n\ndef test_neu():\n    pass\n')
    repo.git("add", NEW_TEST)
    repo.git("commit", "-qm", "add test file")
    head = repo.git("rev-parse", "HEAD").strip()
    res = _run(run_cmd, repo, head)
    assert res.returncode == 1
    assert TI in res.output
    assert "repo-index.json" not in res.output


def test_fordert_test_inventory_beim_loeschen_einer_testdatei(run_cmd, repo):
    repo.git("rm", "-q", OLD_TEST)
    repo.git("commit", "-qm", "delete file")
    head = repo.git("rev-parse", "HEAD").strip()
    res = _run(run_cmd, repo, head)
    assert res.returncode == 1
    assert TI in res.output
    assert "repo-index.json" not in res.output
