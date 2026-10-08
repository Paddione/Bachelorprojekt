"""Native migration of tests/spec/mcp-gateway/mcp-postgres-multistatement.bats."""

import json
import os
import shutil
import socket
import subprocess
import time
from pathlib import Path

import pytest

TOKEN = "test-postgres-token"


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
def adapter(repo_root, run_cmd):
    if shutil.which("node") is None:
        pytest.skip("node nicht verfuegbar")
    if shutil.which("curl") is None:
        pytest.skip("curl nicht verfuegbar")
    port = _free_port(19660, 19680)
    if port is None:
        pytest.skip("kein freier Port im Bereich 19660-19680")
    adp = Adapter(repo_root, run_cmd, port)
    yield adp
    adp.stop()


def test_mcp_postgres_multi_statement_sql_wird_mit_fehler_abgelehnt_statt_mit_leerem_array_beantwortet(adapter):
    """mcp-postgres: Multi-Statement-SQL wird mit Fehler abgelehnt statt mit leerem Array beantwortet"""
    # Externe Abhaengigkeit (T002820): lokale k3d-Dev-DB, in CI nicht vorhanden -> skip.
    if not _port_open(15432):
        pytest.skip("lokale k3d-Dev-DB auf :15432 nicht erreichbar")
    adapter.start("postgresql://postgres@localhost:15432/website")

    # Positiv-Anker zuerst: Einzel-Statement liefert weiterhin Zeilen.
    single = adapter.query_call(1, "SELECT 1 AS total_open")

    # [T012414] Nicht herstellbare Verbindung gehoert zum skip, ein echter Defekt bleibt rot.
    for marker in ("SASL", "password", "ECONNREFUSED", "does not exist", "Connection terminated"):
        if marker in single:
            pytest.skip(f"keine nutzbare DB auf :15432 (Verbindung/Authentifizierung): {single}")

    assert "total_open" in single, f"Einzel-Statement liefert kein Ergebnis: {single}"

    # Negativ-Aussage: Multi-Statement -> JSON-RPC-Fehler, niemals leeres Array.
    multi = adapter.query_call(2, "SELECT 1 AS a; SELECT 2 AS b; SELECT 3 AS c; SELECT 4 AS d")
    assert '"error"' in multi, f"Multi-Statement liefert keinen Fehler: {multi}"
    assert "[]" not in multi, f"Multi-Statement liefert leeres Array statt Fehler: {multi}"


def test_mcp_postgres_multi_statement_wird_vor_der_db_ausfuehrung_abgelehnt_auch_ohne_db(repo_root, run_cmd, adapter):
    """mcp-postgres: Multi-Statement wird vor der DB-Ausfuehrung abgelehnt (auch ohne DB)"""
    # DB absichtlich unerreichbar: freier Port aus demselben Scan.
    db_port = _free_port(19681, 19690)
    if db_port is None:
        pytest.skip("kein freier DB-Port im Bereich 19681-19690")
    adapter.start(f"postgresql://postgres@127.0.0.1:{db_port}/website")

    multi = adapter.query_call(1, "SELECT 1 AS a; SELECT 2 AS b")
    assert "single-statement" in multi, f"Multi-Statement wird nicht vor der DB-Ausfuehrung abgelehnt: {multi}"
