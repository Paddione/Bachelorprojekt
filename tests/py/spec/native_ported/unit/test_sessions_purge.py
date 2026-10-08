"""Native migration of tests/unit/sessions-purge.bats."""
import stat
import os
from pathlib import Path

import pytest


@pytest.fixture
def script(repo_root: Path) -> Path:
    return repo_root / "scripts" / "sessions-purge.sh"


@pytest.fixture
def stub_dir(tmp_path: Path, monkeypatch) -> Path:
    """Stub directory prepended to PATH so no real HTTP call happens."""
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    monkeypatch.setenv("SESSIONS_PURGE_URL", "http://fake-website.local/api/admin/sessions/purge")
    monkeypatch.setenv("PATH", f"{stubs}:{os.environ.get('PATH', '')}")
    return stubs


def _write_curl(stub_dir: Path, body: str) -> None:
    curl = stub_dir / "curl"
    curl.write_text(body, encoding="utf-8")
    curl.chmod(curl.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def test_successful_purge_token_set_curl_http_200(run_cmd, script, stub_dir, monkeypatch):
    monkeypatch.setenv("SESSIONS_CRON_TOKEN", "test-token-abc")
    _write_curl(stub_dir, '#!/usr/bin/env bash\nprintf \'{"purged":2,"warnings":[]}\'\nexit 0\n')

    result = run_cmd(["bash", str(script)])
    assert result.returncode == 0, result.output
    assert '"purged"' in result.output


def test_missing_token_exits_2_with_error_message(run_cmd, script, stub_dir, monkeypatch):
    monkeypatch.delenv("SESSIONS_CRON_TOKEN", raising=False)
    _write_curl(stub_dir, "#!/usr/bin/env bash\nexit 0\n")

    result = run_cmd(["bash", str(script)])
    assert result.returncode == 2, result.output
    assert "required" in result.output


def test_curl_failure_http_500_exits_1(run_cmd, script, stub_dir, monkeypatch):
    monkeypatch.setenv("SESSIONS_CRON_TOKEN", "test-token-xyz")
    _write_curl(stub_dir, "#!/usr/bin/env bash\nexit 22\n")

    result = run_cmd(["bash", str(script)])
    assert result.returncode == 1, result.output
