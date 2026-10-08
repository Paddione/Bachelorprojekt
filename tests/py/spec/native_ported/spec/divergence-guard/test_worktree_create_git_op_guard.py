"""Native migration of tests/spec/divergence-guard/worktree-create-git-op-guard.bats."""

import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def guard(repo_root, tmp_path, monkeypatch):
    """BATS setup(): isolated HOME and a throwaway repo without origin."""
    home = tmp_path / "home"
    home.mkdir()
    gitconfig = home / ".gitconfig"
    gitconfig.write_text("")
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(gitconfig))
    main = tmp_path / "main"
    main.mkdir()
    for args in (["init", "-q", "-b", "main"], ["config", "user.email", "t@example.invalid"],
                 ["config", "user.name", "Tester"]):
        subprocess.run(["git", "-C", str(main), *args], check=True)
    (main / "file.txt").write_text("base\n")
    for args in (["add", "-A"], ["commit", "-qm", "init"]):
        subprocess.run(["git", "-C", str(main), *args], check=True)
    return {"helper": str(repo_root / "scripts" / "worktree-create.sh"), "main": main, "tmp": tmp_path}


def _git(cwd, *args, check=True):
    return subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, text=True, check=check)


def _make_mid_rebase_worktree(run_cmd, g, branch, path):
    """Create a worktree via the helper and leave it mid-rebase, conflict resolved, not continued."""
    run_cmd(["bash", "-c", f"cd '{g['main']}' && bash '{g['helper']}' {branch} '{path}' HEAD"])
    (path / "file.txt").write_text("featside\n")
    _git(path, "commit", "-qam", "feat")
    (g["main"] / "file.txt").write_text("mainside\n")
    _git(g["main"], "commit", "-qam", "mainside")
    _git(path, "rebase", "main", check=False)
    (path / "file.txt").write_text("resolved\n")
    _git(path, "add", "file.txt")
    state = _git(path, "rev-parse", "--git-path", "rebase-merge").stdout.strip()
    return path / state


def test_t003215_positiv_anker_ein_sauberer_worktree_am_zielpfad_wird_weiterhin_anstandslos_wiederverwendet(run_cmd, guard):
    g = guard
    wt = g["tmp"] / "wt-clean"
    cmd = f"cd '{g['main']}' && bash '{g['helper']}' fix/anker-T003215 '{wt}' HEAD"
    assert run_cmd(["bash", "-c", cmd]).returncode == 0
    r = run_cmd(["bash", "-c", cmd])
    assert r.returncode == 0
    assert wt.is_dir()


def test_t003215_ein_worktree_mitten_im_rebase_am_zielpfad_bricht_die_anlage_ab_statt_still_weiterzulaufen(run_cmd, guard):
    g = guard
    wt = g["tmp"] / "wt-mid"
    state = _make_mid_rebase_worktree(run_cmd, g, "fix/midrebase-T003215", wt)
    assert state.is_dir()
    r = run_cmd(["bash", "-c", f"cd '{g['main']}' && bash '{g['helper']}' fix/midrebase-T003215 '{wt}' HEAD"])
    assert r.returncode != 0
    assert str(wt) in r.output


def test_t003215_der_abgebrochene_rebase_ueberlebt_den_lauf_nichts_wird_force_entfernt(run_cmd, guard):
    g = guard
    wt = g["tmp"] / "wt-survive"
    state = _make_mid_rebase_worktree(run_cmd, g, "fix/survive-T003215", wt)
    assert state.is_dir()
    r = run_cmd(["bash", "-c", f"cd '{g['main']}' && bash '{g['helper']}' fix/survive-T003215 '{wt}' HEAD"])
    assert r.returncode != 127
    assert state.is_dir()
    assert (wt / "file.txt").read_text().strip() == "resolved"


def test_t003215_der_abbruch_traegt_einen_eigenen_exit_code_5_unterscheidbar_von_1_3_4(run_cmd, guard):
    g = guard
    wt = g["tmp"] / "wt-exit"
    state = _make_mid_rebase_worktree(run_cmd, g, "fix/exitcode-T003215", wt)
    assert state.is_dir()
    r = run_cmd(["bash", "-c", f"cd '{g['main']}' && bash '{g['helper']}' fix/exitcode-T003215 '{wt}' HEAD"])
    assert r.returncode == 5


def test_t003215_positiv_anker_ein_fremder_worktree_im_rebase_blockiert_eine_anlage_an_anderem_pfad_nicht(run_cmd, guard):
    g = guard
    state = _make_mid_rebase_worktree(run_cmd, g, "fix/fremd-T003215", g["tmp"] / "wt-fremd")
    assert state.is_dir()
    wt = g["tmp"] / "wt-neu"
    r = run_cmd(["bash", "-c", f"cd '{g['main']}' && bash '{g['helper']}' fix/neu-T003215 '{wt}' HEAD"])
    assert r.returncode == 0
    assert wt.is_dir()
