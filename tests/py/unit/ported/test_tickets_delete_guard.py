"""Native migration of tests/unit/tickets-delete-guard.bats."""
import re
from pathlib import Path

import pytest

MIGRATION_REL = "scripts/migrations/2026-08-23-tickets-delete-guard-audit.sql"
PLANNING_OFFICE_REL = "components/website/src/lib/planning-office.ts"


@pytest.fixture
def migration(repo_root) -> str:
    path = repo_root / MIGRATION_REL
    assert path.is_file(), f"missing {MIGRATION_REL}"
    return path.read_text(encoding="utf-8")


def _guard_fn_text(text: str) -> str:
    """Emulate awk '/fn_tickets_guard_delete\\(\\)/,/^\\\\$\\\\$/': the end pattern never
    matches, so the range runs from the function header to end of file."""
    lines = text.splitlines(keepends=True)
    for idx, line in enumerate(lines):
        if re.search(r"fn_tickets_guard_delete\(\)", line):
            return "".join(lines[idx:])
    return ""


def test_t015009_migrationsdatei_existiert(repo_root):
    assert (repo_root / MIGRATION_REL).is_file()


def test_t015009_delete_audit_tabelle_ohne_fk_angelegt_muss_cascade_ueberleben(migration):
    marker = "CREATE TABLE IF NOT EXISTS tickets.ticket_delete_audit"
    assert marker in migration
    # Kein FOREIGN KEY / REFERENCES in der Tabellendefinition (grep -A8 | grep -qi references).
    lines = migration.splitlines()
    idx = next(i for i, line in enumerate(lines) if marker in line)
    window = "\n".join(lines[idx : idx + 9])
    assert not re.search(r"references", window, re.IGNORECASE)


def test_t015009_before_delete_audit_trigger_schreibt_snapshot_vor_der_loeschung(migration):
    assert "BEFORE DELETE ON tickets.tickets" in migration
    assert "fn_ticket_delete_audit" in migration
    assert "to_jsonb(OLD)" in migration


def test_t015009_guard_blockiert_non_test_data_ohne_freigabe_flag(migration):
    assert "fn_tickets_guard_delete" in migration
    assert "app.allow_ticket_hard_delete" in migration
    assert "RAISE EXCEPTION" in migration


def test_t015009_guard_laesst_is_test_data_true_immer_durch_purge_pfade_intakt(migration):
    guard_fn = _guard_fn_text(migration)
    assert "IF OLD.is_test_data THEN" in guard_fn


def test_t015009_fn_audit_log_trackt_external_id_und_is_test_data_lueckenschluss(migration):
    assert "'external_id','is_test_data'" in migration


def test_t015009_cleanup_ephemeral_gibt_den_guard_transaktionslokal_frei(repo_root):
    src = repo_root / PLANNING_OFFICE_REL
    assert src.is_file()
    text = src.read_text(encoding="utf-8")
    assert "SET LOCAL app.allow_ticket_hard_delete" in text
    # SET LOCAL nur innerhalb BEGIN/COMMIT - sonst leakt das Flag in den Pool.
    assert "BEGIN" in text
    assert "COMMIT" in text
