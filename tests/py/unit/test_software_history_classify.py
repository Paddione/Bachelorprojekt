"""Tests for software-history classifier CLI (migrated from tests/unit/scripts/software-history-classify.bats)."""

import os
from pathlib import Path
import subprocess
import time
import pytest


@pytest.fixture
def mock_db_and_api(repo_root: Path):
    pg_url = os.environ.get("TEST_PG_URL")
    if not pg_url:
        pytest.skip("TEST_PG_URL not set — set to a throwaway postgres URL to enable this test")

    mock_port = 4173
    env = os.environ.copy()
    env["MOCK_PORT"] = str(mock_port)
    env["LITELLM_URL"] = f"http://127.0.0.1:{mock_port}"
    env["ANTHROPIC_API_KEY"] = "sk-local"
    env["TRACKING_DB_URL"] = pg_url

    proc = subprocess.Popen(
        ["node", "tests/unit/fixtures/software-history/mock-anthropic.mjs"],
        cwd=repo_root,
        env=env,
    )

    try:
        # wait for mock to be ready
        for _ in range(50):
            res = subprocess.run(["curl", "-s", f"http://127.0.0.1:{mock_port}/"], capture_output=True)
            if res.returncode == 0:
                break
            time.sleep(0.1)

        # setup db tables
        subprocess.run(
            ["psql", pg_url, "-v", "ON_ERROR_STOP=1", "-f", "deploy/tracking/init.sql"],
            cwd=repo_root,
            check=True,
            capture_output=True,
        )

        sql_setup = """
TRUNCATE bachelorprojekt.software_events CASCADE;
TRUNCATE bachelorprojekt.features CASCADE;
INSERT INTO bachelorprojekt.features (pr_number, title, description, category, merged_at, status) VALUES
  (1, 'feat: add mattermost', 'introduce mattermost', 'feat', '2025-01-01', 'shipped'),
  (2, 'chore: replace mattermost', 'remove mattermost, add native chat', 'chore', '2025-03-01', 'shipped'),
  (3, 'docs: tweak readme', 'wording', 'docs', '2025-04-01', 'shipped');
"""
        subprocess.run(
            ["psql", pg_url, "-v", "ON_ERROR_STOP=1", "-c", sql_setup],
            cwd=repo_root,
            check=True,
            capture_output=True,
        )

        yield env
    finally:
        proc.terminate()
        proc.wait()


def test_classifies_every_unclassified_pr_once(repo_root: Path, mock_db_and_api: dict[str, str]):
    env = mock_db_and_api
    res = subprocess.run(
        ["npx", "tsx", "../scripts/software-history-classify.mts"],
        cwd=repo_root / "components" / "website",
        env=env,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0

    count_res = subprocess.run(
        ["psql", "-At", env["TRACKING_DB_URL"], "-c", "SELECT count(*) FROM bachelorprojekt.software_events"],
        capture_output=True,
        text=True,
        check=True,
    )
    assert count_res.stdout.strip() == "4"


def test_classification_idempotent(repo_root: Path, mock_db_and_api: dict[str, str]):
    env = mock_db_and_api
    subprocess.run(
        ["npx", "tsx", "../scripts/software-history-classify.mts"],
        cwd=repo_root / "components" / "website",
        env=env,
        check=True,
    )
    res = subprocess.run(
        ["npx", "tsx", "../scripts/software-history-classify.mts"],
        cwd=repo_root / "components" / "website",
        env=env,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0

    count_res = subprocess.run(
        ["psql", "-At", env["TRACKING_DB_URL"], "-c", "SELECT count(*) FROM bachelorprojekt.software_events"],
        capture_output=True,
        text=True,
        check=True,
    )
    assert count_res.stdout.strip() == "4"
