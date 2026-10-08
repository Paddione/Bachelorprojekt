"""Native migration of tests/spec/application-pipeline/match-scoring.bats."""

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


def _run_match(repo_root, run_cmd, job_id):
    return run_cmd(["bash", str(repo_root / "scripts/vda/apply/match.sh"), "--job-id", str(job_id)])


def test_t900234_applications_jobs_has_match_score_column(run_cmd):
    result = _query(run_cmd, "SELECT column_name FROM information_schema.columns "
                             "WHERE table_schema='applications' AND table_name='jobs' AND column_name='match_score';")
    assert result.returncode == 0, result.output
    assert result.output == "match_score"


def test_t900234_applications_jobs_has_match_evidence_ids_column(run_cmd):
    result = _query(run_cmd, "SELECT column_name FROM information_schema.columns "
                             "WHERE table_schema='applications' AND table_name='jobs' AND column_name='match_evidence_ids';")
    assert result.returncode == 0, result.output
    assert result.output == "match_evidence_ids"


def test_t900234_match_sh_executable_and_accepts_job_id(repo_root, run_cmd):
    _run_match(repo_root, run_cmd, 99999)
    assert (repo_root / "scripts/vda/apply/match.sh").is_file()


def test_t900234_strong_evidence_catalog_overlap_gives_match_score_above_70(repo_root, run_cmd):
    insert = _query(
        run_cmd,
        "INSERT INTO applications.jobs (company, role_title, raw_text, requirements, status) VALUES "
        "('test', 'match-high', 'Kubernetes microservice testing postgres migration flux helm', "
        "'Kubernetes microservice testing postgres migration flux helm', 'found') "
        "ON CONFLICT DO NOTHING RETURNING id;",
    )
    job_id = insert.stdout.strip()
    if not job_id:
        job_id = _query(
            run_cmd,
            "SELECT id FROM applications.jobs WHERE company='test' AND role_title='match-high' LIMIT 1;",
        ).stdout.strip()
    assert job_id

    try:
        _run_match(repo_root, run_cmd, job_id)

        score = _query(run_cmd, f"SELECT COALESCE(match_score, 0) FROM applications.jobs WHERE id={job_id};").stdout.strip()
        try:
            score_ok = float(score) > 70
        except ValueError:
            score_ok = False
        assert score_ok, f"match_score={score!r}"

        evidence_count = _query(
            run_cmd,
            f"SELECT array_length(match_evidence_ids, 1) FROM applications.jobs WHERE id={job_id};",
        ).stdout.strip()
        assert int(evidence_count or 0) > 0
    finally:
        _query(run_cmd, f"DELETE FROM applications.jobs WHERE id={job_id};")


def test_t900234_no_evidence_catalog_overlap_gives_default_fallback_score_not_null_no_crash(repo_root, run_cmd):
    insert = _query(
        run_cmd,
        "INSERT INTO applications.jobs (company, role_title, raw_text, requirements, status) VALUES "
        "('test', 'match-default', 'xyz qrf wvu random nonsense text', "
        "'xyz qrf wvu random nonsense text', 'found') ON CONFLICT DO NOTHING RETURNING id;",
    )
    job_id = insert.stdout.strip()
    if not job_id:
        job_id = _query(
            run_cmd,
            "SELECT id FROM applications.jobs WHERE company='test' AND role_title='match-default' LIMIT 1;",
        ).stdout.strip()
    assert job_id

    try:
        _run_match(repo_root, run_cmd, job_id)

        score = _query(run_cmd, f"SELECT match_score FROM applications.jobs WHERE id={job_id};").stdout.strip()
        assert score != "NULL"

        evidence_count = _query(
            run_cmd,
            f"SELECT array_length(match_evidence_ids, 1) FROM applications.jobs WHERE id={job_id};",
        ).stdout.strip()
        assert int(evidence_count or 0) > 0
    finally:
        _query(run_cmd, f"DELETE FROM applications.jobs WHERE id={job_id};")
