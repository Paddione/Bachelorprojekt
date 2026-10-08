"""Native migration of tests/spec/basic-invoices.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    web = repo_root / "components" / "website" / "src"
    return {
        "lib": web / "lib" / "invoices.ts",
        "migration": web / "db" / "migrations" / "20261008_invoices.sql",
        "list": web / "pages" / "owner" / "rechnungen.astro",
        "detail": web / "pages" / "owner" / "rechnungen" / "[id].astro",
        "erstellen": web / "pages" / "api" / "owner" / "rechnungen" / "erstellen.ts",
        "status": web / "pages" / "api" / "owner" / "rechnungen" / "[id]" / "zahlungsstatus.ts",
        "korrigieren": web / "pages" / "api" / "owner" / "rechnungen" / "[id]" / "korrigieren.ts",
        "export": web / "pages" / "api" / "owner" / "rechnungen" / "export.ts",
    }


def _require(path: Path) -> str:
    assert path.is_file(), f"missing file: {path}"
    return path.read_text(encoding="utf-8")


def _first_line(text: str, needle: str) -> int:
    for idx, line in enumerate(text.splitlines(), start=1):
        if needle in line:
            return idx
    return 0


def test_t901027_1_all_rechnungen_routes_reference_owner_guard(paths):
    """T901027-1: all rechnungen routes reference the owner guard (requireOwner)"""
    for key in ("list", "detail", "erstellen", "status", "korrigieren", "export"):
        text = _require(paths[key])
        assert re.search(r"owner-guard|requireOwner|isOwnerSession", text), (
            f"owner guard missing from {paths[key]}"
        )


def test_t901027_2_migration_enforces_per_year_uniqueness_and_lib_formats_numbers(paths):
    """T901027-2: migration enforces per-year uniqueness and lib formats numbers"""
    migration = _require(paths["migration"])
    lib = _require(paths["lib"])
    unique_lines = [line for line in migration.splitlines() if "UNIQUE" in line]
    assert "UNIQUE" in migration, "UNIQUE constraint missing from migration"
    assert any("invoice_year" in line for line in unique_lines), "year column missing from UNIQUE"
    assert any("invoice_number" in line for line in unique_lines), "number column missing from UNIQUE"

    def_line = _first_line(lib, "function formatInvoiceNumber")
    assert def_line, "formatInvoiceNumber definition missing from invoices.ts"
    use_line = 0
    for idx, line in enumerate(lib.splitlines(), start=1):
        if "formatInvoiceNumber(" in line and "function formatInvoiceNumber" not in line:
            use_line = idx
            break
    assert use_line, "formatInvoiceNumber call missing from invoices.ts"
    assert def_line < use_line, "formatInvoiceNumber must be defined before its call in invoices.ts"


def test_t901027_3_erstellen_dedupes_per_booking_before_inserting(paths):
    """T901027-3: erstellen.ts dedupes per booking before inserting (409)"""
    text = _require(paths["erstellen"])
    assert "status: 409" in text, "409 response missing from erstellen.ts"
    lines = text.splitlines()
    guard = next((i for i, l in enumerate(lines, 1) if "findInvoiceByAppointmentToken(" in l), 0)
    insert = next((i for i, l in enumerate(lines, 1) if "createInvoice(" in l), 0)
    assert guard, "dedupe lookup (findInvoiceByAppointmentToken) missing from erstellen.ts"
    assert insert, "createInvoice call missing from erstellen.ts"
    assert guard < insert, "dedupe lookup must precede createInvoice in erstellen.ts"


def test_t901027_4_invoices_snapshot_carries_mandatory_fields(paths):
    """T901027-4: invoices.ts snapshot carries number, date, service, amount, tax"""
    text = _require(paths["lib"])
    assert "formatInvoiceNumber" in text, "invoice number builder missing from invoices.ts"
    assert "issueDate" in text, "issueDate missing from invoices.ts"
    assert "serviceName" in text, "serviceName missing from invoices.ts"
    assert "unitPriceCents" in text, "unitPriceCents missing from invoices.ts"
    assert re.search(r"taxNote|KLEINUNTERNEHMER", text), "tax note / Kleinunternehmer hint missing"


def test_t901027_5_no_online_payment_path_and_manual_statuses_only(paths):
    """T901027-5: no online-payment path in invoice files, manual statuses only"""
    files = [paths[k] for k in (
        "lib", "migration", "list", "detail", "erstellen", "status", "korrigieren", "export",
    )]
    for f in files:
        _require(f)
    pattern = re.compile(r"stripe|paypal|checkout|payment-intent|zahlungslink", re.IGNORECASE)
    hits = []
    for f in files:
        for line in f.read_text(encoding="utf-8").splitlines():
            if pattern.search(line):
                hits.append(f"{f.name}: {line.strip()}")
    assert not hits, f"online-payment reference found: {hits}"
    status = _require(paths["status"])
    for token in ("'bezahlt'", "'offen'", "'storniert'", "'sepa'"):
        assert token in status, f"{token} missing from zahlungsstatus.ts"
