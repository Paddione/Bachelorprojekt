"""Native migration of tests/unit/tickets-reporter-link.bats."""
import random
import shlex
import shutil
import os
from pathlib import Path

import pytest

DEFAULT_PGURL = "postgres://postgres:postgres@localhost:5432/website"
CUSTOMER_IDS = [
    "11111111-1111-1111-1111-111111111111",
    "33333333-3333-3333-3333-333333333333",
    "55555555-5555-5555-5555-555555555555",
]
TICKET_IDS = [
    "22222222-2222-2222-2222-222222222222",
    "44444444-4444-4444-4444-444444444444",
    "66666666-6666-6666-6666-666666666666",
]


def _tsx_cmd() -> list:
    return shlex.split(os.environ.get("TSX_BIN", "npx tsx"))


@pytest.fixture
def pgurl() -> str:
    url = os.environ.get("TRACKING_DB_URL") or os.environ.get("SESSIONS_DATABASE_URL") or DEFAULT_PGURL
    # Sicherheits-Guard aus setup(): nie gegen Produktions-Datenbanken laufen.
    assert "mentolder" not in url and "korczewski" not in url, (
        f"TRACKING_DB_URL points to a production host ({url}). Aborting to protect live data."
    )
    return url


@pytest.fixture
def reporter_source(repo_root: Path) -> Path:
    return repo_root / "components" / "website" / "src" / "lib" / "tickets" / "reporter-link.ts"


def _db_available(run_cmd, pgurl: str) -> bool:
    if shutil.which("psql") is None:
        return False
    return run_cmd(["psql", pgurl, "-c", "SELECT 1"]).returncode == 0


def _psql_statements(run_cmd, pgurl: str, statements: list):
    """Run statements one by one, mirroring psql reading a heredoc (errors are not fatal)."""
    for stmt in statements:
        run_cmd(["psql", pgurl, "-c", stmt], timeout=300)


@pytest.fixture(autouse=True)
def _fixture_cleanup(run_cmd, pgurl):
    """Teardown: fixture customer and ticket rows left behind by runtime tests."""
    yield
    if _db_available(run_cmd, pgurl):
        _psql_statements(run_cmd, pgurl, [
            "DELETE FROM customers WHERE id IN (" + ", ".join(f"'{i}'" for i in CUSTOMER_IDS) + ")",
            "DELETE FROM tickets.tickets WHERE id IN (" + ", ".join(f"'{i}'" for i in TICKET_IDS) + ")",
        ])


def _require_db(run_cmd, pgurl: str):
    if not _db_available(run_cmd, pgurl):
        pytest.skip("No database available (set TRACKING_DB_URL)")
    if shutil.which(_tsx_cmd()[0]) is None:
        pytest.skip(f"{_tsx_cmd()[0]} not installed (TSX_BIN)")


def _tsx_eval(run_cmd, pgurl: str, code: str):
    return run_cmd([*_tsx_cmd(), "-e", code], env={"SESSIONS_DATABASE_URL": pgurl}, timeout=300)


def _import_line(fn: str, reporter_source: Path) -> str:
    return f"import {{ {fn} }} from '{reporter_source}';"


# -- Static checks (no DB required) ----------------------------------------

def test_reporter_link_ts_file_exists(reporter_source):
    assert reporter_source.is_file()


def test_reporter_link_ts_exports_link_reporter_by_email(reporter_source):
    assert "export async function linkReporterByEmail" in reporter_source.read_text(encoding="utf-8")


def test_reporter_link_ts_exports_link_all_reporters(reporter_source):
    assert "export async function linkAllReporters" in reporter_source.read_text(encoding="utf-8")


def test_link_reporter_by_email_uses_parameterized_query_no_string_interpolation(reporter_source):
    # Ensure SQL uses $1 placeholder, not template literals, for the email value.
    assert "$1" in reporter_source.read_text(encoding="utf-8")


def test_both_functions_check_reporter_id_is_null_idempotency_guard(reporter_source):
    count = sum(1 for line in reporter_source.read_text(encoding="utf-8").splitlines()
                if "t.reporter_id IS NULL" in line)
    assert count == 2, f"expected 2 matching lines, got {count}"


def test_both_functions_filter_on_keycloak_user_id_is_not_null(reporter_source):
    count = sum(1 for line in reporter_source.read_text(encoding="utf-8").splitlines()
                if "keycloak_user_id IS NOT NULL" in line)
    assert count == 2, f"expected 2 matching lines, got {count}"


# -- Runtime tests (require live DB) ----------------------------------------

def test_link_reporter_by_email_sets_reporter_id_when_email_matches_keycloak_linked_customer(
        run_cmd, pgurl, reporter_source):
    _require_db(run_cmd, pgurl)

    _psql_statements(run_cmd, pgurl, [
        "INSERT INTO customers (id, name, email, keycloak_user_id) "
        "VALUES ('11111111-1111-1111-1111-111111111111', 'Test User', 'link-test@example.com', 'kc-1') "
        "ON CONFLICT (email) DO UPDATE SET keycloak_user_id = EXCLUDED.keycloak_user_id",
        "DELETE FROM tickets.tickets WHERE id = '22222222-2222-2222-2222-222222222222'",
        "INSERT INTO tickets.tickets (id, type, brand, title, reporter_email) "
        "VALUES ('22222222-2222-2222-2222-222222222222', 'bug', 'mentolder', 'T', 'link-test@example.com')",
    ])

    code = _import_line("linkReporterByEmail", reporter_source) + (
        " linkReporterByEmail('link-test@example.com').then(() => process.exit(0));"
    )
    _tsx_eval(run_cmd, pgurl, code)

    result = run_cmd(["psql", pgurl, "-t", "-A", "-c",
                      "SELECT reporter_id::text FROM tickets.tickets WHERE id='22222222-2222-2222-2222-222222222222'"])
    assert result.stdout.strip() == "11111111-1111-1111-1111-111111111111"

    run_cmd(["psql", pgurl, "-c", "DELETE FROM tickets.tickets WHERE id='22222222-2222-2222-2222-222222222222'"])


def test_link_reporter_by_email_returns_0_when_email_matches_no_customer(run_cmd, pgurl, reporter_source):
    _require_db(run_cmd, pgurl)

    code = _import_line("linkReporterByEmail", reporter_source) + (
        f" linkReporterByEmail('does-not-exist-{random.randint(0, 32767)}@example.com')"
        ".then(n => { console.log(n); process.exit(0); });"
    )
    result = _tsx_eval(run_cmd, pgurl, code)
    assert result.stdout.strip() == "0"


def test_link_all_reporters_links_unlinked_tickets_in_batch(run_cmd, pgurl, reporter_source):
    _require_db(run_cmd, pgurl)

    _psql_statements(run_cmd, pgurl, [
        "INSERT INTO customers (id, name, email, keycloak_user_id) "
        "VALUES ('33333333-3333-3333-3333-333333333333', 'Batch User', 'batch-test@example.com', 'kc-batch') "
        "ON CONFLICT (email) DO UPDATE SET keycloak_user_id = EXCLUDED.keycloak_user_id",
        "DELETE FROM tickets.tickets WHERE id = '44444444-4444-4444-4444-444444444444'",
        "INSERT INTO tickets.tickets (id, type, brand, title, reporter_email) "
        "VALUES ('44444444-4444-4444-4444-444444444444', 'bug', 'mentolder', 'Batch T', 'batch-test@example.com')",
    ])

    code = _import_line("linkAllReporters", reporter_source) + (
        " linkAllReporters().then(n => { console.log(n); process.exit(0); });"
    )
    result = _tsx_eval(run_cmd, pgurl, code)
    linked = result.stdout.strip()
    # At least one row must have been linked
    assert linked.lstrip("-").isdigit() and int(linked) >= 1, f"linked={linked!r}"

    check = run_cmd(["psql", pgurl, "-t", "-A", "-c",
                     "SELECT reporter_id::text FROM tickets.tickets WHERE id='44444444-4444-4444-4444-444444444444'"])
    assert check.stdout.strip() == "33333333-3333-3333-3333-333333333333"

    run_cmd(["psql", pgurl, "-c", "DELETE FROM tickets.tickets WHERE id='44444444-4444-4444-4444-444444444444'"])


def test_link_reporter_by_email_is_idempotent_second_call_returns_0(run_cmd, pgurl, reporter_source):
    _require_db(run_cmd, pgurl)

    _psql_statements(run_cmd, pgurl, [
        "INSERT INTO customers (id, name, email, keycloak_user_id) "
        "VALUES ('55555555-5555-5555-5555-555555555555', 'Idem User', 'idem-test@example.com', 'kc-idem') "
        "ON CONFLICT (email) DO UPDATE SET keycloak_user_id = EXCLUDED.keycloak_user_id",
        "DELETE FROM tickets.tickets WHERE id = '66666666-6666-6666-6666-666666666666'",
        "INSERT INTO tickets.tickets (id, type, brand, title, reporter_email) "
        "VALUES ('66666666-6666-6666-6666-666666666666', 'bug', 'mentolder', 'Idem T', 'idem-test@example.com')",
    ])

    # First call links the row
    first_code = _import_line("linkReporterByEmail", reporter_source) + (
        " linkReporterByEmail('idem-test@example.com').then(() => process.exit(0));"
    )
    _tsx_eval(run_cmd, pgurl, first_code)

    # Second call must return 0 (already linked, reporter_id IS NULL guard fires)
    second_code = _import_line("linkReporterByEmail", reporter_source) + (
        " linkReporterByEmail('idem-test@example.com').then(n => { console.log(n); process.exit(0); });"
    )
    second = _tsx_eval(run_cmd, pgurl, second_code)
    assert second.stdout.strip() == "0"

    run_cmd(["psql", pgurl, "-c", "DELETE FROM tickets.tickets WHERE id='66666666-6666-6666-6666-666666666666'"])
