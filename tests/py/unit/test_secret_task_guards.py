"""Tests for fail-closed guards for secret-mutating actions (migrated from tests/unit/secret-task-guards.bats)."""

import os
from pathlib import Path


def test_ci_dummy_secrets_refuses_prod_brand_without_ci(repo_root: Path, run_cmd, tmp_path: Path):
    ci_dummy = repo_root / "scripts" / "ci-dummy-secrets.sh"
    k3d_dir = tmp_path / "k3d"
    k3d_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["CI"] = ""
    env["ENV"] = "mentolder"

    res = run_cmd(["bash", str(ci_dummy)], cwd=tmp_path, env=env)
    assert res.returncode != 0
    assert not (k3d_dir / "secrets.yaml").exists()
    assert not (k3d_dir / "backup-secrets.yaml").exists()


def test_ci_dummy_secrets_refuses_korczewski_without_ci(repo_root: Path, run_cmd, tmp_path: Path):
    ci_dummy = repo_root / "scripts" / "ci-dummy-secrets.sh"
    k3d_dir = tmp_path / "k3d"
    k3d_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["CI"] = ""
    env["ENV"] = "korczewski"

    res = run_cmd(["bash", str(ci_dummy)], cwd=tmp_path, env=env)
    assert res.returncode != 0


def test_ci_dummy_secrets_proceeds_when_ci_true(repo_root: Path, run_cmd, tmp_path: Path):
    ci_dummy = repo_root / "scripts" / "ci-dummy-secrets.sh"
    k3d_dir = tmp_path / "k3d"
    k3d_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["CI"] = "true"
    env["ENV"] = "mentolder"

    res = run_cmd(["bash", str(ci_dummy)], cwd=tmp_path, env=env)
    assert res.returncode == 0
    assert (k3d_dir / "secrets.yaml").exists()


def test_ci_dummy_secrets_proceeds_for_env_dev(repo_root: Path, run_cmd, tmp_path: Path):
    ci_dummy = repo_root / "scripts" / "ci-dummy-secrets.sh"
    k3d_dir = tmp_path / "k3d"
    k3d_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["CI"] = ""
    env["ENV"] = "dev"

    res = run_cmd(["bash", str(ci_dummy)], cwd=tmp_path, env=env)
    assert res.returncode == 0


def test_wait_for_sealed_secret_executable(repo_root: Path):
    wait_sealed = repo_root / "scripts" / "wait-for-sealed-secret.sh"
    assert wait_sealed.is_file()
    assert os.access(wait_sealed, os.X_OK)


def test_wait_for_sealed_secret_exits_nonzero_on_timeout(repo_root: Path, run_cmd, tmp_path: Path):
    wait_sealed = repo_root / "scripts" / "wait-for-sealed-secret.sh"
    fake_kubectl = tmp_path / "kubectl"
    fake_kubectl.write_text("#!/usr/bin/env bash\nexit 1\n")
    fake_kubectl.chmod(0o755)

    env = os.environ.copy()
    env["KUBECTL"] = str(fake_kubectl)

    res = run_cmd(
        [
            "bash",
            str(wait_sealed),
            "--context",
            "fake",
            "--namespace",
            "workspace",
            "--secret",
            "workspace-secrets",
            "--timeout",
            "2",
        ],
        env=env,
    )
    assert res.returncode != 0


def test_wait_for_sealed_secret_exits_zero_when_secret_present(repo_root: Path, run_cmd, tmp_path: Path):
    wait_sealed = repo_root / "scripts" / "wait-for-sealed-secret.sh"
    fake_kubectl = tmp_path / "kubectl"
    fake_kubectl.write_text("#!/usr/bin/env bash\nexit 0\n")
    fake_kubectl.chmod(0o755)

    env = os.environ.copy()
    env["KUBECTL"] = str(fake_kubectl)

    res = run_cmd(
        [
            "bash",
            str(wait_sealed),
            "--context",
            "fake",
            "--namespace",
            "workspace",
            "--secret",
            "workspace-secrets",
            "--timeout",
            "2",
        ],
        env=env,
    )
    assert res.returncode == 0


def test_env_seal_test_cert_compare(repo_root: Path, run_cmd, tmp_path: Path):
    env_seal = repo_root / "scripts" / "env-seal.sh"
    a = tmp_path / "a.pem"
    b = tmp_path / "b.pem"
    c = tmp_path / "c.pem"
    a.write_text("CERT-A\n")
    b.write_text("CERT-A\n")
    c.write_text("CERT-B-DIFFERENT\n")

    res_same = run_cmd(["bash", str(env_seal), "--_test-cert-compare", str(a), str(b)])
    assert res_same.returncode == 0

    res_diff = run_cmd(["bash", str(env_seal), "--_test-cert-compare", str(a), str(c)])
    assert res_diff.returncode != 0


def test_backup_restore_guidance_mentions_sync_db_passwords(repo_root: Path):
    backup_restore = repo_root / "scripts" / "backup-restore.sh"
    assert "sync-db-passwords" in backup_restore.read_text()


def test_db_restore_task_chains_workspace_sync_db_passwords(repo_root: Path):
    taskfile = repo_root / "taskfiles" / "Taskfile.workspace.yml"
    content = taskfile.read_text()
    assert "workspace:sync-db-passwords" in content


def test_app_install_references_env_seal(repo_root: Path):
    app_install = repo_root / "scripts" / "app-install.sh"
    content = app_install.read_text()
    assert "env-seal.sh" in content or "sealed mirror stale" in content


def test_secrets_sync_emits_workload_reconcile_reminder(repo_root: Path):
    taskfile = repo_root / "taskfiles" / "Taskfile.platform.yml"
    content = taskfile.read_text()
    lower = content.lower()
    assert any(needle in lower for needle in ["sync-db-passwords", "rollout restart", "landmine", "latent"])


def test_secrets_sync_full_task_exists(repo_root: Path):
    taskfile = repo_root / "taskfiles" / "Taskfile.platform.yml"
    content = taskfile.read_text()
    assert "secrets:sync:full:" in content


def test_env_seal_desc_notes_website_secrets(repo_root: Path):
    taskfile = repo_root / "taskfiles" / "Taskfile.platform.yml"
    content = taskfile.read_text()
    assert "website-secrets" in content or "WEBSITE_OIDC" in content
