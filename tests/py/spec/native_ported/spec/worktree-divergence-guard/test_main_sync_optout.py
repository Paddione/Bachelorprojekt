"""Native migration of tests/spec/worktree-divergence-guard/main-sync-optout.bats."""
# [T900043/Befund 4]
# Each test builds a real repo pair (bare origin + clone), puts local main behind origin/main and runs
# scripts/worktree-create.sh. Command output verification [T002448-M4]: main SHA moved or not, exit

# status and message.

import pytest

GIT_ID = ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "-c", "commit.gpgsign=false"]


def git(run_cmd, cwd, *args):
    return run_cmd(["git", *GIT_ID, *args], cwd=cwd)


def rev(run_cmd, cwd, ref):
    return run_cmd(["git", "rev-parse", ref], cwd=cwd).stdout.strip()


@pytest.fixture
def pair(run_cmd, repo_root, tmp_path):
    origin = tmp_path / "origin.git"
    clone = tmp_path / "clone"
    upstream = tmp_path / "upstream"
    run_cmd(["git", "init", "-q", "--bare", "-b", "main", str(origin)]).check()
    run_cmd(["git", "clone", "-q", str(origin), str(clone)]).check()
    git(run_cmd, clone, "config", "user.email", "test@example.invalid")
    git(run_cmd, clone, "config", "user.name", "Test")
    git(run_cmd, clone, "config", "commit.gpgsign", "false")

    (clone / "shared.txt").write_text("basis\n", encoding="utf-8")
    git(run_cmd, clone, "add", "shared.txt").check()
    git(run_cmd, clone, "commit", "-qm", "base").check()
    git(run_cmd, clone, "branch", "-M", "main").check()
    git(run_cmd, clone, "push", "-q", "origin", "main").check()

    # origin/main one commit ahead -> local main is behind.
    run_cmd(["git", "clone", "-q", "-b", "main", str(origin), str(upstream)]).check()
    git(run_cmd, upstream, "config", "user.email", "test@example.invalid")
    git(run_cmd, upstream, "config", "user.name", "Test")
    git(run_cmd, upstream, "config", "commit.gpgsign", "false")
    (upstream / "shared.txt").write_text("remote-voraus\n", encoding="utf-8")
    git(run_cmd, upstream, "commit", "-qam", "remote voraus").check()
    git(run_cmd, upstream, "push", "-q", "origin", "main").check()
    git(run_cmd, clone, "fetch", "-q", "origin").check()

    return {"clone": clone, "origin": origin, "script": str(repo_root / "scripts" / "worktree-create.sh"),
            "run_cmd": run_cmd, "tmp": tmp_path}


def _create(pair, *args, env=None):
    return pair["run_cmd"](["bash", pair["script"], *args], cwd=pair["clone"], env=env)


def test_worktree_create_cleaner_baum_ohne_opt_out_synct_main_und_liefert_ready(pair):
    before = rev(pair["run_cmd"], pair["clone"], "main")
    origin_sha = rev(pair["run_cmd"], pair["clone"], "origin/main")
    # Positive anchor: local main really is behind origin/main.
    assert before != origin_sha

    res = _create(pair, "fix/clean-probe-T000002", str(pair["tmp"] / "wt-clean"))
    assert res.returncode == 0, res.output
    assert "ready on" in res.output
    assert rev(pair["run_cmd"], pair["clone"], "main") == origin_sha


def test_worktree_create_devflow_no_main_sync_1_laesst_main_unberuehrt_lauf_geht_weiter(pair):
    before = rev(pair["run_cmd"], pair["clone"], "main")
    res = _create(pair, "fix/optout-probe-T000002", str(pair["tmp"] / "wt-optout"),
                  env={"DEVFLOW_NO_MAIN_SYNC": "1"})
    assert res.returncode == 0, res.output
    assert "ready on" in res.output
    assert rev(pair["run_cmd"], pair["clone"], "main") == before
    assert "DEVFLOW_NO_MAIN_SYNC" in res.output


def test_worktree_create_no_main_sync_flag_laesst_main_unberuehrt_lauf_geht_weiter(pair):
    before = rev(pair["run_cmd"], pair["clone"], "main")
    res = _create(pair, "--no-main-sync", "fix/flag-probe-T000002", str(pair["tmp"] / "wt-flag"))
    assert res.returncode == 0, res.output
    assert "ready on" in res.output
    assert rev(pair["run_cmd"], pair["clone"], "main") == before


def test_worktree_create_dirty_baum_bricht_fail_closed_ab_statt_still_zu_syncen(pair):
    before = rev(pair["run_cmd"], pair["clone"], "main")
    (pair["clone"] / "shared.txt").write_text("lokal-dirty\n", encoding="utf-8")
    assert pair["run_cmd"](["git", "diff", "--quiet", "HEAD"], cwd=pair["clone"]).returncode != 0

    res = _create(pair, "fix/dirty-probe-T000002", str(pair["tmp"] / "wt-dirty"))
    assert res.returncode != 0
    # No main touch ...
    assert rev(pair["run_cmd"], pair["clone"], "main") == before
    # ... dirty content intact ...
    assert "lokal-dirty" in (pair["clone"] / "shared.txt").read_text(encoding="utf-8")
    # ... and no auto-stash left behind.
    assert pair["run_cmd"](["git", "stash", "list"], cwd=pair["clone"]).stdout.strip() == ""
