"""Native migration of tests/spec/dev-flow-plan/plan-preflight-staged-set.bats."""
# T005114: plan-preflight pre-commit checks the STAGED set (plan artifacts only), not the whole

# working tree. Command output verification [T002448-M4]. Positive anchor first, then negative.

import pytest

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@test",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@test",
}


@pytest.fixture
def stg(run_cmd, repo_root, tmp_path):
    test_dir = tmp_path / "preflight-staged-test"
    test_dir.mkdir()
    lock_dir = tmp_path / "agent-locks-staged"
    lock_dir.mkdir()

    def git(*args):
        return run_cmd(["git", *args], cwd=test_dir, env=GIT_ENV)

    def sh(*args):
        return run_cmd(["bash", str(repo_root / "scripts" / "plan-preflight.sh"), *args],
                       cwd=test_dir, env={"AGENT_LOCK_DIR": str(lock_dir)})

    git("init", "-b", "main").check()
    (test_dir / "initial.txt").write_text("initial\n", encoding="utf-8")
    git("add", "initial.txt").check()
    git("commit", "-q", "-m", "initial commit").check()
    git("checkout", "-q", "-b", "feature/px-T009999")
    (lock_dir / "ticket__T009999.json").write_text('{"branch":"feature/px-T009999"}\n', encoding="utf-8")
    return {"dir": test_dir, "git": git, "sh": sh}


def test_t005114_pre_commit_akzeptiert_gestagte_plan_artefakte_und_lehnt_gestagte_fremd_dateien_ab(stg):
    d = stg["dir"]
    # Valid case: only plan artifacts staged -> rc=0 (state right before the plan-stage commit).
    (d / ".agents" / "plans" / "xyz").mkdir(parents=True)
    (d / "tests" / "spec" / "xyz").mkdir(parents=True)
    (d / ".agents" / "plans" / "xyz" / "tasks.md").write_text("plan\n", encoding="utf-8")
    (d / "tests" / "spec" / "xyz" / "example.bats").write_text("test\n", encoding="utf-8")
    stg["git"]("add", ".agents/plans/xyz/tasks.md", "tests/spec/xyz/example.bats",
               ".agents/plans/xyz/tasks.md").check()

    res = stg["sh"]("pre-commit", "--ticket", "T009999")
    assert res.returncode == 0, res.output

    # Negative case (positive anchor above): a staged foreign file is still rejected.
    (d / "src-fremd.txt").write_text("fremd\n", encoding="utf-8")
    stg["git"]("add", "src-fremd.txt").check()
    res = stg["sh"]("pre-commit", "--ticket", "T009999")
    assert res.returncode == 1
    assert ("Fremd" in res.output) or ("fremd" in res.output)

    # Unstaged/untracked alone is irrelevant for the commit.
    stg["git"]("reset", "-q", "src-fremd.txt").check()
    (d / "unrelated.txt").write_text("unrelated\n", encoding="utf-8")
    assert stg["sh"]("pre-commit", "--ticket", "T009999").returncode == 0
