"""Native migration of tests/spec/devflow-selection-archive-hardening/merge-commit-selection.bats."""

from pathlib import Path

import pytest


@pytest.fixture
def script(repo_root):
    return repo_root / "scripts" / "devflow-post-merge-deploy.sh"


def _git(run_cmd, repo, *args):
    result = run_cmd(["git", "-C", str(repo), *args])
    assert result.returncode == 0, result.output
    return result


def _new_test_repo(run_cmd, base: Path, kind: str = "archive"):
    """Builds a temp git repo; returns (repo, feature_sha, archive_sha)."""
    repo = base
    repo.mkdir(parents=True, exist_ok=True)
    _git(run_cmd, repo, "init", "-q", "-b", "main")
    _git(run_cmd, repo, "config", "user.email", "bats@test.local")
    _git(run_cmd, repo, "config", "user.name", "BATS Test")
    _git(run_cmd, repo, "config", "core.hooksPath", "/dev/null")
    (repo / "README.md").write_text("initial\n", encoding="utf-8")
    _git(run_cmd, repo, "add", "README.md")
    _git(run_cmd, repo, "commit", "-q", "-m", "chore: initial")
    (repo / "README.md").write_text("feature\n", encoding="utf-8")
    _git(run_cmd, repo, "commit", "-q", "-am", "feat(foo): implement x [T009999]")
    feature_sha = _git(run_cmd, repo, "rev-parse", "HEAD").stdout.strip()
    archive_sha = ""
    if kind == "archive":
        plan_dir = repo / ".agents" / "plans" / "archive" / "foo"
        plan_dir.mkdir(parents=True)
        (plan_dir / "spec.md").write_text("spec\n", encoding="utf-8")
        _git(run_cmd, repo, "add", ".agents/plans")
        _git(run_cmd, repo, "commit", "-q", "-m", "chore(plans): archive foo → bar [T009999]")
        archive_sha = _git(run_cmd, repo, "rev-parse", "HEAD").stdout.strip()
    _git(run_cmd, repo, "update-ref", "refs/remotes/origin/main", "HEAD")
    return repo, feature_sha, archive_sha


@pytest.fixture
def test_repo(run_cmd, tmp_path):
    return _new_test_repo(run_cmd, tmp_path / "archive", "archive")


def test_t009368_selektion_liefert_feature_merge_commit_statt_neuerem_archiv_commit(
    run_cmd, script, test_repo
):
    repo, feature_sha, archive_sha = test_repo
    log = _git(run_cmd, repo, "log", "origin/main", "--format=%H %s", "--grep=\\[T009999\\]", "-1")
    assert log.returncode == 0
    assert log.stdout.startswith(archive_sha)

    result = run_cmd(["bash", "-c", f"source '{script}' && select_merge_commit '{repo}' 'T009999'"])
    assert result.returncode == 0, result.output
    assert result.stdout.strip() == feature_sha


def test_t009368_unbekannte_ticket_id_exit_3_kein_deploy_lauf(run_cmd, script, test_repo):
    repo, _, _ = test_repo
    probe = run_cmd(["bash", "-c", f"source '{script}' && select_merge_commit '{repo}' 'T009999'"])
    assert probe.returncode == 0, probe.output
    assert probe.output.strip()

    result = run_cmd(["bash", str(script), "T009998"], cwd=repo)
    assert result.returncode == 3, result.output
    assert "Kein Merge-Commit" in result.output


def test_t009368_feature_commit_ohne_archiv_nachfolger_wird_weiterhin_gefunden(
    run_cmd, script, tmp_path
):
    repo, feature_sha, _ = _new_test_repo(run_cmd, tmp_path / "no", "no")
    result = run_cmd(["bash", "-c", f"source '{script}' && select_merge_commit '{repo}' 'T009999'"])
    assert result.returncode == 0, result.output
    assert result.stdout.strip() == feature_sha
