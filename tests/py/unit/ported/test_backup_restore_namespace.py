"""Native migration of tests/unit/backup-restore-namespace.bats."""
import re
from pathlib import Path

import pytest


@pytest.fixture
def script(repo_root: Path) -> Path:
    return repo_root / "scripts" / "backup-restore.sh"


def test_no_hardcoded_dash_n_workspace_outside_ns_default(script):
    # Allow the single default assignment 'NS=workspace'; forbid literal '-n workspace'.
    assert script.is_file(), f"missing {script}"
    pattern = re.compile(r"-n workspace([^-]|$)")
    hits = [
        f"{num}:{line}"
        for num, line in enumerate(script.read_text(encoding="utf-8").splitlines(), 1)
        if pattern.search(line)
    ]
    assert not hits, "\n".join(hits)


def test_kubectl_secret_lookups_for_workspace_secrets_pass_dash_n_ns(script):
    # Any kubectl ($KC) command touching the workspace-secrets Secret must carry -n "$NS".
    assert script.is_file(), f"missing {script}"
    pattern = re.compile(r"(kubectl|\$KC)[^#]*secret[^#]*workspace-secrets")
    offenders = [
        f"{num}:{line}"
        for num, line in enumerate(script.read_text(encoding="utf-8").splitlines(), 1)
        if pattern.search(line) and '-n "$NS"' not in line
    ]
    assert not offenders, "\n".join(offenders)
