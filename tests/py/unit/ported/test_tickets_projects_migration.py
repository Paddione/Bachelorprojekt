"""Native migration of tests/unit/tickets-projects-migration.bats.

Tests for scripts/migrate-projects-to-tickets.mjs. Skips if no shared DB is
reachable and cleans up its own fixture rows. Assumes TRACKING_DB_URL points at
a non-prod DB authenticated as `postgres`.
"""
import os
import re
import shutil

import pytest

PROJ_ID = "11111111-1111-1111-1111-111111111111"
SUB_ID = "22222222-2222-2222-2222-222222222222"
TASK_ID = "33333333-3333-3333-3333-333333333333"
DIRECT_TASK_ID = "44444444-4444-4444-4444-444444444444"
ATT_ID = "55555555-5555-5555-5555-555555555555"
SUNSET_SKIP = "projects view does not exist (sunset already applied)"


@pytest.fixture
def db(repo_root):
    url = os.environ.get("TRACKING_DB_URL", "")
    if url == "":
        pytest.skip("TRACKING_DB_URL not set")
    if "web.mentolder.de" in url or "web.korczewski.de" in url:
        pytest.skip("refusing to run against prod URL")
    if shutil.which("psql") is None or shutil.which("node") is None:
        pytest.skip("psql and node required")
    return {
        "url": url,
        "script": str(repo_root / "scripts" / "migrate-projects-to-tickets.mjs"),
    }


def _psql(run_cmd, url, sql):
    """Port of $PSQL: psql -X -A -t -v ON_ERROR_STOP=1."""
    return run_cmd(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", url, "-c", sql], timeout=300)


def _scalar(run_cmd, url, sql):
    return _psql(run_cmd, url, sql).stdout.replace(" ", "").strip()


def _require_projects_view(run_cmd, url):
    probe = run_cmd(
        ["psql", url, "-c", "SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='projects'"],
        timeout=300,
    )
    if "(1 row)" not in probe.stdout:
        pytest.skip(SUNSET_SKIP)


def _migrate(run_cmd, db, *flags):
    run_cmd(
        ["node", db["script"], *flags],
        env={"TRACKING_DB_URL": db["url"]},
        timeout=300,
    ).check(0)


@pytest.fixture(autouse=True)
def _teardown(db, run_cmd):
    yield
    url = db["url"]
    cleanup = [
        f"DELETE FROM tickets.ticket_attachments WHERE id IN ('{ATT_ID}')",
        f"DELETE FROM tickets.tickets WHERE id IN ('{DIRECT_TASK_ID}','{TASK_ID}','{SUB_ID}','{PROJ_ID}')",
        f"DELETE FROM project_attachments_legacy WHERE id='{ATT_ID}'",
        f"DELETE FROM project_tasks_legacy WHERE id IN ('{DIRECT_TASK_ID}','{TASK_ID}')",
        f"DELETE FROM sub_projects_legacy WHERE id='{SUB_ID}'",
        f"DELETE FROM projects_legacy WHERE id='{PROJ_ID}'",
    ]
    for sql in cleanup:
        try:
            _psql(run_cmd, url, sql)
        except Exception:
            pass


def test_migration_dry_run_does_not_write(db, run_cmd):
    _require_projects_view(run_cmd, db["url"])
    count_sql = "SELECT COUNT(*) FROM tickets.tickets WHERE type IN ('project','task')"
    before = _scalar(run_cmd, db["url"], count_sql)
    _migrate(run_cmd, db)
    after = _scalar(run_cmd, db["url"], count_sql)
    assert before == after


def test_migration_row_count_parity_projects_sub_projects_project_tasks_tickets_type_in_project_task(db, run_cmd):
    _require_projects_view(run_cmd, db["url"])
    url = db["url"]
    legacy_p = _scalar(run_cmd, url,
        "SELECT count(*) FROM (SELECT 1 FROM projects UNION ALL SELECT 1 FROM projects_legacy) x")
    legacy_s = _scalar(run_cmd, url,
        "SELECT count(*) FROM (SELECT 1 FROM sub_projects UNION ALL SELECT 1 FROM sub_projects_legacy) x")
    legacy_t = _scalar(run_cmd, url,
        "SELECT count(*) FROM (SELECT 1 FROM project_tasks UNION ALL SELECT 1 FROM project_tasks_legacy) x")

    _migrate(run_cmd, db, "--apply")

    proj = _scalar(run_cmd, url, "SELECT count(*) FROM tickets.tickets WHERE type='project' AND parent_id IS NULL")
    sub = _scalar(run_cmd, url, "SELECT count(*) FROM tickets.tickets WHERE type='project' AND parent_id IS NOT NULL")
    task = _scalar(run_cmd, url, "SELECT count(*) FROM tickets.tickets WHERE type='task'")

    assert int(proj) >= int(legacy_p)
    assert int(sub) >= int(legacy_s)
    assert int(task) >= int(legacy_t)


def test_migration_apply_moves_a_fresh_project_row_into_tickets_tickets(db, run_cmd):
    url = db["url"]
    _require_projects_view(run_cmd, url)
    is_table = _scalar(run_cmd, url, "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='projects'")
    if is_table == "0":
        pytest.skip("projects already a view; legacy-path test N/A")

    _psql(run_cmd, url,
        "INSERT INTO projects (id, brand, name, description, status, priority)\n"
        f"     VALUES ('{PROJ_ID}', 'mentolder', 'BATS test project', 'desc', 'aktiv', 'mittel')\n"
        "     ON CONFLICT (id) DO NOTHING").check(0)

    _migrate(run_cmd, db, "--apply")

    r = _psql(run_cmd, url,
        f"SELECT type, status, brand, title FROM tickets.tickets WHERE id='{PROJ_ID}'")
    assert r.returncode == 0, r.output
    assert "project" in r.output
    assert "in_progress" in r.output
    assert "mentolder" in r.output
    assert "BATS test project" in r.output


def test_migration_apply_twice_is_idempotent_no_duplicates(db, run_cmd):
    url = db["url"]
    _require_projects_view(run_cmd, url)
    _migrate(run_cmd, db, "--apply")
    _migrate(run_cmd, db, "--apply")
    r = _psql(run_cmd, url, f"SELECT count(*) FROM tickets.tickets WHERE id='{PROJ_ID}'")
    assert r.returncode == 0, r.output
    assert re.fullmatch(r"\s*[01]\s*", r.output), r.output


def test_migration_parent_id_chain_is_intact_sub_project_parent_is_a_project(db, run_cmd):
    url = db["url"]
    _require_projects_view(run_cmd, url)
    r = _psql(run_cmd, url,
        "SELECT count(*) FROM tickets.tickets c\n"
        "       LEFT JOIN tickets.tickets p ON p.id = c.parent_id\n"
        "      WHERE c.type='project' AND c.parent_id IS NOT NULL\n"
        "        AND (p.id IS NULL OR p.type <> 'project' OR p.parent_id IS NOT NULL)")
    assert r.returncode == 0, r.output
    assert re.fullmatch(r"\s*0\s*", r.output), f"orphan sub_project tickets: {r.output}"


def test_migration_parent_id_chain_is_intact_task_parent_is_project_or_sub_project(db, run_cmd):
    url = db["url"]
    _require_projects_view(run_cmd, url)
    r = _psql(run_cmd, url,
        "SELECT count(*) FROM tickets.tickets c\n"
        "       LEFT JOIN tickets.tickets p ON p.id = c.parent_id\n"
        "      WHERE c.type='task' AND c.parent_id IS NOT NULL\n"
        "        AND (p.id IS NULL OR p.type <> 'project')")
    assert r.returncode == 0, r.output
    assert re.fullmatch(r"\s*0\s*", r.output), f"orphan task tickets: {r.output}"


def test_migration_back_compat_view_projects_has_the_expected_column_shape(db, run_cmd):
    url = db["url"]
    _require_projects_view(run_cmd, url)
    r = _psql(run_cmd, url,
        "SELECT column_name FROM information_schema.columns\n"
        "      WHERE table_schema='public' AND table_name='projects' ORDER BY column_name")
    assert r.returncode == 0, r.output
    for col in ("id brand name description notes start_date due_date status priority "
                "customer_id admin_id created_at updated_at").split():
        assert col in r.output, f"missing column on projects view: {col}"


def test_migration_status_round_trip_in_progress_surfaces_as_aktiv_through_the_projects_view(db, run_cmd):
    url = db["url"]
    _require_projects_view(run_cmd, url)
    r = _psql(run_cmd, url, f"SELECT status FROM projects WHERE id='{PROJ_ID}'")
    assert r.returncode == 0, r.output
    assert "aktiv" in r.output
