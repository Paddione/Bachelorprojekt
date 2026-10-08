"""Native migration of tests/spec/ticket-system/list-status-comma-list.bats."""

import os
import shutil
from pathlib import Path

import pytest

FIXTURE_LIB = "tests/lib/ticket-test-fixtures.sh"
SKIP_STUB = 'skip() { echo "$*" >&2; exit 77; }; source "$FIXLIB"; "$@"'


def _fixture_call(run_cmd, repo, test_tmp, name, *args, env=None):
    """Ruft eine Funktion aus tests/lib/ticket-test-fixtures.sh (Fixture, kein BATS-Helfer)."""
    e = {
        "FIXLIB": str(repo / FIXTURE_LIB),
        "BATS_FILE_TMPDIR": str(test_tmp),
        "BATS_TEST_NAME": os.environ.get("PYTEST_CURRENT_TEST_NAME", "manual"),
        "WORKSPACE_CTX": os.environ.get("WORKSPACE_CTX", "devmesh"),
    }
    e.update(env or {})
    return run_cmd(["bash", "-c", SKIP_STUB, "_", name, *args], cwd=repo, env=e)


@pytest.fixture(scope="module")
def fx_tmp(tmp_path_factory):
    return tmp_path_factory.mktemp("list-status-comma-list")


@pytest.fixture(scope="module", autouse=True)
def _purge_after_module(repo_root, fx_tmp):
    yield
    if shutil.which("bash"):
        import subprocess
        subprocess.run(["bash", "-c", SKIP_STUB, "_", "purge_ticket_test_data", "mentolder"],
                       cwd=str(repo_root), capture_output=True, text=True,
                       env={**os.environ, "FIXLIB": str(repo_root / FIXTURE_LIB),
                            "BATS_FILE_TMPDIR": str(fx_tmp), "TICKET_TEST_DB_OK": "1"})


@pytest.fixture
def lst(repo_root, fx_tmp, run_cmd, monkeypatch):
    monkeypatch.setenv("TICKET_TEST_BRAND", "mentolder")
    monkeypatch.setenv("TICKET_TEST_DB_OK", "1")
    ws_ctx = os.environ.get("WORKSPACE_CTX", "devmesh")
    ws_ns = os.environ.get("WORKSPACE_NS", "workspace")
    state = {"backlog": fx_tmp / "seeded_backlog", "triage": fx_tmp / "seeded_triage"}

    def skip_if_no_db():
        res = run_cmd(["kubectl", "get", "pod", "-n", ws_ns, "--context", os.environ.get("WORKSPACE_CTX", "devmesh"),
                       "-l", "app in (shared-db,shared-db-dev)", "--field-selector", "status.phase=Running",
                       "-o", "name"])
        if not res.stdout.strip():
            pytest.skip("kein erreichbarer shared-db-Pod — DB-gestuetzter Test uebersprungen")

    def seed_pair():
        if not (state["backlog"].exists() and state["backlog"].read_text().strip()):
            res = _fixture_call(run_cmd, repo_root, fx_tmp, "seed_test_feature", "mentolder")
            if res.returncode == 77:
                pytest.skip(res.output)
            state["backlog"].write_text(res.stdout)
        if not (state["triage"].exists() and state["triage"].read_text().strip()):
            res = _fixture_call(run_cmd, repo_root, fx_tmp, "seed_test_feature", "mentolder")
            if res.returncode == 77:
                pytest.skip(res.output)
            state["triage"].write_text(res.stdout)
            run_cmd(["bash", str(repo_root / "scripts" / "ticket.sh"), "update-status",
                     "--id", res.stdout.strip(), "--status", "triage"],
                    env={"BRAND": "mentolder"})

    def ids():
        return state["backlog"].read_text().strip(), state["triage"].read_text().strip()

    def list_(*args):
        return run_cmd(["bash", str(repo_root / "scripts" / "ticket.sh"), "list",
                        "--brand", "mentolder", "--include-test-data", "--limit", "500", *args],
                       env={"BRAND": "mentolder"})

    return {"skip_if_no_db": skip_if_no_db, "seed_pair": seed_pair, "ids": ids, "list": list_}


def test_t012972_positiv_anker_jede_fixture_ist_ueber_ihren_einzelnen_status_auffindbar(lst):
    lst["skip_if_no_db"]()
    lst["seed_pair"]()
    b, t = lst["ids"]()
    res = lst["list"]("--status", "backlog")
    assert res.returncode == 0, res.output
    assert sum(1 for l in res.output.splitlines() if b in l) >= 1
    res = lst["list"]("--status", "triage")
    assert res.returncode == 0, res.output
    assert sum(1 for l in res.output.splitlines() if t in l) >= 1


def test_t012972_eine_komma_liste_liefert_die_vereinigung_beider_status(lst):
    lst["skip_if_no_db"]()
    lst["seed_pair"]()
    b, t = lst["ids"]()
    res = lst["list"]("--status", "backlog,triage")
    assert res.returncode == 0, res.output
    assert sum(1 for l in res.output.splitlines() if b in l) >= 1
    assert sum(1 for l in res.output.splitlines() if t in l) >= 1


def test_t012972_leerzeichen_in_der_liste_aendern_das_ergebnis_nicht(lst):
    lst["skip_if_no_db"]()
    lst["seed_pair"]()
    b, t = lst["ids"]()
    res = lst["list"]("--status", "backlog, triage")
    assert res.returncode == 0, res.output
    assert sum(1 for l in res.output.splitlines() if b in l) >= 1
    assert sum(1 for l in res.output.splitlines() if t in l) >= 1


def test_t012972_zwei_status_flags_liefern_nicht_die_vereinigung_die_falle(lst):
    lst["skip_if_no_db"]()
    lst["seed_pair"]()
    b, t = lst["ids"]()
    res = lst["list"]("--status", "backlog", "--status", "triage")
    assert res.returncode == 0, res.output
    # Der LETZTE Wert gewinnt: die triage-Zeile ist da, die backlog-Zeile fehlt.
    assert sum(1 for l in res.output.splitlines() if t in l) >= 1
    assert sum(1 for l in res.output.splitlines() if b in l) == 0
