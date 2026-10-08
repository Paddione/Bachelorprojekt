"""Native migration of tests/spec/application-pipeline/import-bootstrap.bats."""

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
def _db_guard(run_cmd):
    _skip_if_no_db(run_cmd)
    yield
    try:
        _query(run_cmd, "DELETE FROM applications.jobs WHERE company IN ('TestCo', 'TestCo2');")
    except Exception:
        pass


def _bootstrap_script(repo_root):
    return repo_root / "scripts/vda/apply/import-bootstrap.sh"


def _fixtures_dir(repo_root):
    return repo_root / "tests/fixtures/application-pipeline/bootstrap"


def test_t900228_import_bootstrap_sh_exists_and_is_executable(repo_root):
    script = _bootstrap_script(repo_root)
    assert script.is_file()
    assert os.access(script, os.X_OK)


def test_t900228_import_bootstrap_sh_imports_dossiers_and_creates_timeline_events(repo_root, run_cmd):
    script = _bootstrap_script(repo_root)
    if not script.exists():
        pytest.skip("import-bootstrap.sh does not exist yet")

    result = run_cmd(["bash", str(script), "--dir", str(_fixtures_dir(repo_root)),
                      "--status", "drafting", "--event-at", "2026-09-15"])
    assert result.returncode == 0, result.output

    result = _query(run_cmd, "SELECT status FROM applications.jobs WHERE company='TestCo' AND role_title='Test-Rolle';")
    assert result.returncode == 0, result.output
    assert result.output == "drafting"

    result = _query(run_cmd, "SELECT d.kind, d.artifact_path FROM applications.dossiers d "
                             "JOIN applications.jobs j ON j.id = d.job_id WHERE j.company='TestCo';")
    assert result.returncode == 0, result.output
    assert "cover_letter" in result.output
    assert "Anschreiben_TestCo_Test-Rolle.pdf" in result.output

    result = _query(run_cmd, "SELECT t.event_type, t.created_at::date::text FROM applications.timeline t "
                             "JOIN applications.jobs j ON j.id = t.job_id WHERE j.company='TestCo';")
    assert result.returncode == 0, result.output
    assert "drafting" in result.output
    assert "2026-09-15" in result.output


def test_t900228_import_bootstrap_sh_imports_with_default_now_timeline_event(repo_root, run_cmd):
    script = _bootstrap_script(repo_root)
    if not script.exists():
        pytest.skip("import-bootstrap.sh does not exist yet")

    result = run_cmd(["bash", str(script), "--dir", str(_fixtures_dir(repo_root)), "--status", "drafting"])
    assert result.returncode == 0, result.output

    result = _query(run_cmd, "SELECT t.event_type FROM applications.timeline t "
                             "JOIN applications.jobs j ON j.id = t.job_id WHERE j.company='TestCo';")
    assert result.returncode == 0, result.output
    assert result.output == "drafting"


def test_t900228_import_bootstrap_sh_ignores_duplicate_files_without_errors(repo_root, run_cmd):
    script = _bootstrap_script(repo_root)
    if not script.exists():
        pytest.skip("import-bootstrap.sh does not exist yet")

    args = ["bash", str(script), "--dir", str(_fixtures_dir(repo_root)),
            "--status", "drafting", "--event-at", "2026-09-15"]
    first = run_cmd(args)
    assert first.returncode == 0, first.output

    second = run_cmd(args)
    assert second.returncode == 0, second.output
    assert ("Duplicate" in second.output or "already present" in second.output
            or "skipping" in second.output)

    result = _query(run_cmd, "SELECT count(*) FROM applications.jobs WHERE company='TestCo';")
    assert result.returncode == 0, result.output
    assert result.output == "1"
