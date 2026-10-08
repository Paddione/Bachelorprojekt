"""Native migration of scripts/tests/prod-write-guard.bats."""
import re
from pathlib import Path

import pytest


@pytest.fixture
def guard(repo_root: Path) -> Path:
    return repo_root / "scripts" / "prod-write-guard.sh"


@pytest.fixture
def guard_env(monkeypatch):
    monkeypatch.setenv("PROD_WRITE_GUARD_DENYLIST", "mentolder,workspace-korczewski")
    return {"PROD_WRITE_GUARD_DENYLIST": "mentolder,workspace-korczewski"}


def _check(run_cmd, guard, env, ns, sql, *extra):
    return run_cmd(["bash", str(guard), "check", ns, sql, *extra], env=env)


# --- Namespace detection ---

def test_workspace_namespace_allowed_for_writes(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "workspace", "CREATE INDEX idx ON tickets(t_id);")
    assert result.returncode == 0
    assert "not in denylist" in result.output


def test_mentolder_namespace_blocks_ddl(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "CREATE INDEX idx ON tickets(t_id);")
    assert result.returncode == 1
    assert "prod-write-blocked" in result.output
    assert "namespace=mentolder" in result.output


def test_workspace_korczewski_namespace_blocks_dml(run_cmd, guard, guard_env):
    result = _check(
        run_cmd, guard, guard_env, "workspace-korczewski",
        "INSERT INTO tickets (title) VALUES ('test');",
    )
    assert result.returncode == 1
    assert "prod-write-blocked" in result.output


# --- SQL keyword detection ---

def test_select_is_always_allowed(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "SELECT * FROM tickets;")
    assert result.returncode == 0
    assert "read-only" in result.output


def test_create_is_blocked(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "CREATE TABLE foo (id int);")
    assert result.returncode == 1


def test_insert_is_blocked(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "INSERT INTO foo VALUES (1);")
    assert result.returncode == 1


def test_update_is_blocked(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "UPDATE foo SET id = 2;")
    assert result.returncode == 1


def test_delete_is_blocked(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "DELETE FROM foo WHERE id = 1;")
    assert result.returncode == 1


def test_alter_is_blocked(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "ALTER TABLE foo ADD COLUMN bar int;")
    assert result.returncode == 1


def test_drop_is_blocked(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "DROP TABLE foo;")
    assert result.returncode == 1


def test_truncate_is_blocked(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "TRUNCATE foo;")
    assert result.returncode == 1


# --- Override flag ---

def test_override_allows_write_against_prod(run_cmd, guard, guard_env):
    result = _check(
        run_cmd, guard, guard_env, "mentolder", "CREATE INDEX idx ON t(c);", "--confirm-prod-write"
    )
    assert result.returncode == 0
    assert "override" in result.output


def test_override_without_write_keyword_is_still_allowed(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "SELECT 1;", "--confirm-prod-write")
    assert result.returncode == 0


# --- Structured output ---

def test_blocked_output_has_structured_format(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "DROP TABLE foo;")
    assert result.returncode == 1
    assert re.match(r"GUARD: prod-write-blocked namespace=", result.output)


def test_allowed_output_has_structured_format(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "workspace", "SELECT 1;")
    assert result.returncode == 0
    assert re.match(r"GUARD: prod-write-allowed namespace=", result.output)


# --- Edge cases ---

def test_case_insensitive_ddl_detection(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "create index idx on t(c);")
    assert result.returncode == 1


def test_multiline_sql_with_write_keyword(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "SELECT 1;\nCREATE INDEX idx ON t(c);")
    assert result.returncode == 1


def test_empty_sql_is_read_only(run_cmd, guard, guard_env):
    result = _check(run_cmd, guard, guard_env, "mentolder", "")
    assert result.returncode == 0
    assert "empty-sql" in result.output
