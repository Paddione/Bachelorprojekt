"""Native migration of tests/unit/tickets-sunset.bats.

Verifies the post-sunset DB state produced by scripts/tickets-sunset.mjs.
TRACKING_DB_URL selects the database; the static checks run unconditionally.
"""
import os
import shutil

import pytest

DEFAULT_PGURL = "postgres://website:website@localhost:5432/website"
NO_DB = "No database available (set TRACKING_DB_URL)"


@pytest.fixture
def pgurl(repo_root):
    url = os.environ.get("TRACKING_DB_URL", DEFAULT_PGURL)
    if "mentolder" in url or "korczewski" in url:
        pytest.skip("TRACKING_DB_URL points to a production host — refusing to run against live data")
    return url


@pytest.fixture
def psql_db(pgurl, run_cmd):
    """Port of the runtime `psql ... || skip` precondition."""
    if shutil.which("psql") is None:
        pytest.skip(NO_DB)
    return pgurl


def _query(run_cmd, url, sql):
    return run_cmd(["psql", url, "-t", "-A", "-c", sql], timeout=60)


def _ensure_db(run_cmd, url):
    if run_cmd(["psql", url, "-c", "SELECT 1"], timeout=60).returncode != 0:
        pytest.skip(NO_DB)


def _relkind(run_cmd, url, schema, name):
    sql = (
        "SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
        f"WHERE n.nspname='{schema}' AND c.relname='{name}'"
    )
    r = _query(run_cmd, url, sql)
    return r.stdout.strip() if r.returncode == 0 else ""


def _object_gone(run_cmd, url, schema, name):
    """Port of object_gone(): count of the object in pg_class must be 0."""
    sql = (
        "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
        f"WHERE n.nspname='{schema}' AND c.relname='{name}'"
    )
    r = _query(run_cmd, url, sql)
    if r.returncode != 0:
        pytest.skip(NO_DB)
    assert r.stdout.strip() == "0"


# Static checks

def test_static_sunset_script_exists(repo_root):
    assert (repo_root / "scripts" / "tickets-sunset.mjs").is_file()


def test_static_audit_script_exists(repo_root):
    assert (repo_root / "scripts" / "tickets-sunset-audit.mjs").is_file()


def test_static_sunset_script_is_idempotent_uses_if_exists(repo_root):
    assert "IF EXISTS" in (repo_root / "scripts" / "tickets-sunset.mjs").read_text(encoding="utf-8")


def test_static_sunset_script_has_apply_guard_dry_run_default(repo_root):
    text = (repo_root / "scripts" / "tickets-sunset.mjs").read_text(encoding="utf-8")
    assert "process.argv.includes('--apply')" in text


def test_static_sunset_script_picks_drop_kind_from_pg_class_relkind(repo_root):
    # Required so DROP works whether the legacy object is a base TABLE or VIEW.
    text = (repo_root / "scripts" / "tickets-sunset.mjs").read_text(encoding="utf-8")
    assert "relKind" in text or "relkind" in text


# Runtime checks

def test_runtime_bugs_bug_tickets_view_is_gone(psql_db, run_cmd):
    _object_gone(run_cmd, psql_db, "bugs", "bug_tickets")


def test_runtime_bugs_bug_tickets_legacy_table_is_gone(psql_db, run_cmd):
    _object_gone(run_cmd, psql_db, "bugs", "bug_tickets_legacy")


def test_runtime_bachelorprojekt_requirements_is_gone_was_view_or_table(psql_db, run_cmd):
    _object_gone(run_cmd, psql_db, "bachelorprojekt", "requirements")


def test_runtime_bachelorprojekt_features_is_gone(psql_db, run_cmd):
    _object_gone(run_cmd, psql_db, "bachelorprojekt", "features")


def test_runtime_bachelorprojekt_v_timeline_view_is_gone(psql_db, run_cmd):
    _object_gone(run_cmd, psql_db, "bachelorprojekt", "v_timeline")


def test_runtime_bachelorprojekt_pipeline_table_is_gone(psql_db, run_cmd):
    _object_gone(run_cmd, psql_db, "bachelorprojekt", "pipeline")


def test_runtime_public_projects_view_is_gone(psql_db, run_cmd):
    _object_gone(run_cmd, psql_db, "public", "projects")


def test_runtime_public_sub_projects_view_is_gone(psql_db, run_cmd):
    _object_gone(run_cmd, psql_db, "public", "sub_projects")


def test_runtime_public_project_tasks_view_is_gone(psql_db, run_cmd):
    _object_gone(run_cmd, psql_db, "public", "project_tasks")


def test_runtime_public_project_attachments_view_is_gone(psql_db, run_cmd):
    _object_gone(run_cmd, psql_db, "public", "project_attachments")


def test_runtime_tickets_tickets_table_exists_and_is_a_base_table(psql_db, run_cmd):
    _ensure_db(run_cmd, psql_db)
    assert _relkind(run_cmd, psql_db, "tickets", "tickets") == "r"


def test_runtime_tickets_tickets_has_rows(psql_db, run_cmd):
    _ensure_db(run_cmd, psql_db)
    r = _query(run_cmd, psql_db, "SELECT count(*) FROM tickets.tickets")
    n = r.stdout.strip() if r.returncode == 0 else ""
    assert int(n) > 0


def test_runtime_tickets_ticket_activity_exists(psql_db, run_cmd):
    _ensure_db(run_cmd, psql_db)
    assert _relkind(run_cmd, psql_db, "tickets", "ticket_activity") == "r"
