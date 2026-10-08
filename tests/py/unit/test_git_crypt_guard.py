"""Tests for scripts/git-crypt-guard.sh (migrated from tests/unit/git-crypt-guard.bats)."""

from pathlib import Path


def test_is_encrypted_exit_0_for_git_crypt_header(repo_root: Path, run_cmd, tmp_path: Path):
    guard = repo_root / "scripts" / "git-crypt-guard.sh"
    encrypted = tmp_path / "encrypted.bin"
    encrypted.write_bytes(b"\x00GITCRYPT\x00ciphertextpayload")

    res = run_cmd(["bash", str(guard), "is-encrypted", str(encrypted)])
    assert res.returncode == 0


def test_is_encrypted_nonzero_for_plaintext(repo_root: Path, run_cmd, tmp_path: Path):
    guard = repo_root / "scripts" / "git-crypt-guard.sh"
    plaintext = tmp_path / "plaintext.yaml"
    plaintext.write_text("PASSWORD: hunter2\n")

    res = run_cmd(["bash", str(guard), "is-encrypted", str(plaintext)])
    assert res.returncode != 0


def test_is_encrypted_nonzero_for_empty_file(repo_root: Path, run_cmd, tmp_path: Path):
    guard = repo_root / "scripts" / "git-crypt-guard.sh"
    empty = tmp_path / "empty"
    empty.touch()

    res = run_cmd(["bash", str(guard), "is-encrypted", str(empty)])
    assert res.returncode != 0


def test_is_encrypted_nonzero_for_missing_file(repo_root: Path, run_cmd, tmp_path: Path):
    guard = repo_root / "scripts" / "git-crypt-guard.sh"
    res = run_cmd(["bash", str(guard), "is-encrypted", str(tmp_path / "does-not-exist")])
    assert res.returncode != 0


def test_usage_unknown_subcommand_exits_2(repo_root: Path, run_cmd):
    guard = repo_root / "scripts" / "git-crypt-guard.sh"
    res = run_cmd(["bash", str(guard), "bogus"])
    assert res.returncode == 2


def test_is_managed(repo_root: Path, run_cmd):
    guard = repo_root / "scripts" / "git-crypt-guard.sh"

    # secrets dir files are managed
    res = run_cmd(["bash", str(guard), "is-managed", "environments/.secrets/mentolder.yaml"])
    assert res.returncode == 0

    # claude-code MCP secrets are managed
    res = run_cmd(["bash", str(guard), "is-managed", "deploy/mcp/claude-code-secrets.yaml"])
    assert res.returncode == 0

    # PUBLIC sealing certs are NOT managed
    res = run_cmd(["bash", str(guard), "is-managed", "environments/certs/mentolder.pem"])
    assert res.returncode != 0

    # .gitkeep placeholder is NOT managed
    res = run_cmd(["bash", str(guard), "is-managed", "environments/.secrets/.gitkeep"])
    assert res.returncode != 0
