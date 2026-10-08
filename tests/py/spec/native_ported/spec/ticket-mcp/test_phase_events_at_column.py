"""Native migration of tests/spec/ticket-mcp/phase-events-at-column.bats."""

import json
import os
import subprocess

import pytest

LIB = "tests/lib/ticket-test-fixtures.sh"
SKIP_PRELUDE = 'skip() { echo "SKIP: $*" >&2; exit 77; }'
DB_ENV = {"BRAND": "mentolder", "TICKET_TEST_DB_OK": "1"}
POD_CMD = (
    'kubectl get pod -n "${WORKSPACE_NS:-workspace}" --context "${WORKSPACE_CTX:-devmesh}" '
    "-l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running "
    "-o name 2>/dev/null | head -1"
)
_SEEDED = {}


def _lib_call(run_cmd, repo_root, call):
    script = f'{SKIP_PRELUDE}\nsource "{repo_root / LIB}"\n{call}'
    return run_cmd(["bash", "-c", script], cwd=repo_root, env=DB_ENV)


def _skip_if_no_db(run_cmd, repo_root):
    pod = run_cmd(["bash", "-c", POD_CMD], cwd=repo_root, env=DB_ENV).stdout.strip()
    if not pod:
        pytest.skip("kein erreichbarer shared-db-Pod - DB-gestuetzter Test uebersprungen")
    return pod


def _skip_if_no_phase_events(run_cmd, repo_root):
    _skip_if_no_db(run_cmd, repo_root)
    result = _lib_call(run_cmd, repo_root, "require_ticket_table factory_phase_events")
    if result.returncode == 77:
        pytest.skip(result.output.strip() or "tickets.factory_phase_events fehlt")
    assert result.returncode == 0, result.output


def _seed_once(run_cmd, repo_root):
    if "ext_id" not in _SEEDED:
        result = _lib_call(run_cmd, repo_root, 'seed_test_feature "mentolder"')
        if result.returncode == 77:
            pytest.skip(result.output.strip())
        assert result.returncode == 0, result.output
        _SEEDED["ext_id"] = result.stdout.strip()
    return _SEEDED["ext_id"]


@pytest.fixture(scope="module", autouse=True)
def _purge_after_module(repo_root):
    yield
    script = f'{SKIP_PRELUDE}\nsource "{repo_root / LIB}"\npurge_ticket_test_data "mentolder" >/dev/null 2>&1 || true'
    subprocess.run(
        ["bash", "-c", script], cwd=str(repo_root), capture_output=True, text=True,
        env={**os.environ, **DB_ENV}, timeout=300,
    )


def test_t003804_tickets_factory_phase_events_traegt_die_zeit_spalte_at_introspection_wissen(
    run_cmd, repo_root
):
    _skip_if_no_phase_events(run_cmd, repo_root)
    pod = run_cmd(["bash", "-c", POD_CMD], cwd=repo_root, env=DB_ENV).stdout.strip()
    namespace = os.environ.get("WORKSPACE_NS", "workspace")
    context = os.environ.get("WORKSPACE_CTX", "devmesh")
    sql = (
        "SELECT column_name FROM information_schema.columns WHERE table_schema='tickets' "
        "AND table_name='fact'||'ory_phase_events' AND column_name IN ('at','created_at','occurred_at') "
        "ORDER BY column_name;"
    )
    result = run_cmd(
        [
            "kubectl", "exec", "-i", pod, "-n", namespace, "--context", context,
            "-c", "postgres", "--", "psql", "-U", "website", "-d", "website",
            "-qtA", "-v", "ON_ERROR_STOP=1", "-c", sql,
        ],
        cwd=repo_root,
        env=DB_ENV,
    )
    assert result.returncode == 0, result.output
    assert result.output == "at"


def test_t003804_timeline_liest_das_phasen_event_mit_befuellter_ts_spalte(run_cmd, repo_root):
    _skip_if_no_phase_events(run_cmd, repo_root)
    ext_id = _seed_once(run_cmd, repo_root)

    result = run_cmd(
        ["bash", "scripts/ticket.sh", "phase", ext_id, "implement", "entered", "--driver", "devflow"],
        cwd=repo_root, env=DB_ENV,
    )
    assert result.returncode == 0, result.output

    result = run_cmd(
        ["bash", "scripts/ticket.sh", "get-timeline", "--id", ext_id, "--brand", "mentolder"],
        cwd=repo_root, env=DB_ENV,
    )
    assert result.returncode == 0, result.output
    assert "phase_event" in result.output

    data = json.loads(result.output)
    assert data.get("ticket", {}).get("external_id"), "Ticket-Lookup fand die Fixture nicht"
    phase_events = [r for r in data["events"] if r.get("source") == "phase_event"]
    assert phase_events, "kein phase_event in der Timeline"
    assert phase_events[0].get("ts"), "phase_event ohne ts (at-Spalte nicht gelesen?)"
    assert phase_events[0]["detail"].get("state") == "entered"
