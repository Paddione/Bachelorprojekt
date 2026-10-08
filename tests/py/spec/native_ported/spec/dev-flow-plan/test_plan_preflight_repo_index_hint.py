"""Native migration of tests/spec/dev-flow-plan/plan-preflight-repo-index-hint.bats."""
# T013678-Mishap #6: the rejection message for a regenerated repo-index.json must name the

# remedy (git restore). Command output verification [T002448-M4].

import pytest

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@test",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@test",
}


@pytest.fixture
def fixture_repo(run_cmd, repo_root, tmp_path):
    test_dir = tmp_path / "preflight-repo-index"
    test_dir.mkdir()
    lock_dir = tmp_path / "agent-locks"
    lock_dir.mkdir()

    def git(*args):
        return run_cmd(["git", *args], cwd=test_dir, env=GIT_ENV)

    git("init", "-b", "main").check()
    (test_dir / "initial.txt").write_text("initial\n", encoding="utf-8")
    git("add", "initial.txt").check()
    git("commit", "-q", "-m", "initial commit").check()
    git("checkout", "-q", "-b", "feature/px-T009999").check()
    return {
        "dir": test_dir,
        "git": git,
        "sh": lambda *args: run_cmd(
            ["bash", str(repo_root / "scripts" / "plan-preflight.sh"), *args],
            cwd=test_dir, env={"AGENT_LOCK_DIR": str(lock_dir)},
        ),
    }


def test_repo_index_json_als_fremd_datei_meldung_nennt_git_restore_als_abhilfe(fixture_repo):
    d = fixture_repo["dir"]
    (d / "docs" / "code-quality").mkdir(parents=True)
    (d / "docs" / "code-quality" / "repo-index.json").write_text('{"file_count":1}\n', encoding="utf-8")
    fixture_repo["git"]("add", "docs/code-quality/repo-index.json").check()

    res = fixture_repo["sh"]("pre-commit", "--ticket", "T009999")
    # Positive anchor first: the guard detects the foreign file and fails.
    assert res.returncode == 1
    assert "Fremd-Datei im Staged-Set" in res.output
    # The remedy names the concrete file.
    assert "git restore docs/code-quality/repo-index.json" in res.output
