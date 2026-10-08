"""Native migration of tests/spec/application-pipeline/ingest-cli.bats."""

import os
import random
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


@pytest.fixture
def ingest_ctx(run_cmd):
    _skip_if_no_db(run_cmd)
    run_id = f"test-{os.getpid()}-{random.randint(0, 32767)}"
    ctx = {
        "company": f"TestCorp-{run_id}",
        "role": "Senior DevOps Engineer",
    }
    yield ctx
    if ctx.get("company"):
        try:
            _query(run_cmd, f"DELETE FROM applications.jobs WHERE company = '{ctx['company']}';")
        except Exception:
            pass


def _ingest_script(repo_root):
    return repo_root / "scripts/vda/apply/ingest.sh"


def test_t900228_ingest_sh_exists_and_is_executable(repo_root):
    script = _ingest_script(repo_root)
    assert script.is_file()
    assert os.access(script, os.X_OK)


def test_t900228_ingest_sh_ingests_job_posting_from_file_into_applications_jobs(repo_root, run_cmd, tmp_path, ingest_ctx):
    script = _ingest_script(repo_root)
    if not script.exists():
        pytest.skip("ingest.sh does not exist yet")

    company = ingest_ctx["company"]
    role = ingest_ctx["role"]
    job_file = tmp_path / "posting.txt"
    job_file.write_text(
        f"{role} @ {company}\n"
        "Requirements: Kubernetes, PostgreSQL, Linux, Docker, FluxCD.\n"
        "We are looking for an experienced DevOps specialist to lead our fleet operations.\n"
        "Apply at https://example.com/jobs/123\n",
        encoding="utf-8",
    )

    result = run_cmd(["bash", str(script), "--file", str(job_file)])
    assert result.returncode == 0, result.output

    result = _query(run_cmd, f"SELECT status FROM applications.jobs WHERE company='{company}' AND role_title='{role}';")
    assert result.returncode == 0, result.output
    assert result.output == "found"

    result = _query(run_cmd, f"SELECT count(*) FROM applications.jobs WHERE company='{company}';")
    assert result.returncode == 0, result.output
    assert result.output == "1"


def test_t900228_ingest_sh_handles_duplicate_company_and_role_cleanly_without_raw_sql_error(repo_root, run_cmd, tmp_path, ingest_ctx):
    script = _ingest_script(repo_root)
    if not script.exists():
        pytest.skip("ingest.sh does not exist yet")

    company = ingest_ctx["company"]
    role = ingest_ctx["role"]
    job_file = tmp_path / "posting_dup.txt"
    job_file.write_text(
        f"{role} @ {company}\n"
        "Requirements: Kubernetes, PostgreSQL.\n"
        "Initial posting description.\n",
        encoding="utf-8",
    )

    first = run_cmd(["bash", str(script), "--file", str(job_file)])
    assert first.returncode == 0, first.output

    second = run_cmd(["bash", str(script), "--file", str(job_file)])
    assert second.returncode == 0, second.output
    assert "Duplicate" in second.output or "already ingested" in second.output

    result = _query(run_cmd, f"SELECT count(*) FROM applications.jobs WHERE company='{company}' AND role_title='{role}';")
    assert result.returncode == 0, result.output
    assert result.output == "1"
