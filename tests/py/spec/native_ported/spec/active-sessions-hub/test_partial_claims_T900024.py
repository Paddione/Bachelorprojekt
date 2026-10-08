"""Native migration of tests/spec/active-sessions-hub/partial-claims-T900024.bats."""

import subprocess

import pytest


@pytest.fixture
def partial_repo(repo_root, tmp_path, monkeypatch):
    """BATS setup(): temp git repo with two files; lock dir inside tmp_path."""
    repo = tmp_path / "repo"
    (repo / "src").mkdir(parents=True)
    for args in (["init", "-b", "main"], ["config", "user.email", "test@example.com"],
                 ["config", "user.name", "Test User"]):
        subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)
    (repo / "src" / "fileA.txt").write_text("a\n")
    (repo / "src" / "fileB.txt").write_text("b\n")
    subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-q", "-m", "chore: init"], check=True, capture_output=True)

    locks = tmp_path / "locks"
    locks.mkdir()
    monkeypatch.setenv("AGENT_LOCK_DIR", str(locks))
    return {
        "repo": repo,
        "guard": str(repo_root / "scripts" / "hooks" / "worktree-write-guard.sh"),
        "lock": str(repo_root / "scripts" / "agent-lock.sh"),
        "locks": locks,
        "sid_a": "sid-partial-a",
        "sid_b": "sid-partial-b",
        "file_a": str(repo / "src" / "fileA.txt"),
        "file_b": str(repo / "src" / "fileB.txt"),
    }


def _guard(run_cmd, p, sid, target):
    return run_cmd(["bash", "-c", 'printf \'{"tool_input":{"file_path":"%s"}}\\n\' "$TARGET" | bash "$GUARD"'],
                   cwd=p["repo"], env={"AGENT_LOCK_SID": sid, "TARGET": target, "GUARD": p["guard"]})


def _claim(run_cmd, p, sid, name, branch, label, files=None, worktree=None):
    cmd = ["bash", p["lock"], "claim", "partial", name, "--worktree", str(worktree or p["repo"]),
           "--branch", branch, "--label", label]
    if files:
        cmd += ["--files", files]
    return run_cmd(cmd, cwd=p["repo"], env={"AGENT_LOCK_SID": sid})


def _claim_a_on_file_a(run_cmd, p):
    return _claim(run_cmd, p, p["sid_a"], "p1", "main", "partial p1", files="src/fileA.txt")


def test_agent_lock_claim_files_wird_akzeptiert_und_persistiert_die_dateiliste(run_cmd, partial_repo):
    r = _claim_a_on_file_a(run_cmd, partial_repo)
    assert r.returncode == 0
    text = (partial_repo["locks"] / "partial__p1.json").read_text()
    assert "target_files" in text
    assert "src/fileA.txt" in text


def test_guard_fremder_partial_claim_laesst_die_nicht_geclaimte_datei_zu(run_cmd, partial_repo):
    _claim_a_on_file_a(run_cmd, partial_repo)
    r = _guard(run_cmd, partial_repo, partial_repo["sid_b"], partial_repo["file_b"])
    assert r.returncode == 0


def test_guard_session_b_darf_ein_zweites_partial_im_selben_worktree_claimen(run_cmd, partial_repo):
    _claim_a_on_file_a(run_cmd, partial_repo)
    r = _claim(run_cmd, partial_repo, partial_repo["sid_b"], "p2", "main", "partial p2", files="src/fileB.txt")
    assert r.returncode == 0


def test_guard_zugriff_auf_die_fremd_geclaimte_datei_wird_unter_nennung_des_halters_abgelehnt(run_cmd, partial_repo):
    p = partial_repo
    _claim_a_on_file_a(run_cmd, p)
    _claim(run_cmd, p, p["sid_b"], "p2", "main", "partial p2", files="src/fileB.txt")
    r = _guard(run_cmd, p, p["sid_b"], p["file_a"])
    assert r.returncode == 2
    assert p["sid_a"] in r.output
    assert "src/fileA.txt" in r.output


def test_guard_eigene_datei_bleibt_schreibbar_waehrend_das_fremde_partial_lebt(run_cmd, partial_repo):
    p = partial_repo
    _claim_a_on_file_a(run_cmd, p)
    _claim(run_cmd, p, p["sid_b"], "p2", "main", "partial p2", files="src/fileB.txt")
    r = _guard(run_cmd, p, p["sid_b"], p["file_b"])
    assert r.returncode == 0


def test_guard_claim_ohne_dateiliste_bleibt_worktree_weit_sperrend_rueckfallebene(run_cmd, partial_repo):
    p = partial_repo
    r = run_cmd(["bash", p["lock"], "claim", "branch", "main-worktree", "--worktree", str(p["repo"]),
                 "--branch", "main", "--label", "ganzer worktree"], cwd=p["repo"], env={"AGENT_LOCK_SID": p["sid_a"]})
    assert r.returncode == 0
    r = _guard(run_cmd, p, p["sid_b"], p["file_b"])
    assert r.returncode == 2
    assert p["sid_a"] in r.output
