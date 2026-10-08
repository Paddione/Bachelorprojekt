"""Tests for scripts/changed-manifests.sh (migrated from tests/unit/changed-manifests.bats)."""

import os
from pathlib import Path
import subprocess
import pytest


@pytest.fixture
def test_repo(tmp_path: Path):
    repo_dir = tmp_path / "repo"
    repo_dir.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.name", "test"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.email", "test@test"], cwd=repo_dir, check=True)

    def commit(msg="init"):
        subprocess.run(["git", "add", "-A"], cwd=repo_dir)
        subprocess.run(["git", "commit", "-q", "--allow-empty", "-m", msg], cwd=repo_dir, check=True)

    return repo_dir, commit


def test_detects_manifest_change_in_k3d(repo_root: Path, run_cmd, test_repo):
    repo_dir, commit = test_repo
    changed_script = repo_root / "scripts" / "changed-manifests.sh"

    (repo_dir / "k3d").mkdir(parents=True)
    commit("base")
    (repo_dir / "k3d" / "foo.yaml").write_text("apiVersion: v1\n")
    commit("add k3d manifest")

    res = run_cmd(["bash", str(changed_script), "HEAD~1", "HEAD"], cwd=repo_dir)
    assert res.returncode == 0
    assert "k3d/foo.yaml" in res.stdout


def test_detects_manifest_change_in_prod_fleet(repo_root: Path, run_cmd, test_repo):
    repo_dir, commit = test_repo
    changed_script = repo_root / "scripts" / "changed-manifests.sh"

    (repo_dir / "prod-fleet" / "mentolder").mkdir(parents=True)
    commit("base")
    (repo_dir / "prod-fleet" / "mentolder" / "kustomization.yaml").write_text("resources:\n")
    commit("add prod-fleet kustomization")

    res = run_cmd(["bash", str(changed_script), "HEAD~1", "HEAD"], cwd=repo_dir)
    assert res.returncode == 0
    assert "prod-fleet/mentolder/kustomization.yaml" in res.stdout


def test_detects_manifest_change_in_environments(repo_root: Path, run_cmd, test_repo):
    repo_dir, commit = test_repo
    changed_script = repo_root / "scripts" / "changed-manifests.sh"

    (repo_dir / "environments").mkdir(parents=True)
    commit("base")
    (repo_dir / "environments" / "mentolder.yaml").write_text("brand: mentolder\n")
    commit("add environment file")

    res = run_cmd(["bash", str(changed_script), "HEAD~1", "HEAD"], cwd=repo_dir)
    assert res.returncode == 0
    assert "environments/mentolder.yaml" in res.stdout


def test_no_manifest_change_docs_only(repo_root: Path, run_cmd, test_repo):
    repo_dir, commit = test_repo
    changed_script = repo_root / "scripts" / "changed-manifests.sh"

    (repo_dir / "docs").mkdir(parents=True)
    commit("base")
    (repo_dir / "docs" / "x.md").write_text("# docs\n")
    commit("docs change")

    res = run_cmd(["bash", str(changed_script), "HEAD~1", "HEAD"], cwd=repo_dir)
    assert res.returncode == 1


def test_no_manifest_change_website_only(repo_root: Path, run_cmd, test_repo):
    repo_dir, commit = test_repo
    changed_script = repo_root / "scripts" / "changed-manifests.sh"

    (repo_dir / "components" / "website" / "src" / "pages").mkdir(parents=True)
    commit("base")
    (repo_dir / "components" / "website" / "src" / "pages" / "index.astro").write_text("---\n")
    commit("website change")

    res = run_cmd(["bash", str(changed_script), "HEAD~1", "HEAD"], cwd=repo_dir)
    assert res.returncode == 1
    assert "no manifest changes" in res.stdout


def test_no_manifest_change_empty_diff(repo_root: Path, run_cmd, test_repo):
    repo_dir, commit = test_repo
    changed_script = repo_root / "scripts" / "changed-manifests.sh"

    commit("only commit")
    res = run_cmd(["bash", str(changed_script), "HEAD", "HEAD"], cwd=repo_dir)
    assert res.returncode == 1
    assert "no manifest changes" in res.stdout


def test_detects_manifest_in_prod_dirs(repo_root: Path, run_cmd, test_repo):
    repo_dir, commit = test_repo
    changed_script = repo_root / "scripts" / "changed-manifests.sh"

    for d in ["prod-mentolder", "prod-korczewski", "prod"]:
        p = repo_dir / d
        p.mkdir(parents=True, exist_ok=True)
        commit("base")
        (p / "config.yaml").write_text("key: val\n")
        commit(f"add {d} config")
        res = run_cmd(["bash", str(changed_script), "HEAD~1", "HEAD"], cwd=repo_dir)
        assert res.returncode == 0
        assert f"{d}/config.yaml" in res.stdout


def test_mixed_manifest_and_non_manifest(repo_root: Path, run_cmd, test_repo):
    repo_dir, commit = test_repo
    changed_script = repo_root / "scripts" / "changed-manifests.sh"

    (repo_dir / "k3d").mkdir(parents=True)
    (repo_dir / "docs").mkdir(parents=True)
    (repo_dir / "components" / "website" / "src").mkdir(parents=True)
    commit("base")

    (repo_dir / "k3d" / "foo.yaml").write_text("apiVersion: v1\n")
    (repo_dir / "docs" / "x.md").write_text("# docs\n")
    (repo_dir / "components" / "website" / "src" / "index.astro").write_text("---\n")
    commit("mixed changes")

    res = run_cmd(["bash", str(changed_script), "HEAD~1", "HEAD"], cwd=repo_dir)
    assert res.returncode == 0
    assert "k3d/foo.yaml" in res.stdout


def test_default_args_use_head_minus_1(repo_root: Path, run_cmd, test_repo):
    repo_dir, commit = test_repo
    changed_script = repo_root / "scripts" / "changed-manifests.sh"

    (repo_dir / "k3d").mkdir(parents=True)
    commit("base")
    (repo_dir / "k3d" / "bar.yaml").write_text("apiVersion: v1\n")
    commit("add k3d manifest")

    res = run_cmd(["bash", str(changed_script)], cwd=repo_dir)
    assert res.returncode == 0
    assert "k3d/bar.yaml" in res.stdout
