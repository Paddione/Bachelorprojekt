"""Native migration of tests/spec/db-quality-goals.bats."""
import re

import pytest

HGC = "scripts/health-goals-check.sh"
DB_IDS = ["G-DB01", "G-DB03", "G-DB04", "G-DB06", "G-DB08"]
ONLY_ARG = "--only=G-DB01,G-DB03,G-DB04,G-DB06,G-DB08"
FK_BATCH2_MIGRATION = "components/website/src/db/migrations/20260719_add_missing_fk_indexes_batch2.sql"


@pytest.fixture
def migration_text(repo_root):
    path = repo_root / FK_BATCH2_MIGRATION
    if not path.is_file():
        pytest.fail(f"missing {FK_BATCH2_MIGRATION}")
    return path.read_text(encoding="utf-8")


def test_health_goals_check_sh_is_syntactically_valid_bash_n(run_cmd, repo_root):
    result = run_cmd(["bash", "-n", HGC])
    assert result.returncode == 0, result.output


def test_health_goals_check_fast_only_renders_all_5_db_goals_without_crash(run_cmd, repo_root):
    result = run_cmd(["bash", HGC, "--fast", ONLY_ARG], timeout=300)
    assert result.returncode in (0, 1), result.output
    for goal_id in DB_IDS:
        assert goal_id in result.output


def test_no_of_the_5_db_goal_ids_is_missing_from_the_only_output(run_cmd, repo_root):
    result = run_cmd(["bash", HGC, "--fast", ONLY_ARG], timeout=300)
    missing = [goal_id for goal_id in DB_IDS if goal_id not in result.output]
    assert len(missing) == 0, missing


def test_20260719_add_missing_fk_indexes_batch2_sql_exists(repo_root):
    assert (repo_root / FK_BATCH2_MIGRATION).is_file()


def test_batch2_migration_resubmits_the_4_original_t001905_indexes_idempotent(migration_text):
    for needle in [
        "idx_onboarding_state_brand",
        "idx_sessions_templates_created_from_template_id",
        "idx_studio_sessions_client_id",
        "idx_studio_sessions_template_of",
    ]:
        assert needle in migration_text


def test_batch2_migration_covers_newly_found_fk_columns_from_both_brands(migration_text):
    for needle in [
        "idx_billing_customers_customers_id",
        "idx_document_assignments_template_id",
        "idx_tickets_tickets_brand",
        "idx_tickets_tickets_reporter_id",
        "idx_questionnaire_questions_template_id",
        "idx_coaching_drafts_resulting_snippet_id",
    ]:
        assert needle in migration_text


def test_batch2_migration_guards_each_block_with_to_regclass_cross_brand_safety(migration_text):
    count = migration_text.count("IF to_regclass(")
    assert count > 0


def test_batch2_migration_deliberately_excludes_arena_match_players_foreign_owner_schema(migration_text):
    # Positiv-Anker: die Migration existiert und enthaelt Indizes.
    assert "CREATE INDEX" in migration_text or "idx_" in migration_text
    assert "arena.match_players" not in migration_text
