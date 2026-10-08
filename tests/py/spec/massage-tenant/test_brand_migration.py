"""Massage-Tenant (T901440): Brand-Migration — auditierter Scope + Runner.

Root-Migration und Website-Mirror muessen semantisch identisch genau die
fuenf auditierten CHECKs auf massage erweitern; billing_* bleibt un Veraendert.
"""
import os
import re
import subprocess
from pathlib import Path

import pytest


AUDITED_TABLES = [
    "free_time_windows",
    "legal_pages",
    "site_settings",
    "homepage_block_documents",
    "homepage_block_versions",
]
ALLOWED_BRANDS = {"mentolder", "korczewski", "massage"}
BILLING_TABLES = [
    "billing_customers",
    "billing_invoices",
    "invoice_counters",
    "leistungen_config",
    "service_config",
]
ROOT_MIGRATION = "migrations/20261008-massage-brand-checks.sql"
WEBSITE_MIGRATION = "components/website/src/db/migrations/20261008_massage_brand_checks.sql"


def _read(repo_root: Path, rel: str) -> str:
    path = repo_root / rel
    assert path.is_file(), f"Migration fehlt: {rel}"
    return path.read_text(encoding="utf-8")


def test_both_migration_files_exist(repo_root: Path):
    for rel in (ROOT_MIGRATION, WEBSITE_MIGRATION):
        assert (repo_root / rel).is_file(), f"Migration fehlt: {rel}"


def test_migrations_extend_exactly_the_audited_checks(repo_root: Path):
    for rel in (ROOT_MIGRATION, WEBSITE_MIGRATION):
        text = _read(repo_root, rel)
        for table in AUDITED_TABLES:
            assert f"chk_brand_{table}" in text, f"{rel}: CHECK fuer {table} fehlt"
            assert "to_regclass" in text, f"{rel}: kein to_regclass-Guard"
        # Alle drei Brands in den neuen CHECKs
        for brand in ALLOWED_BRANDS:
            assert f"'{brand}'" in text, f"{rel}: Brand {brand} fehlt"
        # Unbekannte Brands duerfen nicht auftauchen (nur CHECK-Literale werten)
        checks = re.findall(r"CHECK\s*\(\s*brand\s+IN\s*\(([^)]+)\)", text)
        assert checks, f"{rel}: keine CHECK (brand IN ...) gefunden"
        for check in checks:
            found = set(re.findall(r"'([a-z]+)'", check))
            assert found <= ALLOWED_BRANDS, f"{rel}: unerwartete Brands {found}"


def test_migrations_do_not_touch_billing_checks(repo_root: Path):
    for rel in (ROOT_MIGRATION, WEBSITE_MIGRATION):
        text = _read(repo_root, rel)
        for table in BILLING_TABLES:
            assert f"chk_brand_{table}" not in text, (
                f"{rel}: billing-CHECK {table} darf nicht angefasst werden"
            )


def test_migrations_semantically_identical(repo_root: Path):
    def normalize(text: str) -> set:
        tables = set(re.findall(r"chk_brand_([a-z_]+)", text))
        brands = set(re.findall(r"'(mentolder|korczewski|massage)'", text))
        return tables, brands

    root_tables, root_brands = normalize(_read(repo_root, ROOT_MIGRATION))
    web_tables, web_brands = normalize(_read(repo_root, WEBSITE_MIGRATION))
    assert root_tables == web_tables == set(AUDITED_TABLES), (
        f"Paritaet verletzt: root={root_tables} website={web_tables}"
    )
    assert root_brands == web_brands == ALLOWED_BRANDS


def test_migrations_registered_in_runners(repo_root: Path):
    # Root-Runner liest migrations/ (Factory), Website-Runner src/db/migrations/
    assert (repo_root / "scripts" / "migrate-db.mjs").is_file()
    website_migrate = repo_root / "components" / "website" / "src" / "db" / "migrate.ts"
    assert website_migrate.is_file()
    text = website_migrate.read_text(encoding="utf-8")
    assert "migrations" in text


def test_migration_sql_parses_as_plpgsql_guards(repo_root: Path):
    for rel in (ROOT_MIGRATION, WEBSITE_MIGRATION):
        text = _read(repo_root, rel)
        assert text.count("to_regclass(") >= len(AUDITED_TABLES), (
            f"{rel}: jede Tabelle braucht to_regclass-Guard"
        )
        assert "ALTER TABLE" in text and "ADD CONSTRAINT" in text


@pytest.mark.skipif(
    not os.environ.get("MASSAGE_TEST_DATABASE_URL"),
    reason="keine Test-DB gesetzt (MASSAGE_TEST_DATABASE_URL fehlt) — nur mit expliziter Test-DB",
)
def test_brand_checks_against_real_postgres(repo_root: Path):
    import shutil

    assert shutil.which("psql"), "psql fehlt"
    db_url = os.environ["MASSAGE_TEST_DATABASE_URL"]
    assert "massage" in db_url or "test" in db_url, "sieht nicht wie eine Test-DB aus"
    for rel in (ROOT_MIGRATION, WEBSITE_MIGRATION):
        res = subprocess.run(
            ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-f", str(repo_root / rel)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert res.returncode == 0, f"{rel} auf Test-DB fehlgeschlagen: {res.stderr}"
        # Idempotenz: zweiter Lauf
        res2 = subprocess.run(
            ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-f", str(repo_root / rel)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert res2.returncode == 0, f"{rel} zweiter Lauf fehlgeschlagen: {res2.stderr}"
