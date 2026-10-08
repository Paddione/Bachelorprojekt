"""Native migration of tests/unit/qa-dal.bats."""
import os
import shutil
import subprocess

import pytest

APPROVE_CRITERIA = (
    "[{key:'spec_match',passed:true},{key:'no_regression',passed:true},"
    "{key:'responsive',passed:true},{key:'performance',passed:true},{key:'copy',passed:true}]"
)
REJECT_CRITERIA = (
    "[{key:'spec_match',passed:false},{key:'no_regression',passed:true},"
    "{key:'responsive',passed:true},{key:'performance',passed:true},{key:'copy',passed:true}]"
)


def _node_create_review(repo_root, ticket_id: str, body: str) -> subprocess.CompletedProcess:
    script = (
        "const { createQaReview } = require('./components/website/src/lib/qa-dal');\n"
        "createQaReview({\n"
        f"  ticketId: '{ticket_id}',\n"
        f"{body}\n"
        "}).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); })\n"
    )
    return subprocess.run(
        ["node", "-e", script],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        timeout=300,
    )


@pytest.fixture
def ticket(repo_root):
    """Insert a QA ticket (setup) and delete it again (teardown)."""
    if shutil.which("psql") is None:
        pytest.skip("psql is not installed")
    if shutil.which("node") is None:
        pytest.skip("node is not installed")
    db_url = os.environ.get("DATABASE_URL", "")
    probe = subprocess.run(
        ["psql", db_url, "-c", "SELECT 1"],
        capture_output=True,
        text=True,
        timeout=300,
    )
    if probe.returncode != 0:
        pytest.skip("keine DB verfügbar (offline)")

    insert = subprocess.run(
        [
            "psql",
            db_url,
            "-t",
            "-A",
            "-c",
            "\n    INSERT INTO tickets.tickets (title, status, is_test_data)\n"
            "    VALUES ('QS-DAL-Test', 'qa_review', true)\n    RETURNING id\n  ",
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert insert.returncode == 0, insert.stderr
    ticket_id = insert.stdout.strip()

    yield ticket_id

    if ticket_id:
        subprocess.run(
            [
                "psql",
                db_url,
                "-c",
                f"\n    DELETE FROM tickets.tickets WHERE id = '{ticket_id}'\n  ",
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )


def _psql_query(sql: str) -> str:
    result = subprocess.run(
        ["psql", os.environ.get("DATABASE_URL", ""), "-t", "-A", "-c", sql],
        capture_output=True,
        text=True,
        timeout=300,
    )
    return result.stdout.strip()


def test_fa_qs_07_approve_setzt_status_done_und_done_at(repo_root, ticket):
    """FA-QS-07 approve setzt status=done und done_at"""
    body = f"  criteria: {APPROVE_CRITERIA},\n  verdict: 'approved'"
    node = _node_create_review(repo_root, ticket, body)
    assert node.returncode == 0, node.stderr

    row = _psql_query(f"SELECT status, done_at IS NOT NULL FROM tickets.tickets WHERE id='{ticket}'")
    assert row == "done|t"


def test_fa_qs_08_reject_setzt_status_in_progress_und_legt_ticket_injections_an(repo_root, ticket):
    """FA-QS-08 reject setzt status=in_progress und legt ticket_injections an"""
    body = (
        f"  criteria: {REJECT_CRITERIA},\n"
        "  notes: 'Spec nicht erfüllt',\n"
        "  verdict: 'rejected',\n"
        "  re_entry_phase: 'implement'"
    )
    node = _node_create_review(repo_root, ticket, body)
    assert node.returncode == 0, node.stderr

    status = _psql_query(f"SELECT status FROM tickets.tickets WHERE id='{ticket}'")
    assert status == "in_progress"
    injection = _psql_query(
        "SELECT COUNT(*) FROM tickets.ticket_injections "
        f"WHERE ticket_id='{ticket}' AND kind='note'"
    )
    assert injection == "1"
