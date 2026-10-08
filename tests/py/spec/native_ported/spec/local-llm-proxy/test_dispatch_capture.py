"""Native migration of tests/spec/local-llm-proxy/dispatch-capture.bats."""

import os
import shutil
import subprocess

import pytest

MIGRATION = "scripts/migrations/2026-08-10-llm-proxy-request-log.sql"


def _ws_ns():
    return os.environ.get("WORKSPACE_NS", "workspace")


def _ws_ctx():
    return os.environ.get("WORKSPACE_CTX", "fleet")


def _ws_pod(run_cmd, cwd):
    try:
        res = run_cmd([
            "kubectl", "get", "pod", "-n", _ws_ns(), "--context", _ws_ctx(),
            "-l", "app in (shared-db,shared-db-dev)", "--field-selector", "status.phase=Running",
            "-o", "name",
        ], cwd=cwd)
    except Exception:
        return ""
    if res.returncode != 0:
        return ""
    lines = [l for l in res.stdout.splitlines() if l]
    return lines[0] if lines else ""


def _psql(run_cmd, cwd, sql=None, file_path=None):
    pod = _ws_pod(run_cmd, cwd)
    if not pod:
        return None
    base = [
        "kubectl", "exec", "-i", pod, "-n", _ws_ns(), "--context", _ws_ctx(),
        "-c", "postgres", "--", "psql", "-U", "website", "-d", "website",
        "-qtA", "-v", "ON_ERROR_STOP=1",
    ]
    if file_path is not None:
        with open(file_path, "rb") as fh:
            try:
                done = subprocess.run(base, stdin=fh, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                      text=True, timeout=60, cwd=str(cwd))
            except Exception:
                return None
            return done
    return run_cmd(base + ["-c", sql], cwd=cwd)


def _db_available(run_cmd, cwd):
    if shutil.which("kubectl") is None:
        return False
    if not _ws_pod(run_cmd, cwd):
        return False
    res = _psql(run_cmd, cwd, sql="SELECT 1;")
    return res is not None and res.returncode == 0


def test_dispatch_capture_t003277_die_migrationsdatei_existiert(repo_root):
    assert (repo_root / MIGRATION).is_file()


def test_dispatch_capture_t003277_die_migration_legt_die_tabelle_mit_allen_mitschnitt_spalten_an(run_cmd, repo_root):
    if not _db_available(run_cmd, repo_root):
        pytest.skip("keine erreichbare tickets-DB (kein Cluster) — dieser Test misst sonst den Runner")
    _psql(run_cmd, repo_root, file_path=repo_root / MIGRATION)
    res = _psql(
        run_cmd, repo_root,
        sql="SELECT column_name FROM information_schema.columns WHERE table_schema='tickets' "
            "AND table_name='llm_proxy_request_log' ORDER BY column_name;",
    )
    assert res is not None and res.returncode == 0
    cols = set(res.stdout.splitlines())
    for col in ["request_body", "response_body", "stream_incomplete", "truncated", "original_bytes",
                "slot_id", "dispatch_ticket", "dispatch_partial", "streamed"]:
        assert col in cols, f"Spalte fehlt: {col}"


def test_dispatch_capture_t003277_die_migration_ist_wiederholbar_idempotent(run_cmd, repo_root):
    if not _db_available(run_cmd, repo_root):
        pytest.skip("keine erreichbare tickets-DB (kein Cluster)")
    res = _psql(run_cmd, repo_root, file_path=repo_root / MIGRATION)
    assert res is not None and res.returncode == 0


def test_dispatch_capture_t003277_der_notify_trigger_haengt_an_der_tabelle(run_cmd, repo_root):
    if not _db_available(run_cmd, repo_root):
        pytest.skip("keine erreichbare tickets-DB (kein Cluster)")
    res = _psql(
        run_cmd, repo_root,
        sql="SELECT tgname FROM pg_trigger WHERE tgrelid='tickets.llm_proxy_request_log'::regclass AND NOT tgisinternal;",
    )
    assert res is not None and res.returncode == 0
    assert "cockpit_notify_dispatch" in res.stdout


def test_dispatch_capture_t003277_der_aufraeum_task_ist_aufrufbar(run_cmd, repo_root):
    res = run_cmd(["task", "--list"], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "maintenance:ai-log-cleanup" in res.output
    assert "maintenance:dispatch-log-cleanup" in res.output
