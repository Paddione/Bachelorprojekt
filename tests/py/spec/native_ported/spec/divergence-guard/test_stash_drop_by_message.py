"""Native migration of tests/spec/divergence-guard/stash-drop-by-message.bats."""

import subprocess

import pytest


@pytest.fixture
def stash_repo(repo_root, tmp_path):
    """BATS setup(): temp repo with one base commit."""
    repo = tmp_path / "tmp"
    repo.mkdir()
    for args in (["init", "-q"], ["config", "user.email", "test@example.invalid"],
                 ["config", "user.name", "bats"], ["config", "commit.gpgsign", "false"]):
        subprocess.run(["git", "-C", str(repo), *args], check=True)
    (repo / "f.txt").write_text("base\n")
    subprocess.run(["git", "-C", str(repo), "add", "f.txt"], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "base"], check=True)
    return {"repo": repo, "script": str(repo_root / "scripts" / "git-stash-net.sh")}


def _git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout


def _push(repo, text, msg):
    with open(repo / "f.txt", "a") as fh:
        fh.write(text + "\n")
    _git(repo, "stash", "push", "-qm", msg)


def _seed(repo):
    _push(repo, "a", "T005591 first")
    _push(repo, "b", "T004897 second")
    _push(repo, "c", "T006298 third")


def _drop(run_cmd, s, pattern):
    return run_cmd(["bash", s["script"], "drop", "--by-message", pattern], cwd=s["repo"])


def test_drop_by_message_entfernt_genau_den_matchnden_eintrag_positiv_anker(run_cmd, stash_repo):
    _seed(stash_repo["repo"])
    r = _drop(run_cmd, stash_repo, "T005591")
    assert r.returncode == 0
    out = _git(stash_repo["repo"], "stash", "list")
    assert "T005591" not in out
    assert "T004897" in out
    assert "T006298" in out


def test_zwei_aufeinanderfolgende_drops_per_message_loeschen_je_den_richtigen_eintrag_t006298(run_cmd, stash_repo):
    _seed(stash_repo["repo"])
    assert _drop(run_cmd, stash_repo, "T005591").returncode == 0
    assert _drop(run_cmd, stash_repo, "T004897").returncode == 0
    out = _git(stash_repo["repo"], "stash", "list")
    assert "T006298" in out
    assert "T005591" not in out
    assert "T004897" not in out


def test_mehrdeutiges_muster_bricht_ab_ohne_etwas_zu_entfernen(run_cmd, stash_repo):
    repo = stash_repo["repo"]
    _seed(repo)
    _push(repo, "d", "WIP T006298 duplicate")
    before = _git(repo, "stash", "list")
    r = _drop(run_cmd, stash_repo, "T006298")
    assert r.returncode == 3
    assert "mehrdeutig" in r.output
    assert _git(repo, "stash", "list") == before


def test_muster_ohne_treffer_schlaegt_fail_closed_fehl_und_entfernt_nichts(run_cmd, stash_repo):
    repo = stash_repo["repo"]
    _seed(repo)
    before = _git(repo, "stash", "list")
    r = _drop(run_cmd, stash_repo, "T999999")
    assert r.returncode == 2
    assert "kein Stash-Eintrag" in r.output
    assert _git(repo, "stash", "list") == before
