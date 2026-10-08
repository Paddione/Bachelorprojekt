"""Native migration of tests/unit/scripts/software-history-classify.bats."""
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

MOCK_PORT = 4173
SEED_SQL = """TRUNCATE bachelorprojekt.software_events CASCADE;
TRUNCATE bachelorprojekt.features CASCADE;
INSERT INTO bachelorprojekt.features (pr_number, title, description, category, merged_at, status) VALUES
  (1, 'feat: add mattermost', 'introduce mattermost', 'feat', '2025-01-01', 'shipped'),
  (2, 'chore: replace mattermost', 'remove mattermost, add native chat', 'chore', '2025-03-01', 'shipped'),
  (3, 'docs: tweak readme', 'wording', 'docs', '2025-04-01', 'shipped');
"""
CLASSIFY = "cd components/website && npx tsx ../scripts/software-history-classify.mts"


@pytest.fixture
def pg_url():
    url = os.environ.get("TEST_PG_URL", "")
    if not url:
        pytest.skip("TEST_PG_URL not set — set to a throwaway postgres URL to enable this test")
    for tool in ("psql", "npx", "node"):
        if shutil.which(tool) is None:
            pytest.skip(f"{tool} not available")
    return url


@pytest.fixture
def mock_anthropic(repo_root: Path, pg_url, monkeypatch):
    """Start the stub Anthropic endpoint, seed the schema, stop the stub after the case."""
    monkeypatch.setenv("MOCK_PORT", str(MOCK_PORT))
    monkeypatch.setenv("LITELLM_URL", f"http://127.0.0.1:{MOCK_PORT}")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-local")
    monkeypatch.setenv("TRACKING_DB_URL", pg_url)
    proc = subprocess.Popen(["node", "tests/unit/fixtures/software-history/mock-anthropic.mjs"],
                            cwd=str(repo_root), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{MOCK_PORT}/", timeout=1).close()
                break
            except (urllib.error.URLError, OSError):
                time.sleep(0.1)
        init = subprocess.run(["psql", pg_url, "-v", "ON_ERROR_STOP=1", "-f", "deploy/tracking/init.sql"],
                              cwd=str(repo_root), capture_output=True, text=True, timeout=300)
        assert init.returncode == 0, init.stderr
        seed = subprocess.run(["psql", pg_url, "-v", "ON_ERROR_STOP=1", "-c", SEED_SQL],
                              cwd=str(repo_root), capture_output=True, text=True, timeout=300)
        assert seed.returncode == 0, seed.stderr
        yield
    finally:
        proc.kill()
        proc.wait()


def _psql_at(run_cmd, pg_url: str, sql: str, repo_root: Path):
    return run_cmd(["psql", "-At", pg_url, "-c", sql], cwd=repo_root, timeout=300)


def _classify(run_cmd, repo_root: Path, *flags: str):
    suffix = "".join(f" {flag}" for flag in flags)
    return run_cmd(["bash", "-c", CLASSIFY + suffix], cwd=repo_root, timeout=300)


def test_classifies_every_unclassified_pr_exactly_once(run_cmd, repo_root, pg_url, mock_anthropic):
    result = _classify(run_cmd, repo_root)
    assert result.returncode == 0
    count = _psql_at(run_cmd, pg_url, "SELECT count(*) FROM bachelorprojekt.software_events", repo_root)
    assert int(count.output) == 4  # 1 + 2 + 1


def test_re_run_is_idempotent(run_cmd, repo_root, pg_url, mock_anthropic):
    _classify(run_cmd, repo_root)
    result = _classify(run_cmd, repo_root)
    assert result.returncode == 0
    count = _psql_at(run_cmd, pg_url, "SELECT count(*) FROM bachelorprojekt.software_events", repo_root)
    assert int(count.output) == 4


def test_manual_overrides_survive_force_re_run(run_cmd, repo_root, pg_url, mock_anthropic):
    _classify(run_cmd, repo_root)
    update = run_cmd(["psql", pg_url, "-v", "ON_ERROR_STOP=1", "-c",
                      "UPDATE bachelorprojekt.software_events SET classifier='manual', "
                      "service='manually-renamed' WHERE pr_number=1"], cwd=repo_root, timeout=300)
    assert update.returncode == 0, update.output
    result = _classify(run_cmd, repo_root, "--retry-failed")
    assert result.returncode == 0
    service = _psql_at(run_cmd, pg_url,
                       "SELECT service FROM bachelorprojekt.software_events WHERE pr_number=1", repo_root)
    assert service.output == "manually-renamed"


def test_limit_caps_work(run_cmd, repo_root, pg_url, mock_anthropic):
    result = _classify(run_cmd, repo_root, "--limit=1")
    assert result.returncode == 0
    distinct = _psql_at(run_cmd, pg_url,
                        "SELECT count(DISTINCT pr_number) FROM bachelorprojekt.software_events", repo_root)
    assert int(distinct.output) == 1
