"""Native migration of tests/unit/tickets-pr-events.bats."""
import os
import shutil

import pytest

PSQL = ["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"]
PROD_MARKERS = ("web.mentolder.de", "web.korczewski.de")


@pytest.fixture
def tracking_url(repo_root):
    url = os.environ.get("TRACKING_DB_URL", "")
    if url == "":
        pytest.skip("TRACKING_DB_URL not set")
    if any(marker in url for marker in PROD_MARKERS):
        pytest.skip("refusing to run against prod URL")
    if shutil.which("psql") is None:
        pytest.skip("psql not available")
    return url


@pytest.fixture
def pr_event_rows(run_cmd, repo_root, tracking_url):
    """Teardown from the BATS file: remove the fixture rows after each case."""
    yield
    run_cmd(PSQL + [tracking_url, "-c",
                    "DELETE FROM tickets.pr_events WHERE pr_number IN (-99001, -99002)"],
            cwd=repo_root, timeout=300)


def test_pr_events_table_exists_with_expected_columns(run_cmd, repo_root, tracking_url):
    result = run_cmd(PSQL + [tracking_url, "-c",
                             "SELECT column_name FROM information_schema.columns "
                             "WHERE table_schema='tickets' AND table_name='pr_events' "
                             "ORDER BY ordinal_position"], cwd=repo_root, timeout=300)
    assert result.returncode == 0
    for column in ("pr_number", "title", "category", "merged_at", "status"):
        assert column in result.output


def test_pr_events_pr_number_is_primary_key_rejects_duplicates(run_cmd, repo_root, tracking_url, pr_event_rows):
    first = run_cmd(PSQL + [tracking_url, "-c",
                            "INSERT INTO tickets.pr_events (pr_number, title, category, merged_at) "
                            "VALUES (-99001, 't', 'chore', now())"], cwd=repo_root, timeout=300)
    assert first.returncode == 0, first.output
    result = run_cmd(PSQL + [tracking_url, "-c",
                             "INSERT INTO tickets.pr_events (pr_number, title, category, merged_at) "
                             "VALUES (-99001, 't2', 'chore', now())"], cwd=repo_root, timeout=300)
    assert result.returncode != 0
    assert "duplicate" in result.output or "unique" in result.output


def test_pr_events_status_check_constraint_rejects_bogus_values(run_cmd, repo_root, tracking_url, pr_event_rows):
    result = run_cmd(PSQL + [tracking_url, "-c",
                             "INSERT INTO tickets.pr_events (pr_number, title, category, merged_at, status) "
                             "VALUES (-99002, 't', 'chore', now(), 'bogus')"], cwd=repo_root, timeout=300)
    assert result.returncode != 0
