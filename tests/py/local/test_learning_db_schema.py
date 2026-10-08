"""Native migration of tests/local/learning-db-schema.bats.

Live test: needs kubectl access to the shared-db pod. Skips when the cluster or the pod is unavailable.
"""
import os
import shutil
import subprocess

import pytest

DO_INSERT_CHECK = """
    DO $$ BEGIN
      INSERT INTO learning_progress (keycloak_user_id, brand, item_type, item_id, status)
      VALUES ('test-user', 'mentolder', 'invalid_type', 'test-id', 'todo');
    EXCEPTION WHEN check_violation THEN
      RETURN;
    END $$
"""

DO_STATUS_CHECK = """
    DO $$ BEGIN
      INSERT INTO learning_progress (keycloak_user_id, brand, item_type, item_id, status)
      VALUES ('test-user', 'mentolder', 'goal', 'test-id', 'invalid_status');
    EXCEPTION WHEN check_violation THEN
      RETURN;
    END $$
"""

DO_UNIQUE_LEARNING = """
    DO $$ BEGIN
      INSERT INTO learning_progress (keycloak_user_id, brand, item_type, item_id, status) VALUES ('u1', 'mentolder', 'goal', 'g1', 'todo');
      INSERT INTO learning_progress (keycloak_user_id, brand, item_type, item_id, status) VALUES ('u1', 'mentolder', 'goal', 'g1', 'done');
    EXCEPTION WHEN unique_violation THEN
      RETURN;
    END $$
"""

DO_UNIQUE_ONBOARDING = """
    DO $$ BEGIN
      INSERT INTO onboarding_state (keycloak_user_id, brand, step_id) VALUES ('u1', 'mentolder', 's1');
      INSERT INTO onboarding_state (keycloak_user_id, brand, step_id) VALUES ('u1', 'mentolder', 's1');
    EXCEPTION WHEN unique_violation THEN
      RETURN;
    END $$
"""


@pytest.fixture(scope="module")
def shared_db_pod():
    """Resolve the running shared-db pod once; skip the module when the cluster is unreachable."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not available")
    ctx = os.environ.get("WORKSPACE_CTX", "devc")
    ns = os.environ.get("WORKSPACE_NS", "workspace-dev")
    result = subprocess.run(["kubectl", "get", "pod", "-n", ns, "--context", ctx,
                             "-l", "app in (shared-db, shared-db-dev)",
                             "--field-selector", "status.phase=Running", "-o", "name"],
                            capture_output=True, text=True, timeout=300)
    pods = result.stdout.strip().splitlines()
    if not pods:
        pytest.skip("shared-db pod not reachable")
    return {"pod": pods[0], "ns": ns, "ctx": ctx}


@pytest.fixture
def psql_website(run_cmd, shared_db_pod):
    def _query(query: str):
        return run_cmd(["kubectl", "exec", shared_db_pod["pod"], "-n", shared_db_pod["ns"],
                        "--context", shared_db_pod["ctx"], "-c", "postgres", "--",
                        "psql", "-U", "website", "-d", "website", "-t", "-A", "-c", query], timeout=300)
    return _query


def test_lr_01_learning_progress_table_exists(psql_website):
    """LR-01: learning_progress table exists"""
    result = psql_website("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='learning_progress'")
    assert result.returncode == 0
    assert result.output == "learning_progress"


def test_lr_02_learning_progress_has_keycloak_user_id_column(psql_website):
    """LR-02: learning_progress has keycloak_user_id column"""
    result = psql_website("SELECT column_name, is_nullable FROM information_schema.columns "
                          "WHERE table_schema='public' AND table_name='learning_progress' "
                          "AND column_name='keycloak_user_id'")
    assert result.returncode == 0
    assert "keycloak_user_id" in result.output
    assert "NO" in result.output


def test_lr_03_learning_progress_has_brand_column(psql_website):
    """LR-03: learning_progress has brand column"""
    result = psql_website("SELECT column_name FROM information_schema.columns "
                          "WHERE table_schema='public' AND table_name='learning_progress' AND column_name='brand'")
    assert result.returncode == 0
    assert result.output == "brand"


def test_lr_04_learning_progress_has_item_type_column(psql_website):
    """LR-04: learning_progress has item_type column"""
    result = psql_website("SELECT column_name FROM information_schema.columns "
                          "WHERE table_schema='public' AND table_name='learning_progress' "
                          "AND column_name='item_type'")
    assert result.returncode == 0
    assert result.output == "item_type"


def test_lr_05_learning_progress_item_type_check_constraint_enforces_goal_tool(psql_website):
    """LR-05: learning_progress.item_type CHECK constraint enforces ('goal','tool')"""
    result = psql_website(DO_INSERT_CHECK)
    assert result.returncode == 0


def test_lr_06_learning_progress_has_status_column(psql_website):
    """LR-06: learning_progress has status column"""
    result = psql_website("SELECT column_default FROM information_schema.columns "
                          "WHERE table_schema='public' AND table_name='learning_progress' AND column_name='status'")
    assert result.returncode == 0
    assert "todo" in result.output


def test_lr_07_learning_progress_status_check_constraint_enforces_todo_in_progress_done(psql_website):
    """LR-07: learning_progress.status CHECK constraint enforces ('todo','in_progress','done')"""
    result = psql_website(DO_STATUS_CHECK)
    assert result.returncode == 0


def test_lr_08_learning_progress_has_note_started_at_completed_at_updated_at_columns(psql_website):
    """LR-08: learning_progress has note, started_at, completed_at, updated_at columns"""
    result = psql_website("SELECT COUNT(*) FROM information_schema.columns "
                          "WHERE table_schema='public' AND table_name='learning_progress' "
                          "AND column_name IN ('note','started_at','completed_at','updated_at')")
    assert result.returncode == 0
    assert result.output == "4"


def test_lr_09_learning_progress_unique_constraint(psql_website):
    """LR-09: learning_progress UNIQUE constraint"""
    result = psql_website(DO_UNIQUE_LEARNING)
    assert result.returncode == 0


def test_lr_10_idx_learning_progress_admin_agg_index_exists(psql_website):
    """LR-10: idx_learning_progress_admin_agg index exists"""
    result = psql_website("SELECT indexname FROM pg_indexes WHERE schemaname='public' "
                          "AND indexname='idx_learning_progress_admin_agg'")
    assert result.returncode == 0
    assert result.output == "idx_learning_progress_admin_agg"


def test_lr_11_idx_learning_progress_updated_index_exists(psql_website):
    """LR-11: idx_learning_progress_updated index exists"""
    result = psql_website("SELECT indexname FROM pg_indexes WHERE schemaname='public' "
                          "AND indexname='idx_learning_progress_updated'")
    assert result.returncode == 0
    assert result.output == "idx_learning_progress_updated"


def test_lr_12_onboarding_state_table_exists(psql_website):
    """LR-12: onboarding_state table exists"""
    result = psql_website("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='onboarding_state'")
    assert result.returncode == 0
    assert result.output == "onboarding_state"


def test_lr_13_onboarding_state_has_keycloak_user_id_brand_step_id_completed_at_columns(psql_website):
    """LR-13: onboarding_state has keycloak_user_id, brand, step_id, completed_at columns"""
    result = psql_website("SELECT COUNT(*) FROM information_schema.columns "
                          "WHERE table_schema='public' AND table_name='onboarding_state' "
                          "AND column_name IN ('keycloak_user_id','brand','step_id','completed_at')")
    assert result.returncode == 0
    assert result.output == "4"


def test_lr_14_onboarding_state_unique_constraint(psql_website):
    """LR-14: onboarding_state UNIQUE constraint"""
    result = psql_website(DO_UNIQUE_ONBOARDING)
    assert result.returncode == 0
