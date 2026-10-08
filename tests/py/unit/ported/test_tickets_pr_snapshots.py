"""Native migration of tests/unit/tickets-pr-snapshots.bats."""
import os
import shutil

import pytest

PSQL = ["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"]


@pytest.fixture
def tracking_url(run_cmd):
    url = os.environ.get("TRACKING_DB_URL", "")
    if not url:
        pytest.skip("TRACKING_DB_URL not set")
    if "web.mentolder.de" in url or "web.korczewski.de" in url:
        pytest.skip("refusing to run against prod URL")
    if shutil.which("psql") is None:
        pytest.skip("psql not installed")
    yield url
    # teardown: eigene Fixture-Zeile entfernen (Fehler ignoriert, wie im Original).
    run_cmd(
        PSQL + [url, "-c", "DELETE FROM tickets.github_sync_cursors WHERE id = 'test_cursor'"],
        timeout=300,
    )


def test_github_snapshots_snapshot_tables_and_cursor_table_exist(tracking_url, run_cmd):
    res = run_cmd(
        PSQL + [
            tracking_url, "-c",
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='tickets' AND table_name IN "
            "('github_issue_snapshots', 'github_pr_snapshots', 'github_sync_cursors') "
            "ORDER BY table_name",
        ],
        timeout=300,
    )
    assert res.returncode == 0, res.output
    assert "github_issue_snapshots" in res.output
    assert "github_pr_snapshots" in res.output
    assert "github_sync_cursors" in res.output


def test_github_sync_cursors_accepts_cursor_upserts(tracking_url, run_cmd):
    upsert = run_cmd(
        PSQL + [
            tracking_url, "-c",
            "INSERT INTO tickets.github_sync_cursors (id, cursor, synced_count) "
            "VALUES ('test_cursor', 'c_123', 5) "
            "ON CONFLICT (id) DO UPDATE SET cursor = EXCLUDED.cursor, synced_count = EXCLUDED.synced_count",
        ],
        timeout=300,
    )
    assert upsert.returncode == 0, upsert.output

    res = run_cmd(
        PSQL + [
            tracking_url, "-c",
            "SELECT cursor, synced_count FROM tickets.github_sync_cursors WHERE id='test_cursor'",
        ],
        timeout=300,
    )
    assert res.returncode == 0, res.output
    assert "c_123|5" in res.output
