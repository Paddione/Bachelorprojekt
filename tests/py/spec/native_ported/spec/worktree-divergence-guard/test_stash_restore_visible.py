"""Native migration of tests/spec/worktree-divergence-guard/stash-restore-visible.bats."""
# [T002673]
# A failed `git stash pop` inside worktree-create.sh must not be swallowed. Command output
# verification [T002448-M4]: a real repo pair is built, worktree-create.sh is executed, its output and

# the stash state are checked.

import pytest

GIT_ID = ["-c", "user.email=test@example.invalid", "-c", "user.name=Test", "-c", "commit.gpgsign=false"]


def git(run_cmd, cwd, *args):
    return run_cmd(["git", *GIT_ID, *args], cwd=cwd)


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

    (clone / "shared.txt").write_text("zeile-eins\n", encoding="utf-8")
    git(run_cmd, clone, "add", "shared.txt").check()
    git(run_cmd, clone, "commit", "-qm", "base").check()
    git(run_cmd, clone, "branch", "-M", "main").check()
    git(run_cmd, clone, "push", "-q", "origin", "main").check()

    # origin changes the same line -> local main is behind, and a stash on this file collides on pop.
    run_cmd(["git", "clone", "-q", "-b", "main", str(origin), str(upstream)]).check()
    git(run_cmd, upstream, "config", "user.email", "test@example.invalid")
    git(run_cmd, upstream, "config", "user.name", "Test")
    git(run_cmd, upstream, "config", "commit.gpgsign", "false")
    (upstream / "shared.txt").write_text("zeile-eins-vom-remote\n", encoding="utf-8")
    git(run_cmd, upstream, "commit", "-qam", "remote aendert dieselbe Zeile").check()
    git(run_cmd, upstream, "push", "-q", "origin", "main").check()
    git(run_cmd, clone, "fetch", "-q", "origin").check()

    # Dirty main checkout on the same line -> pop conflict is guaranteed.
    (clone / "shared.txt").write_text("zeile-eins-lokal-uneingecheckt\n", encoding="utf-8")
    return {"clone": clone, "tmp": tmp_path, "run_cmd": run_cmd,
            "script": str(repo_root / "scripts" / "worktree-create.sh")}


def test_worktree_create_sauberer_haupt_checkout_laeuft_trotz_fast_forward_durch(pair):
    git(pair["run_cmd"], pair["clone"], "checkout", "-q", "--", "shared.txt").check()
    assert pair["run_cmd"](["git", "diff", "--quiet", "HEAD"], cwd=pair["clone"]).returncode == 0

    res = pair["run_cmd"](["bash", pair["script"], "fix/clean-probe-T000002",
                           str(pair["tmp"] / "wt-clean")], cwd=pair["clone"])
    # Positive anchor: the script entered the fast-forward path at all.
    assert "behind origin/main" in res.output
    assert res.returncode == 0, res.output
    assert "ready on" in res.output


def test_worktree_create_gescheiterter_stash_pop_wird_laut_gemeldet_nicht_verschluckt(pair):
    res = pair["run_cmd"](["bash", pair["script"], "fix/stash-probe-T000001",
                           str(pair["tmp"] / "wt")], cwd=pair["clone"])
    # Positive anchor [T002356-M1]: the script ran and reached the stash path.
    assert res.output != ""
    assert ("stash" in res.output) or ("Stash" in res.output)

    # The stash must not stay silently behind: either restored (working copy dirty again) or announced.
    listing = pair["run_cmd"](["git", "stash", "list"], cwd=pair["clone"]).stdout
    stash_count = sum(1 for l in listing.splitlines() if "worktree-create-auto-stash" in l)
    if stash_count > 0:
        # Left behind -> the output MUST say so and name the stash.
        assert "worktree-create-auto-stash" in res.output
        assert "git stash" in res.output
    else:
        # Restored cleanly -> the local change is back.
        assert "zeile-eins-lokal-uneingecheckt" in (pair["clone"] / "shared.txt").read_text(encoding="utf-8")
