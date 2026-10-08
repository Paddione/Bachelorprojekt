"""Native migration of tests/spec/backup-pipeline/filen-remote-retention.bats."""

import os
import re
import shutil
from pathlib import Path

import pytest
import yaml

DB_MANIFEST_REL = "k3d/backup-cronjob.yaml"
PVC_MANIFEST_REL = "k3d/pvc-backup-cronjob.yaml"


@pytest.fixture
def manifests(repo_root):
    return repo_root / DB_MANIFEST_REL, repo_root / PVC_MANIFEST_REL


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _count(path: Path, needle: str, fixed: bool = True) -> int:
    pattern = re.escape(needle) if fixed else needle
    return sum(1 for line in _text(path).splitlines() if re.search(pattern, line))


def _extract_db_retention_block(path: Path) -> str:
    with open(path, encoding="utf-8") as fh:
        docs = list(yaml.safe_load_all(fh))
    cron = [d for d in docs if d and d.get("kind") == "CronJob"][0]
    container = cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][1]
    assert container["name"] == "filen-upload", f"container[1] is {container['name']}"
    script = container["args"][0].replace("$$", "$")
    match = re.search(r"(# ── Remote retention.*?)$", script, re.S)
    if not match:
        pytest.fail("retention block not found (exit 3)")
    return match.group(1)


def _write_stub(stub_dir: Path, body: str) -> Path:
    stub = stub_dir / "filen"
    stub.write_text("#!/bin/sh\n" + body, encoding="utf-8")
    stub.chmod(0o755)
    return stub


def _need_python_yaml():
    if shutil.which("python3") is None:
        pytest.skip("python3 not installed")
    try:
        import yaml  # noqa: F401
    except ImportError:
        pytest.skip("pyyaml not installed")


def test_db_backup_filen_upload_contains_the_remote_retention_block(manifests):
    db, _ = manifests
    assert _count(db, "Remote retention [T013300]") >= 1
    assert _count(db, "rm -y") >= 1


def test_pvc_backup_filen_upload_contains_the_remote_retention_block(manifests):
    _, pvc = manifests
    assert _count(pvc, "Remote retention [T013300]") >= 1
    assert _count(pvc, "rm -y") >= 1


def test_retention_keeps_at_most_14_generations_by_default_in_both_manifests(manifests):
    db, pvc = manifests
    assert _count(db, "FILEN_REMOTE_RETENTION:-14") >= 1
    assert _count(pvc, "FILEN_REMOTE_RETENTION:-14") >= 1


def test_deletions_are_guarded_by_the_strict_generation_name_regex_in_both_manifests(manifests):
    db, pvc = manifests
    regex = r"^(pvc-)?[0-9]{8}-[0-9]{6}$"
    assert _count(db, regex) >= 1
    assert _count(pvc, regex) >= 1


def test_retention_uses_soft_delete_only_no_hanging_trash_commands_are_invoked(manifests):
    db, pvc = manifests
    assert _count(db, "rm -y") >= 1
    assert _count(pvc, "rm -y") >= 1
    violations = 0
    for path in (db, pvc):
        for line in _text(path).splitlines():
            if re.match(r"^\s*#", line):
                continue
            if re.search(r"filen .*trash-(empty|delete)", line):
                violations += 1
    assert violations == 0


def test_every_retention_filen_call_is_timeout_wrapped_and_hang_protected(manifests):
    for path in manifests:
        assert _count(path, "timeout 120 filen --skip-update --no-autocomplete") >= 1
        assert _count(path, "timeout 90 filen --skip-update --no-autocomplete") >= 1


def test_retention_throttles_deletions_against_the_login_rate_limit(manifests):
    db, pvc = manifests
    assert _count(db, "sleep 3") >= 1
    assert _count(pvc, "sleep 3") >= 1


def test_prune_failure_exits_non_zero_instead_of_being_swallowed_silently(manifests):
    for path in manifests:
        assert _count(path, "PRUNE_FAILED") >= 1
        assert _count(path, '" -eq 0 ] || exit 1') >= 1


def test_filen_cli_is_pinned_to_the_proven_0_0_39_in_both_manifests(manifests):
    for path in manifests:
        assert _count(path, "npm install -g @filen/cli@0.0.39") == 1


def test_retention_block_prunes_exactly_the_oldest_generations_beyond_the_limit_stubbed_cli(
    tmp_path, repo_root, run_cmd
):
    _need_python_yaml()
    block = tmp_path / "block.sh"
    stub_dir = tmp_path / "stub"
    stub_dir.mkdir()
    calls = stub_dir / "calls.log"
    block.write_text(_extract_db_retention_block(repo_root / DB_MANIFEST_REL), encoding="utf-8")
    _write_stub(
        stub_dir,
        f'echo "$*" >> "{calls}"\n'
        'sub=""\n'
        'for a in "$@"; do case "$a" in ls|rm|upload) sub="$a"; break ;; esac; done\n'
        'case "$sub" in\n'
        '  ls) printf \'%s\\n\' "20260801-020001" "20260810-020002" "20260821-020003" \\\n'
        '              "pvc-20260805-030001" "pvc-20260819-031500" "not-a-generation.txt" ;;\n'
        "  rm) exit 0 ;;\n"
        "esac\n",
    )
    result = run_cmd(
        ["sh", str(block)],
        env={
            "PATH": f"{stub_dir}:" + os.environ.get("PATH", ""),
            "FILEN_EMAIL": "t@e.st",
            "FILEN_PASSWORD": "pw",
            "UPLOAD_PATH": "/Backup-test",
            "FILEN_REMOTE_RETENTION": "3",
        },
    )
    assert result.returncode == 0, result.output
    assert "5 Generationen gefunden" in result.output
    log = calls.read_text(encoding="utf-8").splitlines()
    rm_lines = [line for line in log if " rm -y /Backup-test/" in line]
    assert len(rm_lines) == 2
    assert any(line.endswith("rm -y /Backup-test/20260801-020001") for line in log)
    assert any(line.endswith("rm -y /Backup-test/20260810-020002") for line in log)
    assert not any("not-a-generation.txt" in line for line in log), "stub deleted a non-generation entry"
    assert not any(
        re.search(r"rm -y /Backup-test/(20260821-020003|pvc-20260805-030001|pvc-20260819-031500)$", line)
        for line in log
    ), "stub deleted a generation inside the keep-set"


def test_retention_block_fails_loudly_when_prune_or_listing_fails_stubbed_cli(
    tmp_path, repo_root, run_cmd
):
    _need_python_yaml()
    block = tmp_path / "block.sh"
    stub_dir = tmp_path / "stub"
    stub_dir.mkdir()
    block.write_text(_extract_db_retention_block(repo_root / DB_MANIFEST_REL), encoding="utf-8")
    _write_stub(
        stub_dir,
        'sub=""\n'
        'for a in "$@"; do case "$a" in ls|rm|upload) sub="$a"; break ;; esac; done\n'
        'case "$sub" in\n'
        '  ls) printf "%s\\n" "20260801-020001" "20260810-020002" ;;\n'
        "  rm) exit 1 ;;\n"
        "esac\n",
    )
    result = run_cmd(
        ["sh", str(block)],
        env={
            "PATH": f"{stub_dir}:" + os.environ.get("PATH", ""),
            "FILEN_EMAIL": "t@e.st",
            "FILEN_PASSWORD": "pw",
            "UPLOAD_PATH": "/Backup-test",
            "FILEN_REMOTE_RETENTION": "1",
        },
    )
    assert result.returncode == 1, result.output
