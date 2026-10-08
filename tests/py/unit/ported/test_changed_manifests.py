"""Native migration of tests/unit/changed-manifests.bats."""
import pytest

GIT_ENV = {
    "GIT_AUTHOR_NAME": "test",
    "GIT_AUTHOR_EMAIL": "test@test",
    "GIT_COMMITTER_NAME": "test",
    "GIT_COMMITTER_EMAIL": "test@test",
}


@pytest.fixture
def repo_dir(run_cmd, repo_root, tmp_path):
    """setup(): isoliertes Git-Repo mit lokaler User-Konfiguration."""
    repo = tmp_path / "repo"
    repo.mkdir()
    run_cmd(["git", "init", "-q"], cwd=repo, env=GIT_ENV)
    run_cmd(["git", "config", "user.name", "test"], cwd=repo, env=GIT_ENV)
    run_cmd(["git", "config", "user.email", "test@test"], cwd=repo, env=GIT_ENV)
    return repo


def create_commit(run_cmd, repo, msg="init"):
    """create_commit: git add -A; commit, sonst leerer Commit."""
    run_cmd(["git", "add", "-A"], cwd=repo, env=GIT_ENV)
    if run_cmd(["git", "commit", "-q", "-m", msg], cwd=repo, env=GIT_ENV).returncode != 0:
        run_cmd(["git", "commit", "-q", "--allow-empty", "-m", msg], cwd=repo, env=GIT_ENV)


def changed(run_cmd, repo_root, repo, *args):
    return run_cmd(["bash", str(repo_root / "scripts/changed-manifests.sh"), *args], cwd=repo, env=GIT_ENV)


def test_detects_manifest_change_in_k3d(run_cmd, repo_root, repo_dir):
    (repo_dir / "k3d").mkdir()
    create_commit(run_cmd, repo_dir, "base")
    (repo_dir / "k3d/foo.yaml").write_text("apiVersion: v1\n")
    create_commit(run_cmd, repo_dir, "add k3d manifest")
    run = changed(run_cmd, repo_root, repo_dir, "HEAD~1", "HEAD")
    assert run.returncode == 0, run.output
    assert "k3d/foo.yaml" in run.output


def test_detects_manifest_change_in_prod_fleet(run_cmd, repo_root, repo_dir):
    (repo_dir / "prod-fleet/mentolder").mkdir(parents=True)
    create_commit(run_cmd, repo_dir, "base")
    (repo_dir / "prod-fleet/mentolder/kustomization.yaml").write_text("resources:\n")
    create_commit(run_cmd, repo_dir, "add prod-fleet kustomization")
    run = changed(run_cmd, repo_root, repo_dir, "HEAD~1", "HEAD")
    assert run.returncode == 0, run.output
    assert "prod-fleet/mentolder/kustomization.yaml" in run.output


def test_detects_manifest_change_in_environments(run_cmd, repo_root, repo_dir):
    (repo_dir / "environments").mkdir()
    create_commit(run_cmd, repo_dir, "base")
    (repo_dir / "environments/mentolder.yaml").write_text("brand: mentolder\n")
    create_commit(run_cmd, repo_dir, "add environment file")
    run = changed(run_cmd, repo_root, repo_dir, "HEAD~1", "HEAD")
    assert run.returncode == 0, run.output
    assert "environments/mentolder.yaml" in run.output


def test_no_manifest_change_docs_only(run_cmd, repo_root, repo_dir):
    (repo_dir / "docs").mkdir()
    create_commit(run_cmd, repo_dir, "base")
    (repo_dir / "docs/x.md").write_text("# docs\n")
    create_commit(run_cmd, repo_dir, "docs change")
    run = changed(run_cmd, repo_root, repo_dir, "HEAD~1", "HEAD")
    assert run.returncode == 1, run.output


def test_no_manifest_change_website_only(run_cmd, repo_root, repo_dir):
    (repo_dir / "components/website/src/pages").mkdir(parents=True)
    create_commit(run_cmd, repo_dir, "base")
    (repo_dir / "components/website/src/pages/index.astro").write_text("---\n")
    create_commit(run_cmd, repo_dir, "website change")
    run = changed(run_cmd, repo_root, repo_dir, "HEAD~1", "HEAD")
    assert run.returncode == 1, run.output
    assert "no manifest changes" in run.output


def test_no_manifest_change_empty_diff(run_cmd, repo_root, repo_dir):
    create_commit(run_cmd, repo_dir, "only commit")
    run = changed(run_cmd, repo_root, repo_dir, "HEAD", "HEAD")
    assert run.returncode == 1, run.output
    assert "no manifest changes" in run.output


def test_detects_manifest_in_prod_mentolder(run_cmd, repo_root, repo_dir):
    (repo_dir / "prod-mentolder").mkdir()
    create_commit(run_cmd, repo_dir, "base")
    (repo_dir / "prod-mentolder/config.yaml").write_text("key: val\n")
    create_commit(run_cmd, repo_dir, "add prod-mentolder config")
    run = changed(run_cmd, repo_root, repo_dir, "HEAD~1", "HEAD")
    assert run.returncode == 0, run.output
    assert "prod-mentolder/config.yaml" in run.output


def test_detects_manifest_in_prod_korczewski(run_cmd, repo_root, repo_dir):
    (repo_dir / "prod-korczewski").mkdir()
    create_commit(run_cmd, repo_dir, "base")
    (repo_dir / "prod-korczewski/config.yaml").write_text("key: val\n")
    create_commit(run_cmd, repo_dir, "add prod-korczewski config")
    run = changed(run_cmd, repo_root, repo_dir, "HEAD~1", "HEAD")
    assert run.returncode == 0, run.output
    assert "prod-korczewski/config.yaml" in run.output


def test_detects_manifest_in_prod(run_cmd, repo_root, repo_dir):
    (repo_dir / "prod").mkdir()
    create_commit(run_cmd, repo_dir, "base")
    (repo_dir / "prod/config.yaml").write_text("key: val\n")
    create_commit(run_cmd, repo_dir, "add prod config")
    run = changed(run_cmd, repo_root, repo_dir, "HEAD~1", "HEAD")
    assert run.returncode == 0, run.output
    assert "prod/config.yaml" in run.output


def test_mixed_manifest_non_manifest_still_exits_0(run_cmd, repo_root, repo_dir):
    (repo_dir / "k3d").mkdir()
    (repo_dir / "docs").mkdir()
    (repo_dir / "components/website/src").mkdir(parents=True)
    create_commit(run_cmd, repo_dir, "base")
    (repo_dir / "k3d/foo.yaml").write_text("apiVersion: v1\n")
    (repo_dir / "docs/x.md").write_text("# docs\n")
    (repo_dir / "components/website/src/index.astro").write_text("---\n")
    create_commit(run_cmd, repo_dir, "mixed changes")
    run = changed(run_cmd, repo_root, repo_dir, "HEAD~1", "HEAD")
    assert run.returncode == 0, run.output
    assert "k3d/foo.yaml" in run.output


def test_default_args_use_head1_head_when_none_given(run_cmd, repo_root, repo_dir):
    (repo_dir / "k3d").mkdir()
    create_commit(run_cmd, repo_dir, "base")
    (repo_dir / "k3d/bar.yaml").write_text("apiVersion: v1\n")
    create_commit(run_cmd, repo_dir, "add k3d manifest")
    run = changed(run_cmd, repo_root, repo_dir)
    assert run.returncode == 0, run.output
    assert "k3d/bar.yaml" in run.output
