"""Native migration of tests/spec/workspace-staging-db-tables.bats."""

# (T900819)

import re

import pytest


@pytest.fixture
def paths(repo_root):
    web = repo_root / "components" / "website" / "src"
    return {
        "schema": repo_root / "k3d" / "website-schema.yaml",
        "migrations": repo_root / "components" / "website" / "src" / "db" / "migrations",
        "dunning": web / "pages/api/admin/billing/dunning/run.ts",
        "monthly": web / "pages/api/admin/billing/create-monthly-invoices.ts",
    }


def _has(path, pattern):
    return re.search(pattern, path.read_text(encoding="utf-8")) is not None


def test_ensure_skripte_decken_public_admin_actions_idempotent_ab(paths):
    assert _has(paths["schema"], r"CREATE TABLE IF NOT EXISTS (public\.)?admin_actions"), \
        f"kein admin_actions-Ensure in {paths['schema']}"


def test_ensure_skripte_decken_error_log_idempotent_ab(paths):
    assert _has(paths["schema"], r"CREATE TABLE IF NOT EXISTS (public\.)?error_log"), \
        f"kein error_log-Ensure in {paths['schema']}"


def test_dunning_run_faengt_db_fehler_strukturiert_ab(paths):
    assert _has(paths["dunning"], r"catch"), f"kein catch in {paths['dunning']}"


def test_create_monthly_invoices_antwortet_bei_db_fehlern_strukturiert_500_log(paths):
    assert _has(paths["monthly"], r"status: 500"), f"kein strukturierter 500-Pfad in {paths['monthly']}"


def test_anker_messages_und_knowledge_collections_bleiben_ensure_abgedeckt(paths):
    assert _has(paths["schema"], r"CREATE TABLE IF NOT EXISTS messages"), "messages-Ensure verloren"
    assert _has(paths["schema"], r"CREATE TABLE IF NOT EXISTS knowledge\.collections"), "collections-Ensure verloren"


def test_anker_admin_actions_und_error_log_migrationen_existieren(paths):
    assert (paths["migrations"] / "20260525_admin_actions.sql").is_file(), "admin_actions-Migration fehlt"
    assert (paths["migrations"] / "20260703_create_error_log.sql").is_file(), "error_log-Migration fehlt"
