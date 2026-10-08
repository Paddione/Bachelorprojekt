"""Native migration of tests/spec/ticket-mcp/triage-projection.bats."""

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


def test_t003406_ticket_sh_list_liefert_die_triage_projektion_component_areas_depends_on_readiness_effort_planning_rank_desc_len_updated_at(
    run_cmd, repo_root
):
    _skip_if_no_db(run_cmd, repo_root)
    ext_id = _seed_once(run_cmd, repo_root)

    result = run_cmd(
        ["bash", "scripts/ticket.sh", "list", "--brand", "mentolder", "--limit", "200", "--include-test-data"],
        cwd=repo_root, env=DB_ENV,
    )
    assert result.returncode == 0, result.output
    # Positiv-Anker: die eigene Fixture ist in der Liste auffindbar.
    assert ext_id in result.output

    rows = json.loads(result.output)
    required = ["component", "areas", "depends_on", "readiness", "effort",
                "planning_rank", "desc_len", "updated_at"]
    missing = [field for field in required if any(field not in row for row in rows)]
    assert not missing, f"Triage-Felder fehlen in der Projektion: {missing}"
