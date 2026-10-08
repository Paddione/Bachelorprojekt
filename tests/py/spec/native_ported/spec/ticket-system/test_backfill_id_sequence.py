"""Native migration of tests/spec/ticket-system/backfill-id-sequence.bats."""

import os
import re
from pathlib import Path

import pytest

TESTROW_TITLE = "T002732 backfill-id testrow"
NS = "workspace"


@pytest.fixture
def bf(repo_root, monkeypatch):
    monkeypatch.setenv("TICKET_TEST_DB_OK", "1")
    return {
        "repo": repo_root,
        "scripts": repo_root / "scripts" / "vda" / "ticket",
        "migrations": repo_root / "components" / "website" / "src" / "lib" / "tickets" / "migrations.ts",
        "ctx": os.environ.get("TICKET_CTX", "fleet"),
    }


def _cluster_running(run_cmd, bf):
    return run_cmd(["kubectl", "--context", bf["ctx"], "get", "nodes"]).returncode == 0


def _pgpod(run_cmd, bf):
    res = run_cmd(["kubectl", "get", "pod", "-n", NS, "--context", bf["ctx"],
                   "-l", "app in (shared-db, shared-db-dev)", "--field-selector", "status.phase=Running",
                   "-o", "name"])
    lines = res.stdout.splitlines()
    return lines[0] if lines else ""


def _psql_q(run_cmd, bf, query):
    pod = _pgpod(run_cmd, bf)
    assert pod, "kein shared-db-Pod"
    res = run_cmd(["kubectl", "exec", "-i", pod, "-n", NS, "--context", bf["ctx"], "-c", "postgres", "--",
                   "psql", "-U", "website", "-d", "website", "-qtA", "-v", "ON_ERROR_STOP=1", "-c", query])
    res.check()
    return res.stdout.rstrip("\n")


@pytest.fixture(autouse=True)
def _teardown(bf, run_cmd):
    yield
    if not _cluster_running(run_cmd, bf):
        return
    pod = _pgpod(run_cmd, bf)
    if not pod:
        return
    run_cmd(["kubectl", "exec", "-i", pod, "-n", NS, "--context", bf["ctx"], "-c", "postgres", "--",
             "psql", "-U", "website", "-d", "website", "-qtA",
             "-c", f"DELETE FROM tickets.tickets WHERE title = '{TESTROW_TITLE}';"])


def test_t002732_every_nextval_tickets_in_ticket_scripts_is_created_by_migrations_ts(bf):
    migrations = bf["migrations"]
    assert migrations.is_file()
    refs = set()
    pattern = re.compile(r"nextval\('tickets\.([a-z_]+)'\)")
    for path in bf["scripts"].rglob("*"):
        if path.is_file():
            refs.update(pattern.findall(path.read_text(encoding="utf-8", errors="ignore")))
    # POSITIV-ANKER (T002356-M1): ohne diesen Check waere der Test vakuos.
    assert refs
    text = migrations.read_text(encoding="utf-8")
    # Zweiter Positiv-Anker: die kanonische Sequenz MUSS in der Migration stehen.
    assert re.search(r"CREATE SEQUENCE IF NOT EXISTS tickets\.external_id_seq", text)
    missing = []
    for seq in sorted(refs):
        if not re.search(rf"CREATE SEQUENCE( IF NOT EXISTS)? tickets\.{re.escape(seq)}\b", text):
            missing.append(seq)
    assert not missing, f"Sequenzen referenziert, aber nicht in migrations.ts angelegt: {' '.join(missing)}"


def test_t002732_backfill_id_assigns_an_external_id_to_a_row_that_lacks_one(bf, run_cmd):
    if not _cluster_running(run_cmd, bf):
        pytest.skip(f"cluster {bf['ctx']} not reachable")
    uuid = _psql_q(run_cmd, bf,
                   "INSERT INTO tickets.tickets (type, brand, title) "
                   f"VALUES ('task', 'mentolder', '{TESTROW_TITLE}') RETURNING id;")
    assert uuid
    _psql_q(run_cmd, bf, f"UPDATE tickets.tickets SET external_id = NULL WHERE id = '{uuid}';")
    before = _psql_q(run_cmd, bf, "SELECT count(*) FROM tickets.tickets WHERE external_id IS NULL;")
    assert int(before) >= 1

    res = run_cmd(["bash", str(bf["repo"] / "scripts" / "ticket.sh"), "backfill-id", "--brand", "mentolder"])
    assert res.returncode == 0, res.output

    # POSITIV-ANKER: die tatsaechlich vergebene ID.
    assigned = _psql_q(run_cmd, bf, f"SELECT coalesce(external_id, '') FROM tickets.tickets WHERE id = '{uuid}';")
    assert re.fullmatch(r"T[0-9]{6}", assigned), assigned
    # Und sie muss aus external_id_seq stammen, also <= dem aktuellen Stand liegen.
    seqval = int(_psql_q(run_cmd, bf, "SELECT last_value FROM tickets.external_id_seq;"))
    assert int(assigned[1:]) <= seqval

    _psql_q(run_cmd, bf, f"DELETE FROM tickets.tickets WHERE id = '{uuid}';")


def test_t002732_backfill_id_reports_the_number_of_rows_it_updated(bf, run_cmd):
    if not _cluster_running(run_cmd, bf):
        pytest.skip(f"cluster {bf['ctx']} not reachable")
    uuid = _psql_q(run_cmd, bf,
                   "INSERT INTO tickets.tickets (type, brand, title) "
                   f"VALUES ('task', 'mentolder', '{TESTROW_TITLE}') RETURNING id;")
    assert uuid
    _psql_q(run_cmd, bf, f"UPDATE tickets.tickets SET external_id = NULL WHERE id = '{uuid}';")

    res = run_cmd(["bash", str(bf["repo"] / "scripts" / "ticket.sh"), "backfill-id", "--brand", "mentolder"])
    assert res.returncode == 0, res.output
    # Auf den Zeilenanfang verankert.
    assert sum(1 for l in res.output.splitlines() if re.match(r"^backfill-id: [0-9]+ Zeile", l)) >= 1

    _psql_q(run_cmd, bf, f"DELETE FROM tickets.tickets WHERE id = '{uuid}';")


def test_t002732_an_empty_backfill_id_run_says_so_instead_of_staying_silent(bf, run_cmd):
    if not _cluster_running(run_cmd, bf):
        pytest.skip(f"cluster {bf['ctx']} not reachable")
    remaining = _psql_q(run_cmd, bf, "SELECT count(*) FROM tickets.tickets WHERE external_id IS NULL;")
    if remaining != "0":
        pytest.skip(f"genuine rows without external_id present ({remaining}) — not this test's subject")

    res = run_cmd(["bash", str(bf["repo"] / "scripts" / "ticket.sh"), "backfill-id", "--brand", "mentolder"])
    assert res.returncode == 0, res.output
    assert sum(1 for l in res.output.splitlines() if re.match(r"^backfill-id: 0 Zeilen ohne external_id", l)) >= 1
