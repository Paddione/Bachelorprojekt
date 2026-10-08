"""Native migration of tests/local/e2e-skill-selfpatch.bats."""
import os
import stat
from pathlib import Path

import pytest

KUBECTL_DEFAULT = '#!/usr/bin/env bash\nif [[ "$*" == *"get pod"* ]]; then\n  echo "pod/shared-db-0"\nelif [[ "$*" == *"psql"* ]]; then\n  echo "1"\nfi\n'
KUBECTL_EMPTY = '#!/usr/bin/env bash\necho ""\n'
GH_STUB = '#!/usr/bin/env bash\necho "[stub-gh] $*"\n'


def _write_stub(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


@pytest.fixture
def stub_env(tmp_path, monkeypatch):
    """Create kubectl/gh stubs in tmp_path and prepend them to PATH (offline run)."""
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    _write_stub(stubs / "kubectl", KUBECTL_DEFAULT)
    _write_stub(stubs / "gh", GH_STUB)
    path = f"{stubs}{os.pathsep}{os.environ.get('PATH', '')}"
    monkeypatch.setenv("PATH", path)
    return {"BATS_TMPDIR": str(tmp_path), "PATH": path, "stubs": stubs}


def test_e2e_skill_selfpatch_exits_2_with_no_args(run_cmd, stub_env):
    result = run_cmd(["bash", "scripts/e2e-skill-selfpatch.sh"], env=stub_env)
    assert result.returncode == 2
    assert "Usage:" in result.output


def test_e2e_skill_selfpatch_list_trivial_exits_0_when_no_pod(run_cmd, stub_env):
    _write_stub(stub_env["stubs"] / "kubectl", KUBECTL_EMPTY)
    result = run_cmd(["bash", "scripts/e2e-skill-selfpatch.sh", "--list-trivial"], env=stub_env)
    assert result.returncode == 0


def test_e2e_skill_selfpatch_trivial_classification_regex_matches_command_errors(run_cmd):
    result = run_cmd(
        [
            "bash", "-c",
            'echo "wrong command flag --headed missing" '
            '| grep -qiE "command|flag|example|typo|wrong.*path|missing.*step|exit.?code|add.*check" '
            '&& echo "trivial" || echo "structural"',
        ]
    )
    assert result.returncode == 0
    assert result.stdout.strip() == "trivial"


def test_e2e_skill_selfpatch_trivial_classification_regex_rejects_structural_description(run_cmd):
    result = run_cmd(
        [
            "bash", "-c",
            'echo "Step 5 should be moved before Step 3 to match routing order" '
            '| grep -qiE "command|flag|example|typo|wrong.*path|missing.*step|exit.?code|add.*check" '
            '&& echo "trivial" || echo "structural"',
        ]
    )
    assert result.returncode == 0
    assert result.stdout.strip() == "structural"


def test_e2e_skill_selfpatch_commit_requires_two_args(run_cmd, stub_env):
    result = run_cmd(["bash", "scripts/e2e-skill-selfpatch.sh", "--commit"], env=stub_env)
    assert result.returncode != 0


def test_e2e_skill_selfpatch_defer_structural_exits_0_when_no_pod(run_cmd, stub_env):
    _write_stub(stub_env["stubs"] / "kubectl", KUBECTL_EMPTY)
    result = run_cmd(["bash", "scripts/e2e-skill-selfpatch.sh", "--defer-structural"], env=stub_env)
    assert result.returncode == 0
