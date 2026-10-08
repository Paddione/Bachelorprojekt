"""Native migration of tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats."""

import json
import os
import re
import shutil
import socket
import subprocess
import time
from pathlib import Path

import pytest

TOKEN = "test-postgres-token"
DB_URL_DEV = "postgresql://postgres@localhost:15432/website"


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _free_port(start: int, end: int):
    return next((p for p in range(start, end + 1) if not _port_open(p)), None)


class Adapter:
    """Runs scripts/mcp-gateway/mcp-postgres-local.mjs on a port with a given DATABASE_URL."""

    def __init__(self, repo: Path, run_cmd, port: int):
        self.repo = repo
        self.run_cmd = run_cmd
        self.port = port
        self.proc = None

    def start(self, db_url: str) -> None:
        env = os.environ.copy()
        env.update({"MCP_POSTGRES_TOKEN": TOKEN, "DATABASE_URL": db_url, "PORT": str(self.port)})
        self.proc = subprocess.Popen(
            ["node", str(self.repo / "scripts" / "mcp-gateway" / "mcp-postgres-local.mjs")],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(60):
            res = self.run_cmd(
                ["curl", "-s", "-o", "/dev/null", "--max-time", "1", "-X", "POST",
                 "-H", "content-type: application/json", "-H", f"Authorization: Bearer {TOKEN}",
                 "-d", "{}", f"http://127.0.0.1:{self.port}/mcp"]
            )
            if res.returncode == 0:
                return
            time.sleep(0.1)
        self.stop()
        pytest.skip(f"Adapter kam auf Port {self.port} nicht hoch")

    def query_call(self, req_id: int, sql: str) -> str:
        body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": "tools/call",
                           "params": {"name": "query", "arguments": {"sql": sql}}})
        return self.run_cmd(
            ["curl", "-s", "-X", "POST", "-H", "content-type: application/json",
             "-H", f"Authorization: Bearer {TOKEN}", "-d", body,
             f"http://127.0.0.1:{self.port}/mcp"]
        ).stdout

    def stop(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            self.proc.kill()
        if self.proc is not None:
            self.proc.wait()


@pytest.fixture
def adapter_factory(repo_root, run_cmd):
    if shutil.which("node") is None:
        pytest.skip("node nicht verfuegbar")
    if shutil.which("curl") is None:
        pytest.skip("curl nicht verfuegbar")
    adapters = []

    def _make(start: int, end: int) -> Adapter:
        port = _free_port(start, end)
        if port is None:
            pytest.skip(f"kein freier Port im Bereich {start}-{end}")
        adp = Adapter(repo_root, run_cmd, port)
        adapters.append(adp)
        return adp

    yield _make
    for adp in adapters:
        adp.stop()


@pytest.fixture
def psql_tools(run_cmd):
    """psql helper mirroring psql_call: retry up to 10x, 1s apart, until non-empty output."""

    def psql_call(sql: str) -> str:
        out = ""
        for _ in range(10):
            out = run_cmd(["psql", "-X", "-A", "-t", DB_URL_DEV, "-c", sql]).stdout.rstrip("\n")
            if out:
                return out
            time.sleep(1)
        return out

    return psql_call


def test_mcp_postgres_with_cte_und_explain_analyze_delete_scheitern_an_der_readonly_grenze(
    repo_root, adapter_factory, psql_tools, run_cmd
):
    """mcp-postgres: WITH-CTE und EXPLAIN-ANALYZE-DELETE scheitern an der Readonly-Grenze"""
    if not _port_open(15432):
        pytest.skip("lokale k3d-Dev-DB auf :15432 nicht erreichbar")
    if shutil.which("psql") is None:
        pytest.skip("psql nicht verfuegbar")

    try:
        # Scratch-Tabelle (nur diese wird von den Bypass-Versuchen beruehrt).
        psql_tools("DROP TABLE IF EXISTS public.__t006335_ro_probe; CREATE TABLE public.__t006335_ro_probe (probe_id int); INSERT INTO public.__t006335_ro_probe VALUES (1);")
        assert psql_tools("SELECT count(*) FROM public.__t006335_ro_probe") == "1", \
            "FAIL: Scratch-Tabelle nicht initialisiert"

        # Adapter mit Default-Identitaet starten (kein DATABASE_URL-Override).
        adp = adapter_factory(19760, 19790)
        adp.start("")

        # Positiv-Anker zuerst: reines SELECT liefert weiterhin Zeilen.
        single = adp.query_call(1, "SELECT probe_id FROM public.__t006335_ro_probe")

        # [T012414] Nicht herstellbare Verbindung gehoert zum skip.
        for marker in ("ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "Connection terminated", "SASL"):
            if marker in single:
                pytest.skip(f"keine nutzbare DB auf :15432 (Verbindung brach weg): {single}")

        assert "probe_id" in single, f"Positiv-Anker SELECT liefert kein Ergebnis: {single}"

        # Negativ-Aussage 1: data-modifying CTE -> JSON-RPC-Fehler, niemals Zeilen.
        cte = adp.query_call(2, "WITH x AS (DELETE FROM public.__t006335_ro_probe RETURNING probe_id) SELECT probe_id FROM x")
        assert "read-only" in cte, f"WITH-CTE-DELETE nicht an der Readonly-Grenze gescheitert: {cte}"
        assert "probe_id" not in cte, f"WITH-CTE-DELETE hat Zeilen geliefert statt abgelehnt zu werden: {cte}"

        # Negativ-Aussage 2: EXPLAIN ANALYZE DELETE -> JSON-RPC-Fehler, niemals Query-Plan.
        ex = adp.query_call(3, "EXPLAIN ANALYZE DELETE FROM public.__t006335_ro_probe")
        assert "read-only" in ex, f"EXPLAIN-ANALYZE-DELETE nicht an der Readonly-Grenze gescheitert: {ex}"
        assert "QUERY PLAN" not in ex, f"EXPLAIN-ANALYZE-DELETE hat einen Query-Plan geliefert: {ex}"

        # Beide Mutationen duerfen nicht ausgefuehrt worden sein.
        count = psql_tools("SELECT count(*) FROM public.__t006335_ro_probe")
        assert count == "1", f"Bypass hat die Scratch-Tabelle veraendert (Zeilen: {count})"
    finally:
        if shutil.which("psql") is not None:
            run_cmd(["psql", "-X", "-q", DB_URL_DEV, "-c", "DROP TABLE IF EXISTS public.__t006335_ro_probe"])


def test_mcp_postgres_data_modifying_cte_wird_vor_der_db_ausfuehrung_abgelehnt_auch_ohne_db(
    repo_root, adapter_factory
):
    """mcp-postgres: data-modifying CTE wird vor der DB-Ausfuehrung abgelehnt (auch ohne DB)"""
    db_port = _free_port(19791, 19800)
    if db_port is None:
        pytest.skip("kein freier DB-Port im Bereich 19791-19800")
    adp = adapter_factory(19760, 19790)
    adp.start(f"postgresql://mcp_readonly@127.0.0.1:{db_port}/website")
    cte = adp.query_call(1, "WITH x AS (DELETE FROM t RETURNING id) SELECT id FROM x")
    assert "read-only" in cte, f"data-modifying CTE wird nicht vor der DB-Ausfuehrung abgelehnt: {cte}"


def test_mcp_postgres_explain_analyze_mit_mutation_wird_vor_der_db_ausfuehrung_abgelehnt_auch_ohne_db(
    repo_root, adapter_factory
):
    """mcp-postgres: EXPLAIN ANALYZE mit Mutation wird vor der DB-Ausfuehrung abgelehnt (auch ohne DB)"""
    db_port = _free_port(19801, 19810)
    if db_port is None:
        pytest.skip("kein freier DB-Port im Bereich 19801-19810")
    adp = adapter_factory(19760, 19790)
    adp.start(f"postgresql://mcp_readonly@127.0.0.1:{db_port}/website")
    ex = adp.query_call(1, "EXPLAIN ANALYZE DELETE FROM t")
    assert "read-only" in ex, f"EXPLAIN-ANALYZE-Mutation wird nicht vor der DB-Ausfuehrung abgelehnt: {ex}"


def test_mcp_postgres_rolle_mcp_readonly_ist_als_harte_grenze_provisioniert(run_cmd, psql_tools):
    """mcp-postgres: Rolle mcp_readonly ist als harte Grenze provisioniert"""
    if not _port_open(15432):
        pytest.skip("lokale k3d-Dev-DB auf :15432 nicht erreichbar")
    if shutil.which("psql") is None:
        pytest.skip("psql nicht verfuegbar")

    role = psql_tools(
        "SELECT rolname || '|' || rolcanlogin || '|' || rolsuper || '|' || coalesce(rolconfig::text,'') "
        "|| '|' || pg_has_role('mcp_readonly','pg_read_all_data','member') FROM pg_roles WHERE rolname='mcp_readonly'"
    )
    assert re.search(r"^mcp_readonly\|(t|true)\|(f|false)\|", role), \
        f"Rolle mcp_readonly fehlt oder hat falsche Attribute: '{role}'"
    assert "default_transaction_read_only=on" in role, f"default_transaction_read_only fehlt: '{role}'"
    assert re.search(r"\|(t|true)$", role), f"pg_read_all_data-Mitgliedschaft fehlt: '{role}'"
