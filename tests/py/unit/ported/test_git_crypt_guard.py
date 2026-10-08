"""Native migration of tests/unit/git-crypt-guard.bats."""

# Tests for scripts/git-crypt-guard.sh — verifies the encryption-detection logic
# that the pre-commit hook and CI rely on.

import pytest


@pytest.fixture
def guard(repo_root):
    return repo_root / "scripts" / "git-crypt-guard.sh"


@pytest.fixture
def tmp_files(tmp_path):
    # 10-byte git-crypt magic header (NUL G I T C R Y P T NUL) + payload
    (tmp_path / "encrypted.bin").write_bytes(b"\x00GITCRYPT\x00ciphertextpayload")
    (tmp_path / "plaintext.yaml").write_bytes(b"PASSWORD: hunter2\n")
    (tmp_path / "empty").write_bytes(b"")
    return tmp_path


def test_is_encrypted_exit_0_for_a_git_crypt_header(run_cmd, guard, tmp_files):
    result = run_cmd(["bash", str(guard), "is-encrypted", str(tmp_files / "encrypted.bin")])
    assert result.returncode == 0


def test_is_encrypted_nonzero_for_plaintext(run_cmd, guard, tmp_files):
    result = run_cmd(["bash", str(guard), "is-encrypted", str(tmp_files / "plaintext.yaml")])
    assert result.returncode != 0


def test_is_encrypted_nonzero_for_empty_file(run_cmd, guard, tmp_files):
    result = run_cmd(["bash", str(guard), "is-encrypted", str(tmp_files / "empty")])
    assert result.returncode != 0


def test_is_encrypted_nonzero_for_missing_file(run_cmd, guard, tmp_files):
    result = run_cmd(["bash", str(guard), "is-encrypted", str(tmp_files / "does-not-exist")])
    assert result.returncode != 0


def test_usage_unknown_subcommand_exits_2(run_cmd, guard):
    result = run_cmd(["bash", str(guard), "bogus"])
    assert result.returncode == 2


def test_is_managed_secrets_dir_files_are_managed(run_cmd, guard):
    result = run_cmd(["bash", str(guard), "is-managed", "environments/.secrets/mentolder.yaml"])
    assert result.returncode == 0


def test_is_managed_claude_code_mcp_secrets_are_managed(run_cmd, guard):
    result = run_cmd(["bash", str(guard), "is-managed", "deploy/mcp/claude-code-secrets.yaml"])
    assert result.returncode == 0


def test_is_managed_public_sealing_certs_are_not_managed(run_cmd, guard):
    result = run_cmd(["bash", str(guard), "is-managed", "environments/certs/mentolder.pem"])
    assert result.returncode != 0


def test_is_managed_gitkeep_placeholder_is_not_managed(run_cmd, guard):
    result = run_cmd(["bash", str(guard), "is-managed", "environments/.secrets/.gitkeep"])
    assert result.returncode != 0
