"""Native migration of tests/spec/agent-behavior/collision-own-worktree.bats."""

import subprocess

import pytest


@pytest.fixture
def collision_env(repo_root, tmp_path, monkeypatch):
    """BATS setup(): two repos with uncommitted changes to the same file, shared lock dir."""
    mine = tmp_path / "mine"
    peer = tmp_path / "peer"
    locks = tmp_path / "locks"
    locks.mkdir()
    for d in (mine, peer):
        d.mkdir()
        for args in (["init", "--quiet"], ["config", "user.email", "t@example.com"],
                     ["config", "user.name", "Test"]):
            subprocess.run(["git", "-C", str(d), *args], check=True)
        (d / "datei.txt").write_text("base\n")
        for args in (["add", "datei.txt"], ["commit", "--quiet", "-m", "base"], ["branch", "-M", "main"]):
            subprocess.run(["git", "-C", str(d), *args], check=True)
        # Uncommitted change in BOTH trees, otherwise the detector sees no overlap.
        (d / "datei.txt").write_text(f"geaendert in {d}\n")
    monkeypatch.setenv("AGENT_LOCK_DIR", str(locks))
    return {"script": str(repo_root / "scripts" / "agent-collision.sh"), "mine": mine,
            "peer": peer, "locks": locks}


def _write_lock(env, sid, worktree):
    (env["locks"] / "branch__main.json").write_text(
        '{"scope":"branch","id":"main","owner_sid":"%s","owner_pid":999999,\n'
        ' "tool":"claude","label":"dev-flow-plan","branch":"main","worktree":"%s"}\n' % (sid, worktree)
    )


def _check(run_cmd, env, extra_env=None, unset=None):
    if unset:
        return run_cmd(["env", "-u", unset, "bash", env["script"], "check", "--all"], cwd=env["mine"])
    return run_cmd(["bash", env["script"], "check", "--all"], cwd=env["mine"], env=extra_env)


def test_t002523_m2_positiv_anker_eine_fremde_session_an_derselben_datei_wird_gemeldet(run_cmd, collision_env):
    _write_lock(collision_env, "fremde-session-uuid-0000", collision_env["peer"])
    r = _check(run_cmd, collision_env, {"AGENT_LOCK_SID": "meine-session-uuid-1111"})
    assert r.output.count("COLLISION") >= 1


def test_t002523_m2_fremder_worktree_mit_der_eigenen_sid_wird_nicht_gemeldet(run_cmd, collision_env):
    _write_lock(collision_env, "meine-session-uuid-1111", collision_env["peer"])
    r = _check(run_cmd, collision_env, {"AGENT_LOCK_SID": "meine-session-uuid-1111"})
    assert r.output.count("COLLISION") == 0


def test_t002523_m2_der_eigene_worktree_wird_nicht_gemeldet_auch_wenn_agent_lock_sid_fehlt(run_cmd, collision_env):
    _write_lock(collision_env, "meine-session-uuid-1111", collision_env["mine"])
    r = _check(run_cmd, collision_env, unset="AGENT_LOCK_SID")
    assert r.output.count("COLLISION") == 0
