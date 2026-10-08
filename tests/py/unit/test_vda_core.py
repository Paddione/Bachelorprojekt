"""tests/py/unit/test_vda_core.py — Migration of tests/unit/vda-core.bats."""
from pathlib import Path
import pytest


def test_vda_header_prints_banner(run_cmd):
    res = run_cmd("bash -c 'source scripts/lib/vda-core.sh; vda_header \"Test Header\"'")
    res.check(0)
    assert "Test Header" in res.output
    assert "──" in res.output


def test_vda_section_prints_bullet_point(run_cmd):
    res = run_cmd("bash -c 'source scripts/lib/vda-core.sh; vda_section \"key\" \"value\"'")
    res.check(0)
    assert "• key: value" in res.output


def test_vda_list_prints_numbered_list(run_cmd):
    res = run_cmd("bash -c 'source scripts/lib/vda-core.sh; vda_list \"Items\" \"one\" \"two\"'")
    res.check(0)
    assert "Items:" in res.output
    assert "1. one" in res.output
    assert "2. two" in res.output


def test_vda_error_outputs_to_stderr(run_cmd):
    res = run_cmd("bash -c 'source scripts/lib/vda-core.sh; vda_error \"danger\"'")
    res.check(0)
    assert "danger" in res.output


def test_vda_choose_returns_default_in_non_interactive_mode(run_cmd):
    res = run_cmd("bash -c 'source scripts/lib/vda-core.sh; VDA_NONINTERACTIVE=1 vda_choose \"Select?\" \"first\" \"second\"'")
    res.check(0)
    assert res.stdout.strip() == "first"


def test_vda_confirm_returns_true_in_non_interactive_mode(run_cmd):
    res = run_cmd("bash -c 'source scripts/lib/vda-core.sh; VDA_NONINTERACTIVE=1 vda_confirm \"Continue?\"'")
    res.check(0)


def test_vda_input_returns_default_in_non_interactive_mode(run_cmd):
    res = run_cmd("bash -c 'source scripts/lib/vda-core.sh; VDA_NONINTERACTIVE=1 vda_input \"Name?\" \"default\"'")
    res.check(0)
    assert res.stdout.strip() == "default"


def test_vda_json_builds_json_without_jq(run_cmd):
    res = run_cmd("bash -c 'source scripts/lib/vda-core.sh; vda_json key=value num=42'")
    assert '"key":"value"' in res.output
    assert '"num":"42"' in res.output


def test_vda_exec_runs_a_command(run_cmd):
    res = run_cmd("bash -c 'source scripts/lib/vda-core.sh; vda_exec \"echo hello\"'")
    assert "hello" in res.output


def test_vda_dry_run_does_not_execute(run_cmd, tmp_path: Path):
    tmpfile = tmp_path / "dry_run_test_file"
    res = run_cmd(f"bash -c 'source scripts/lib/vda-core.sh; DRY_RUN=1 vda_exec \"touch {tmpfile}\"'")
    assert not tmpfile.exists()
