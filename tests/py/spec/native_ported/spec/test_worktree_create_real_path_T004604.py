"""Native migration of tests/spec/worktree-create-real-path-T004604.bats."""

import re
import subprocess

import pytest


@pytest.fixture
def lib(repo_root):
    path = repo_root / "scripts" / "lib" / "worktree-real-path.sh"
    if not path.is_file():
        pytest.skip("lib scripts/lib/worktree-real-path.sh existiert noch nicht (Rot-Phase)")
    return str(path)


def _git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def _repo_with_commit(work):
    work.mkdir()
    _git(work, "init", "-q", "main")
    _git(work / "main", "config", "user.email", "t@t")
    _git(work / "main", "config", "user.name", "t")
    (work / "main" / "f").write_text("x\n")
    _git(work / "main", "add", "f")
    _git(work / "main", "commit", "-qm", "init")


def test_t004604_m1_worktree_real_path_liefert_den_registrierten_pfad_eines_worktrees(run_cmd, tmp_path, lib):
    work = tmp_path / "work"
    _repo_with_commit(work)
    subprocess.run(["git", "-C", "main", "worktree", "add", "-q", "wt-a", "-b", "branch-a"],
                   cwd=work, check=True, capture_output=True)
    r = run_cmd(["bash", "-c", f"source '{lib}'\nworktree_real_path '{work}/main' '{work}/main/wt-a'\n"])
    assert r.returncode == 0
    assert "wt-a" in r.output


def test_t004604_m2_worktree_real_path_gibt_leeren_output_fuer_nicht_registrierte_pfade(run_cmd, tmp_path, lib):
    work = tmp_path / "work"
    _repo_with_commit(work)
    r = run_cmd(["bash", "-c", f"source '{lib}'\nworktree_real_path '{work}/main' '{work}/main/ghost'\n"])
    assert r.returncode == 0
    assert r.output == ""


def test_t004604_m3_create_skript_warnt_bei_abweichung_zwischen_uebergebenem_und_realem_pfad(repo_root):
    script = repo_root / "scripts" / "worktree-create.sh"
    assert script.is_file()
    assert re.search(r"realer Pfad|real path|weicht ab|worktree_real_path", script.read_text(encoding="utf-8"))


def test_t004604_m4_abschlussmeldung_nennt_den_realen_pfad_nicht_nur_den_uebergebenen(repo_root):
    script = repo_root / "scripts" / "worktree-create.sh"
    assert script.is_file()
    text = script.read_text(encoding="utf-8")
    assert re.search(r"ready.*worktree_real_path|ready.*REAL_WT|ready.*realen Pfad", text)
