"""Native migration of tests/unit/secret-task-guards.bats."""
import os
from pathlib import Path

import pytest

STUB_FAIL = "#!/usr/bin/env bash\nexit 1\n"
STUB_OK = "#!/usr/bin/env bash\nexit 0\n"


@pytest.fixture
def paths(repo_root: Path) -> dict:
    return {
        "ci_dummy": repo_root / "scripts" / "ci-dummy-secrets.sh",
        "wait_sealed": repo_root / "scripts" / "wait-for-sealed-secret.sh",
        "env_seal": repo_root / "scripts" / "env-seal.sh",
        "backup_restore": repo_root / "scripts" / "backup-restore.sh",
        "app_install": repo_root / "scripts" / "app-install.sh",
        "taskfile_workspace": repo_root / "taskfiles" / "Taskfile.workspace.yml",
        "taskfile_platform": repo_root / "taskfiles" / "Taskfile.platform.yml",
    }


@pytest.fixture
def sandbox(tmp_path: Path) -> Path:
    sb = tmp_path / "sandbox"
    (sb / "k3d").mkdir(parents=True)
    return sb


@pytest.fixture
def stubs(tmp_path: Path) -> Path:
    d = tmp_path / "stubs"
    d.mkdir()
    return d


def _write_stub(stubs: Path, body: str) -> str:
    kubectl = stubs / "kubectl"
    kubectl.write_text(body, encoding="utf-8")
    kubectl.chmod(0o755)
    return str(kubectl)


# -- Finding #8: ci-dummy-secrets.sh must be fail-closed outside CI/dev ------

def test_8_ci_dummy_secrets_refuses_when_env_is_a_prod_brand_and_ci_unset(run_cmd, paths, sandbox):
    result = run_cmd(["env", "-u", "CI", "ENV=mentolder", "bash", str(paths["ci_dummy"])], cwd=sandbox)
    assert result.returncode != 0, result.output
    # Eine Ablehnung darf keine Platzhalter-Secret-Dateien schreiben.
    assert not (sandbox / "k3d" / "secrets.yaml").exists()
    assert not (sandbox / "k3d" / "backup-secrets.yaml").exists()


def test_8_ci_dummy_secrets_refuses_for_env_korczewski_without_ci(run_cmd, paths, sandbox):
    result = run_cmd(["env", "-u", "CI", "ENV=korczewski", "bash", str(paths["ci_dummy"])], cwd=sandbox)
    assert result.returncode != 0, result.output


def test_8_ci_dummy_secrets_proceeds_when_ci_true_ci_happy_path(run_cmd, paths, sandbox):
    result = run_cmd(["env", "CI=true", "ENV=mentolder", "bash", str(paths["ci_dummy"])], cwd=sandbox)
    assert result.returncode == 0, result.output
    assert (sandbox / "k3d" / "secrets.yaml").is_file()


def test_8_ci_dummy_secrets_proceeds_for_env_dev_dev_ergonomics(run_cmd, paths, sandbox):
    result = run_cmd(["env", "-u", "CI", "ENV=dev", "bash", str(paths["ci_dummy"])], cwd=sandbox)
    assert result.returncode == 0, result.output


# -- Finding #1: wait-for-sealed-secret.sh must fail-closed on timeout -------

def test_1_wait_for_sealed_secret_helper_exists_and_is_executable(paths):
    assert paths["wait_sealed"].is_file()
    assert os.access(paths["wait_sealed"], os.X_OK)


def test_1_wait_for_sealed_secret_exits_non_zero_when_the_secret_never_decrypts(run_cmd, paths, stubs):
    kubectl = _write_stub(stubs, STUB_FAIL)
    result = run_cmd(
        ["env", f"KUBECTL={kubectl}", "bash", str(paths["wait_sealed"]),
         "--context", "fake", "--namespace", "workspace", "--secret", "workspace-secrets", "--timeout", "2"],
        timeout=300,
    )
    assert result.returncode != 0, result.output


def test_1_wait_for_sealed_secret_exits_zero_once_the_secret_is_present(run_cmd, paths, stubs):
    kubectl = _write_stub(stubs, STUB_OK)
    result = run_cmd(
        ["env", f"KUBECTL={kubectl}", "bash", str(paths["wait_sealed"]),
         "--context", "fake", "--namespace", "workspace", "--secret", "workspace-secrets", "--timeout", "2"],
        timeout=300,
    )
    assert result.returncode == 0, result.output


# -- Finding #3: env-seal cert-fingerprint compare seam ----------------------

def test_3_env_seal_test_cert_compare_exits_zero_for_identical_certs(run_cmd, paths, sandbox):
    (sandbox / "a.pem").write_text("CERT-A\n", encoding="utf-8")
    (sandbox / "b.pem").write_text("CERT-A\n", encoding="utf-8")
    result = run_cmd(["bash", str(paths["env_seal"]), "--_test-cert-compare",
                      str(sandbox / "a.pem"), str(sandbox / "b.pem")])
    assert result.returncode == 0, result.output


def test_3_env_seal_test_cert_compare_exits_non_zero_for_drifted_certs(run_cmd, paths, sandbox):
    (sandbox / "a.pem").write_text("CERT-A\n", encoding="utf-8")
    (sandbox / "b.pem").write_text("CERT-B-DIFFERENT\n", encoding="utf-8")
    result = run_cmd(["bash", str(paths["env_seal"]), "--_test-cert-compare",
                      str(sandbox / "a.pem"), str(sandbox / "b.pem")])
    assert result.returncode != 0, result.output


# -- Finding #4: restore guidance must point at sync-db-passwords -----------

def test_4_backup_restore_restore_complete_guidance_mentions_sync_db_passwords(run_cmd, paths):
    result = run_cmd(["grep", "-n", "sync-db-passwords", str(paths["backup_restore"])])
    assert result.returncode == 0, result.output


def test_4_db_restore_task_chains_workspace_sync_db_passwords(run_cmd, paths):
    cmd = (
        'sed -n "/^  workspace:db:restore:/,/^  [a-z]/p" "'
        f'{paths["taskfile_workspace"]}" | grep -c "workspace:sync-db-passwords"'
    )
    result = run_cmd(["bash", "-c", cmd])
    assert "1" in result.output, result.output


# -- Finding #5: app-install must reseal (or warn) after secret processing --

def test_5_app_install_references_env_seal_after_secret_processing(run_cmd, paths):
    result = run_cmd(["grep", "-nE", r"env-seal\.sh|sealed mirror stale", str(paths["app_install"])])
    assert result.returncode == 0, result.output


# -- Finding #6: secrets:sync must warn about un-reconciled workloads -------

def test_6_secrets_sync_emits_a_workload_reconcile_reminder(run_cmd, paths):
    cmd = (
        'sed -n "/^  secrets:sync:/,/^  secrets:install-hooks:/p" "'
        f'{paths["taskfile_platform"]}" | grep -ciE "sync-db-passwords|rollout restart|landmine|latent"'
    )
    result = run_cmd(["bash", "-c", cmd])
    assert "0" not in result.output, result.output


def test_6_secrets_sync_full_companion_task_exists(run_cmd, paths):
    result = run_cmd(["grep", "-c", "secrets:sync:full:", str(paths["taskfile_platform"])])
    assert "1" in result.output, result.output


# -- Finding #9: env:seal reminds about website-secrets co-rotation ---------

def test_9_env_seal_desc_notes_website_secrets_co_rotation(run_cmd, paths):
    cmd = (
        'sed -n "/  env:seal:/,/  env:fetch-cert:/p" "'
        f'{paths["taskfile_platform"]}" | grep -ciE "website-secrets|WEBSITE_OIDC"'
    )
    result = run_cmd(["bash", "-c", cmd])
    assert "0" not in result.output, result.output
