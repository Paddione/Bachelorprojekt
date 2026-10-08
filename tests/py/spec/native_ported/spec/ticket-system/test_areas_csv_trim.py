"""Native migration of tests/spec/ticket-system/areas-csv-trim.bats."""

import os
import subprocess

import pytest

NS = "workspace"
TESTROW_TITLE = "T004894 areas-csv-trim testrow"


@pytest.fixture
def ctx(repo_root, monkeypatch):
    # [T900250] CTX spiegelt die Kontext-Aufloesung von scripts/ticket.sh (TICKET_CTX:-fleet).
    context = os.environ.get("TICKET_CTX", "fleet")
    # [T002871] Opt-in: biegt den T002224-Guard in _ticket-core.sh auf den Dev-Kontext.
    monkeypatch.setenv("TICKET_TEST_DB_OK", "1")
    return {"repo": repo_root, "ctx": context}


def _kubectl(run_cmd, args, **kw):
    return run_cmd(["kubectl", *args], **kw)


def _cluster_running(run_cmd, ctx):
    return run_cmd(["kubectl", "--context", ctx["ctx"], "get", "nodes"]).returncode == 0


def _pgpod(run_cmd, ctx):
    res = run_cmd(["kubectl", "get", "pod", "-n", NS, "--context", ctx["ctx"],
                   "-l", "app in (shared-db, shared-db-dev)",
                   "--field-selector", "status.phase=Running", "-o", "name"])
    lines = res.stdout.splitlines()
    return lines[0] if lines and res.returncode == 0 else ""


def _psql_q(run_cmd, ctx, query):
    pod = _pgpod(run_cmd, ctx)
    if not pod:
        return None
    res = run_cmd(["kubectl", "exec", "-i", pod, "-n", NS, "--context", ctx["ctx"], "-c", "postgres", "--",
                   "psql", "-U", "website", "-d", "website", "-qtA", "-v", "ON_ERROR_STOP=1", "-c", query])
    res.check()
    return res.stdout.rstrip("\n")


@pytest.fixture(autouse=True)
def _teardown(ctx, run_cmd):
    yield
    _teardown_row(ctx, run_cmd)


def _teardown_row(ctx, run_cmd):
    # Sicherheitsnetz: raeumt die praeparierte Zeile auch bei fehlgeschlagenem Test ab.
    if not _cluster_running(run_cmd, ctx):
        return
    pod = _pgpod(run_cmd, ctx)
    if not pod:
        return
    run_cmd(["kubectl", "exec", "-i", pod, "-n", NS, "--context", ctx["ctx"], "-c", "postgres", "--",
             "psql", "-U", "website", "-d", "website", "-qtA",
             "-c", f"DELETE FROM tickets.tickets WHERE title = '{TESTROW_TITLE}';"])


def _ext_id(out):
    return "\n".join(line.split("|")[0] for line in out.splitlines())


def test_t004894_plan_meta_set_trims_comma_separated_areas_items(ctx, run_cmd):
    if not _cluster_running(run_cmd, ctx):
        pytest.skip(f"k3d-Cluster nicht erreichbar ({ctx['ctx']})")
    repo = ctx["repo"]
    res = run_cmd(["bash", str(repo / "scripts" / "ticket.sh"), "create",
                   "--type", "fix", "--brand", "mentolder",
                   "--title", TESTROW_TITLE, "--description", "T004894 testrow",
                   "--status", "triage", "--severity", "trivial", "--priority", "niedrig"])
    out = res.output
    assert res.returncode == 0, f"create fehlgeschlagen: {out}"
    ext_id = _ext_id(out)
    assert ext_id, f"keine external_id: {out}"

    res = run_cmd(["bash", str(repo / "scripts" / "ticket.sh"), "plan-meta", "set",
                   "--id", ext_id, "--areas", "tickets, db"])
    assert res.returncode == 0, f"plan-meta fehlgeschlagen: {res.output}"

    stored = _psql_q(run_cmd, ctx, f"SELECT areas::text FROM tickets.tickets WHERE external_id = '{ext_id}';")
    print(f"gespeichert: {stored}")
    assert stored == "{tickets,db}"


def test_t004894_create_trims_comma_separated_areas_items(ctx, run_cmd):
    if not _cluster_running(run_cmd, ctx):
        pytest.skip(f"k3d-Cluster nicht erreichbar ({ctx['ctx']})")
    repo = ctx["repo"]
    res = run_cmd(["bash", str(repo / "scripts" / "ticket.sh"), "create",
                   "--type", "fix", "--brand", "mentolder",
                   "--title", TESTROW_TITLE, "--description", "T004894 testrow",
                   "--areas", "tickets, db", "--status", "triage", "--severity", "trivial",
                   "--priority", "niedrig"])
    assert res.returncode == 0, f"create fehlgeschlagen: {res.output}"
    ext_id = _ext_id(res.output)
    assert ext_id, f"keine external_id: {res.output}"

    stored = _psql_q(run_cmd, ctx, f"SELECT areas::text FROM tickets.tickets WHERE external_id = '{ext_id}';")
    print(f"gespeichert: {stored}")
    assert stored == "{tickets,db}"


def test_t900250_teardown_actually_deletes_the_testrow_from_the_db_ticket_sh_wrote_to(ctx, run_cmd):
    real_ctx = os.environ.get("TICKET_CTX", "fleet")
    if run_cmd(["kubectl", "--context", real_ctx, "get", "nodes"]).returncode != 0:
        pytest.skip(f"k3d-Cluster nicht erreichbar ({real_ctx})")
    repo = ctx["repo"]
    res = run_cmd(["bash", str(repo / "scripts" / "ticket.sh"), "create",
                   "--type", "fix", "--brand", "mentolder",
                   "--title", TESTROW_TITLE, "--description", "T900250 teardown-anchor testrow",
                   "--status", "triage", "--severity", "trivial", "--priority", "niedrig", "--is-test-data"])
    assert res.returncode == 0, f"create fehlgeschlagen: {res.output}"
    ext_id = _ext_id(res.output)
    assert ext_id, f"keine external_id: {res.output}"

    # Teardown vorziehen statt auf den impliziten Aufruf danach zu warten.
    _teardown_row(ctx, run_cmd)

    # POSITIV-ANKER (T900250): Abfrage gegen den Kontext, in den ticket.sh tatsaechlich schreibt.
    pod_res = run_cmd(["kubectl", "get", "pod", "-n", NS, "--context", real_ctx,
                       "-l", "app in (shared-db, shared-db-dev)",
                       "--field-selector", "status.phase=Running", "-o", "name"])
    pods = pod_res.stdout.splitlines()
    pod = pods[0] if pods else ""
    assert pod, f"kein shared-db-Pod in Kontext {real_ctx}"
    res = run_cmd(["kubectl", "exec", "-i", pod, "-n", NS, "--context", real_ctx, "-c", "postgres", "--",
                   "psql", "-U", "website", "-d", "website", "-qtA", "-v", "ON_ERROR_STOP=1",
                   "-c", f"SELECT count(*) FROM tickets.tickets WHERE title = '{TESTROW_TITLE}';"])
    res.check()
    remaining = res.stdout.rstrip("\n")
    print(f"verbleibend in {real_ctx}: {remaining}")
    assert remaining == "0"
