"""Native migration of tests/unit/ticket-external-id-sequence.bats."""
import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    base = repo_root / "components" / "website" / "src" / "lib"
    return {
        "tschema": base / "tickets-schema.ts",
        "tmig": base / "tickets" / "migrations.ts",
    }


def test_fn_assign_external_id_allocates_from_global_sequence_nextval(paths):
    assert re.search(r"nextval\('tickets\.external_id_seq'\)", paths["tmig"].read_text(encoding="utf-8"))


def test_tickets_schema_still_calls_apply_legacy_migrations_pool(paths):
    assert re.search(r"applyLegacyMigrations\([ \t\r\f\v]*pool[ \t\r\f\v]*\)", paths["tschema"].read_text(encoding="utf-8"))


def test_fn_assign_external_id_does_not_allocate_from_per_brand_ticket_counters(paths):
    # The trigger must not derive the id from the per-brand counter table.
    text = paths["tmig"].read_text(encoding="utf-8")
    assert "ON CONFLICT (brand) DO UPDATE SET last_value" not in text


def test_external_id_sequence_is_seeded_to_current_global_max_on_init(paths):
    assert re.search(r"setval\('tickets\.external_id_seq'", paths["tmig"].read_text(encoding="utf-8"))


def test_external_id_sequence_reseed_is_monotonic_never_regresses_last_value(paths):
    text = paths["tmig"].read_text(encoding="utf-8")
    assert "GREATEST(" in text
    assert re.search(r"last_value FROM tickets\.external_id_seq", text)
