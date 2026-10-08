"""Native migration of tests/spec/application-pipeline/schema.bats."""

import os
import shutil

import pytest


def _ns():
    return os.environ.get("WORKSPACE_NS", "workspace")


def _ctx():
    return os.environ.get("WORKSPACE_CTX", "fleet")


def _shared_db_pod(run_cmd):
    if not shutil.which("kubectl"):
        return ""
    result = run_cmd(
        ["kubectl", "get", "pod", "-n", _ns(), "--context", _ctx(),
         "-l", "app in (shared-db,shared-db-dev)", "--field-selector", "status.phase=Running",
         "-o", "name"],
        timeout=60,
    )
    if result.returncode != 0:
        return ""
    return result.stdout.strip().splitlines()[0] if result.stdout.strip() else ""


def _skip_if_no_db(run_cmd):
    if os.environ.get("WORKSPACE_PG_URL"):
        return
    if not _shared_db_pod(run_cmd):
        pytest.skip("no Running shared-db pod reachable (offline/CI)")


def _query(run_cmd, sql):
    pg_url = os.environ.get("WORKSPACE_PG_URL")
    if pg_url:
        return run_cmd(["psql", pg_url, "-qtA", "-v", "ON_ERROR_STOP=1", "-c", sql])
    pod = _shared_db_pod(run_cmd)
    return run_cmd(
        ["kubectl", "exec", "-i", pod, "-n", _ns(), "--context", _ctx(),
         "-c", "postgres", "--", "psql", "-U", "website", "-d", "website",
         "-qtA", "-v", "ON_ERROR_STOP=1", "-c", sql]
    )


@pytest.fixture(autouse=True)
def _module_setup(run_cmd):
    if not shutil.which("psql"):
        pytest.skip("psql binary not installed")
    _skip_if_no_db(run_cmd)


def test_t900228_applications_jobs_table_exists_with_valid_columns(run_cmd):
    result = _query(run_cmd, "SELECT to_regclass('applications.jobs') IS NOT NULL;")
    assert result.returncode == 0, result.output
    assert result.output == "t"

    result = _query(run_cmd, "SELECT column_name FROM information_schema.columns "
                             "WHERE table_schema='applications' AND table_name='jobs' ORDER BY ordinal_position;")
    assert result.returncode == 0, result.output
    for column in ["id", "company", "role_title", "source_url", "raw_text",
                   "requirements", "status", "created_at", "updated_at"]:
        assert column in result.output, column


def test_t900228_applications_dossiers_table_exists_with_foreign_key_to_jobs(run_cmd):
    result = _query(run_cmd, "SELECT to_regclass('applications.dossiers') IS NOT NULL;")
    assert result.returncode == 0, result.output
    assert result.output == "t"

    result = _query(run_cmd, "SELECT column_name FROM information_schema.columns "
                             "WHERE table_schema='applications' AND table_name='dossiers' ORDER BY ordinal_position;")
    assert result.returncode == 0, result.output
    for column in ["id", "job_id", "artifact_path", "kind", "created_at"]:
        assert column in result.output, column


def test_t900228_applications_timeline_table_exists_with_foreign_key_to_jobs(run_cmd):
    result = _query(run_cmd, "SELECT to_regclass('applications.timeline') IS NOT NULL;")
    assert result.returncode == 0, result.output
    assert result.output == "t"

    result = _query(run_cmd, "SELECT column_name FROM information_schema.columns "
                             "WHERE table_schema='applications' AND table_name='timeline' ORDER BY ordinal_position;")
    assert result.returncode == 0, result.output
    for column in ["id", "job_id", "event_type", "notes", "created_at"]:
        assert column in result.output, column


def test_t900228_applications_jobs_status_check_constraint_enforces_allowed_stages(run_cmd):
    result = _query(run_cmd, "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c "
                             "JOIN pg_namespace n ON n.oid = c.connamespace "
                             "WHERE n.nspname = 'applications' AND c.conrelid = 'applications.jobs'::regclass "
                             "AND c.contype = 'c';")
    assert result.returncode == 0, result.output
    for stage in ["found", "drafting", "applied", "interviewing", "offered", "rejected", "withdrawn"]:
        assert stage in result.output, stage


def test_t900228_applications_jobs_enforces_unique_company_role_title(run_cmd):
    result = _query(run_cmd, "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c "
                             "JOIN pg_namespace n ON n.oid = c.connamespace "
                             "WHERE n.nspname = 'applications' AND c.conrelid = 'applications.jobs'::regclass "
                             "AND c.contype = 'u';")
    assert result.returncode == 0, result.output
    assert "company" in result.output
    assert "role_title" in result.output
