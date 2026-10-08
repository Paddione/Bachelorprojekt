"""Native migration of tests/unit/tickets-transition.bats."""
import json
import os
import shlex
import shutil
from pathlib import Path

import pytest

DEFAULT_PGURL = "postgres://postgres:postgres@localhost:5432/website"
TICKET_ID = "33333333-3333-3333-3333-333333333333"
MISSING_ID = "00000000-0000-0000-0000-000000000000"


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
def transition_ts(repo_root: Path) -> Path:
    return repo_root / "components" / "website" / "src" / "lib" / "tickets" / "transition.ts"


@pytest.fixture
def ts_source(transition_ts: Path) -> str:
    return transition_ts.read_text(encoding="utf-8")


def _db_available(run_cmd, pgurl: str) -> bool:
    if shutil.which("psql") is None:
        return False
    return run_cmd(["psql", pgurl, "-c", "SELECT 1"]).returncode == 0


def _psql_statements(run_cmd, pgurl: str, statements: list):
    """Run statements one by one, mirroring psql reading a heredoc (errors are not fatal)."""
    for stmt in statements:
        run_cmd(["psql", pgurl, "-c", stmt], timeout=300)


def _psql_scalar(run_cmd, pgurl: str, sql: str) -> str:
    return run_cmd(["psql", pgurl, "-t", "-A", "-c", sql]).stdout.strip()


def _require_db(run_cmd, pgurl: str):
    if not _db_available(run_cmd, pgurl):
        pytest.skip("No database available (set TRACKING_DB_URL)")
    if shutil.which(_tsx_cmd()[0]) is None:
        pytest.skip(f"{_tsx_cmd()[0]} not installed (TSX_BIN)")


def _require_tsx():
    if shutil.which(_tsx_cmd()[0]) is None:
        pytest.skip(f"{_tsx_cmd()[0]} not installed (TSX_BIN)")


def _tsx(run_cmd, pgurl: str, transition_ts: Path, body: str):
    """Run `npx tsx -e` with the transition module imported; the BATS original fails on non-zero exit."""
    code = (
        f"import {{ transitionTicket }} from '{transition_ts}';\n" + body
    )
    result = run_cmd([*_tsx_cmd(), "-e", code], env={"SESSIONS_DATABASE_URL": pgurl}, timeout=300)
    assert result.returncode == 0, result.output
    return result


def _ordered_contains(text: str, first: str, second: str) -> bool:
    idx = text.find(first)
    return idx >= 0 and text.find(second, idx + len(first)) >= 0


def _seed_ticket(run_cmd, pgurl: str, status: str = "triage"):
    _psql_statements(run_cmd, pgurl, [
        f"DELETE FROM tickets.ticket_links  WHERE from_id = '{TICKET_ID}'",
        f"DELETE FROM tickets.ticket_comments WHERE ticket_id = '{TICKET_ID}'",
        f"DELETE FROM tickets.ticket_activity WHERE ticket_id = '{TICKET_ID}'",
        f"DELETE FROM tickets.tickets WHERE id = '{TICKET_ID}'",
        "INSERT INTO tickets.tickets (id, type, brand, title, status, reporter_email, external_id) "
        f"VALUES ('{TICKET_ID}', 'bug', 'mentolder', 'Transition Test', '{status}', "
        "'rep-test@example.com', 'BR-19990101-0001')",
    ])


@pytest.fixture(autouse=True)
def _teardown(run_cmd, pgurl):
    """Teardown: Fixture-Zeilen des Tickets entfernen, wenn die DB erreichbar ist."""
    yield
    if _db_available(run_cmd, pgurl):
        _psql_statements(run_cmd, pgurl, [
            f"DELETE FROM tickets.ticket_links  WHERE from_id = '{TICKET_ID}'",
            f"DELETE FROM tickets.ticket_comments WHERE ticket_id = '{TICKET_ID}'",
            f"DELETE FROM tickets.ticket_activity WHERE ticket_id = '{TICKET_ID}'",
            f"DELETE FROM tickets.tickets WHERE id = '{TICKET_ID}'",
        ])


# -- Static checks (no DB required) -----------------------------------------

def test_static_transition_ts_file_exists(transition_ts):
    assert transition_ts.is_file()


def test_static_exports_transition_ticket(ts_source):
    assert "export async function transitionTicket" in ts_source


def test_static_exports_ticket_status_type(ts_source):
    assert "export type { TicketStatus }" in ts_source


def test_static_exports_ticket_resolution_type(ts_source):
    assert "export type TicketResolution" in ts_source


def test_static_exports_transition_result_interface(ts_source):
    assert "export interface TransitionResult" in ts_source


def test_static_rejects_done_without_resolution_at_validation_level(ts_source):
    assert "requires a resolution" in ts_source


def test_static_uses_pool_connect_not_bare_pool_query_for_transaction(ts_source):
    assert "pool.connect()" in ts_source


def test_static_begin_commit_rollback_transaction_flow_present(ts_source):
    assert "BEGIN" in ts_source
    assert "COMMIT" in ts_source
    assert "ROLLBACK" in ts_source


def test_static_sets_app_user_label_session_config(ts_source):
    assert "app.user_label" in ts_source


def test_static_sets_app_user_id_session_config(ts_source):
    assert "app.user_id" in ts_source


def test_static_calls_link_reporter_by_email_before_send_bug_close_email(ts_source):
    lines = ts_source.splitlines()
    link_line = next((i + 1 for i, l in enumerate(lines) if "await linkReporterByEmail" in l), None)
    close_line = next((i + 1 for i, l in enumerate(lines) if "await sendBugCloseEmail" in l), None)
    assert link_line is not None, "await linkReporterByEmail not found"
    assert close_line is not None, "await sendBugCloseEmail not found"
    assert link_line < close_line


def test_static_email_only_sent_when_note_visibility_is_public_public_note_guard(ts_source):
    assert "noteVisibility === 'public'" in ts_source


def test_static_becoming_done_guard_checks_before_status_not_done(ts_source):
    assert "before.status !== 'done'" in ts_source


# -- Runtime: validation errors (no DB needed) ------------------------------

def test_runtime_rejects_unknown_status(run_cmd, pgurl, transition_ts):
    _require_tsx()
    result = _tsx(run_cmd, pgurl, transition_ts,
                  f"transitionTicket('{MISSING_ID}', {{ status: 'banana' as any, actor: {{ label: 'test' }} }})"
                  ".then(() => console.log('OK'))\n"
                  ".catch(e => console.log('ERR:' + e.message));\n")
    assert _ordered_contains(result.output, "ERR:", "invalid status"), result.output


def test_runtime_rejects_done_without_resolution(run_cmd, pgurl, transition_ts):
    _require_tsx()
    result = _tsx(run_cmd, pgurl, transition_ts,
                  f"transitionTicket('{MISSING_ID}', {{ status: 'done', actor: {{ label: 'test' }} }})"
                  ".then(() => console.log('OK'))\n"
                  ".catch(e => console.log('ERR:' + e.message));\n")
    assert _ordered_contains(result.output, "ERR:", "resolution"), result.output


def test_runtime_rejects_archived_without_resolution(run_cmd, pgurl, transition_ts):
    _require_tsx()
    result = _tsx(run_cmd, pgurl, transition_ts,
                  f"transitionTicket('{MISSING_ID}', {{ status: 'archived', actor: {{ label: 'test' }} }})"
                  ".then(() => console.log('OK'))\n"
                  ".catch(e => console.log('ERR:' + e.message));\n")
    assert _ordered_contains(result.output, "ERR:", "resolution"), result.output


def test_runtime_rejects_unknown_resolution(run_cmd, pgurl, transition_ts):
    _require_tsx()
    result = _tsx(run_cmd, pgurl, transition_ts,
                  f"transitionTicket('{MISSING_ID}', {{ status: 'done', resolution: 'banana' as any, actor: {{ label: 'test' }} }})"
                  ".then(() => console.log('OK'))\n"
                  ".catch(e => console.log('ERR:' + e.message));\n")
    assert _ordered_contains(result.output, "ERR:", "invalid resolution"), result.output


# -- Runtime: DB-required tests ---------------------------------------------

def test_runtime_triage_to_done_sets_resolution_and_done_at(run_cmd, pgurl, transition_ts):
    _require_db(run_cmd, pgurl)
    _seed_ticket(run_cmd, pgurl, "triage")

    _tsx(run_cmd, pgurl, transition_ts,
         f"transitionTicket('{TICKET_ID}', {{ status: 'done', resolution: 'fixed', actor: {{ label: 'test' }} }})"
         ".then(r => { console.log(JSON.stringify(r)); process.exit(0); })\n"
         ".catch(e => { console.error(e.message); process.exit(1); });\n")

    result = _psql_scalar(run_cmd, pgurl,
                          "SELECT status||','||resolution||','||CASE WHEN done_at IS NULL THEN 'null' ELSE 'set' END "
                          f"FROM tickets.tickets WHERE id='{TICKET_ID}'")
    assert result == "done,fixed,set"


def test_runtime_triage_to_backlog_to_in_progress_sets_started_at(run_cmd, pgurl, transition_ts):
    _require_db(run_cmd, pgurl)
    _seed_ticket(run_cmd, pgurl, "backlog")

    _tsx(run_cmd, pgurl, transition_ts,
         f"transitionTicket('{TICKET_ID}', {{ status: 'in_progress', actor: {{ label: 'test' }} }})"
         ".then(() => process.exit(0))\n"
         ".catch(e => { console.error(e.message); process.exit(1); });\n")

    result = _psql_scalar(run_cmd, pgurl,
                          "SELECT CASE WHEN started_at IS NULL THEN 'null' ELSE 'set' END "
                          f"FROM tickets.tickets WHERE id='{TICKET_ID}'")
    assert result == "set"


def test_runtime_note_is_inserted_as_status_change_comment(run_cmd, pgurl, transition_ts):
    _require_db(run_cmd, pgurl)
    _seed_ticket(run_cmd, pgurl, "triage")

    _tsx(run_cmd, pgurl, transition_ts,
         f"transitionTicket('{TICKET_ID}', {{\n"
         "  status: 'done',\n"
         "  resolution: 'fixed',\n"
         "  note: 'shipped in v1.2',\n"
         "  noteVisibility: 'internal',\n"
         "  actor: { label: 'admin' }\n"
         "}).then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });\n")

    count = _psql_scalar(run_cmd, pgurl,
                         "SELECT COUNT(*) FROM tickets.ticket_comments "
                         f"WHERE ticket_id='{TICKET_ID}' AND kind='status_change' AND body='shipped in v1.2'")
    assert count == "1"


def test_runtime_pr_number_creates_ticket_links_row(run_cmd, pgurl, transition_ts):
    _require_db(run_cmd, pgurl)
    _seed_ticket(run_cmd, pgurl, "in_review")

    _tsx(run_cmd, pgurl, transition_ts,
         f"transitionTicket('{TICKET_ID}', {{\n"
         "  status: 'done',\n"
         "  resolution: 'shipped',\n"
         "  prNumber: 42,\n"
         "  actor: { label: 'ci' }\n"
         "}).then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });\n")

    count = _psql_scalar(run_cmd, pgurl,
                         "SELECT COUNT(*) FROM tickets.ticket_links "
                         f"WHERE from_id='{TICKET_ID}' AND kind='fixes' AND pr_number=42")
    assert count == "1"


def test_runtime_pr_number_link_is_idempotent_second_call_is_no_op(run_cmd, pgurl, transition_ts):
    _require_db(run_cmd, pgurl)
    _seed_ticket(run_cmd, pgurl, "in_review")

    for _ in range(2):
        _tsx(run_cmd, pgurl, transition_ts,
             f"transitionTicket('{TICKET_ID}', {{\n"
             "  status: 'done',\n"
             "  resolution: 'shipped',\n"
             "  prNumber: 99,\n"
             "  actor: { label: 'ci' }\n"
             "}).then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });\n")

    count = _psql_scalar(run_cmd, pgurl,
                         "SELECT COUNT(*) FROM tickets.ticket_links "
                         f"WHERE from_id='{TICKET_ID}' AND kind='fixes' AND pr_number=99")
    assert count == "1"


def test_runtime_ticket_not_found_throws_error(run_cmd, pgurl, transition_ts):
    _require_db(run_cmd, pgurl)

    result = _tsx(run_cmd, pgurl, transition_ts,
                  "transitionTicket('ffffffff-ffff-ffff-ffff-ffffffffffff', { status: 'backlog', actor: { label: 'test' } })"
                  ".then(() => console.log('OK'))\n"
                  ".catch(e => console.log('ERR:' + e.message));\n")
    assert _ordered_contains(result.output, "ERR:", "not found"), result.output


def test_runtime_audit_log_entry_created_on_transition(run_cmd, pgurl, transition_ts):
    _require_db(run_cmd, pgurl)
    _seed_ticket(run_cmd, pgurl, "triage")

    _tsx(run_cmd, pgurl, transition_ts,
         f"transitionTicket('{TICKET_ID}', {{\n"
         "  status: 'backlog',\n"
         "  actor: { label: 'reviewer' }\n"
         "}).then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });\n")

    count = _psql_scalar(run_cmd, pgurl,
                         "SELECT COUNT(*) FROM tickets.ticket_activity "
                         f"WHERE ticket_id='{TICKET_ID}' AND field='_updated'")
    assert int(count) >= 1


def test_runtime_transition_result_shape_is_correct(run_cmd, pgurl, transition_ts):
    _require_db(run_cmd, pgurl)
    _seed_ticket(run_cmd, pgurl, "triage")

    result = _tsx(run_cmd, pgurl, transition_ts,
                  f"transitionTicket('{TICKET_ID}', {{ status: 'done', resolution: 'wontfix', actor: {{ label: 'test' }} }})"
                  ".then(r => console.log(JSON.stringify(r)))\n"
                  ".catch(e => { console.error(e.message); process.exit(1); });\n")

    r = json.loads(result.output)
    for key in ("id", "externalId", "type", "status", "resolution", "emailSent"):
        assert key in r, f"missing {key}"
    assert r["status"] == "done", f"expected done, got {r['status']}"
    assert r["resolution"] == "wontfix", f"expected wontfix, got {r['resolution']}"
