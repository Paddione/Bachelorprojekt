"""Native migration of tests/spec/database.bats."""
# The BATS file skips every test unconditionally in setup(). The autouse
# fixture below keeps that behaviour; the bodies are ported so they run again

# once the skip is lifted.

import os
import re
import shutil

import pytest

SKIP_REASON = "database.bats skipped to bypass live cluster migration mismatch"
PLAN_MIGRATION = "scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql"


@pytest.fixture(autouse=True)
def _bats_setup_skip():
    pytest.skip(SKIP_REASON)


@pytest.fixture
def kube_env():
    return {
        "ns": os.environ.get("WORKSPACE_NS", "workspace"),
        "ctx": os.environ.get("WORKSPACE_CTX", "fleet"),
    }


def _skip_if_no_db(run_cmd, kube):
    if shutil.which("kubectl") is None:
        pytest.skip("no Running shared-db pod reachable (offline/CI)")
    res = run_cmd(
        ["kubectl", "get", "pod", "-n", kube["ns"], "--context", kube["ctx"],
         "-l", "app in (shared-db,shared-db-dev)", "--field-selector", "status.phase=Running",
         "-o", "name"]
    )
    pods = [line for line in res.stdout.splitlines() if line.strip()]
    if not pods:
        pytest.skip("no Running shared-db pod reachable (offline/CI)")
    return pods[0]


def _psql_db(run_cmd, kube, sql: str) -> str:
    pod = _skip_if_no_db(run_cmd, kube)
    res = run_cmd(
        ["kubectl", "exec", "-i", pod, "-n", kube["ns"], "--context", kube["ctx"],
         "-c", "postgres", "--", "psql", "-U", "website", "-d", "website",
         "-qtA", "-v", "ON_ERROR_STOP=1", "-c", sql]
    )
    return res.stdout.strip()


def _skip_if_no_cluster(run_cmd, kube):
    if shutil.which("kubectl") is None:
        pytest.skip("no live cluster reachable (kubectl get nodes failed)")
    res = run_cmd(["kubectl", "get", "nodes", "--context", kube["ctx"], "--request-timeout=3s"])
    if res.returncode != 0:
        pytest.skip("no live cluster reachable (kubectl get nodes failed)")


def test_plan_2026_07_09_phase2_drop_migration_exists_and_is_idempotent(repo_root):
    path = repo_root / PLAN_MIGRATION
    assert path.is_file()
    text = path.read_text(encoding="utf-8")
    assert "DROP TABLE IF EXISTS coaching.ki_config_id_map" in text
    assert "DROP TABLE IF EXISTS coaching.ki_config" in text
    assert "BEGIN" in text
    assert "COMMIT" in text
    assert not re.search(r"ALTER TABLE +coaching\.sessions", text, re.IGNORECASE)
    assert not re.search(r"DROP CONSTRAINT +sessions_ki_config_id_fkey", text, re.IGNORECASE)


def test_db_coaching_ki_config_does_not_exist_phase2_applied(run_cmd, kube_env):
    assert _psql_db(run_cmd, kube_env, "SELECT to_regclass('coaching.ki_config') IS NULL") == "t"


def test_db_coaching_ki_config_id_map_does_not_exist_phase2_applied(run_cmd, kube_env):
    assert _psql_db(run_cmd, kube_env, "SELECT to_regclass('coaching.ki_config_id_map') IS NULL") == "t"


def test_db_coaching_sessions_ki_config_id_column_is_preserved(run_cmd, kube_env):
    sql = ("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='coaching' "
           "AND table_name='sessions' AND column_name='ki_config_id')")
    assert _psql_db(run_cmd, kube_env, sql) == "t"


def test_db_sessions_ki_config_id_fkey_is_preserved_and_points_to_tickets_provider_config(run_cmd, kube_env):
    sql = ("SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='sessions_ki_config_id_fkey' "
           "AND connamespace='coaching'::regnamespace AND confrelid='tickets.provider_config'::regclass)")
    assert _psql_db(run_cmd, kube_env, sql) == "t"


@pytest.mark.parametrize("kind,name", [
    ("deployment", "arena-server"),
    ("service", "arena-server"),
    ("ingressroute.traefik.io", "arena-server"),
])
def test_cluster_workspace_korczewski_has_no_orphaned_arena_server_object(run_cmd, kube_env, kind, name):
    _skip_if_no_cluster(run_cmd, kube_env)
    res = run_cmd(["kubectl", "get", kind, name, "-n", "workspace-korczewski",
                   "--context", kube_env["ctx"], "-o", "name"])
    assert res.returncode != 0
