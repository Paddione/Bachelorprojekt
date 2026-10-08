"""Native migration of tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats."""

import os
import shutil

import pytest

FIXTURES = "tests/lib/ticket-test-fixtures.sh"
ROW_COUNT_SCRIPT = r"""
ctx="${WORKSPACE_CTX:-devmesh}"; ns="workspace"; pod=""
for candidate_ns in "workspace" "workspace-dev"; do
  pod=$(kubectl get pod -n "$candidate_ns" --context "$ctx" \
    -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1)
  [[ -n "$pod" ]] && { ns="$candidate_ns"; break; }
done
[[ -z "$pod" ]] && { echo "-1"; exit 1; }
kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
  psql -U postgres -d website -qtAc \
  "SELECT count(*) FROM tickets.tickets WHERE external_id = '${EXT_ID}' AND is_test_data = true;"
"""


@pytest.fixture(scope="module")
def db_state(repo_root, tmp_path_factory):
    """BATS setup_file(): opt-in env, seeded-id file, teardown_file purge."""
    tmp = tmp_path_factory.mktemp("purge_missing_table")
    return {"repo": repo_root, "seed_file": tmp / "seeded_id", "tmp": tmp}


@pytest.fixture(scope="module")
def ticket_env(db_state):
    env = {
        "TICKET_TEST_BRAND": "mentolder",
        "SEEDED_ID_FILE": str(db_state["seed_file"]),
        "BATS_FILE_TMPDIR": str(db_state["tmp"]),
        "TICKET_TEST_DB_OK": "1",
    }
    yield env


def _ctx_env(env):
    return {**env, "WORKSPACE_CTX": os.environ.get("WORKSPACE_CTX", "devmesh")}


def _skip_if_no_db(run_cmd, env):
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl nicht verfuegbar")
    r = run_cmd(["bash", "-c",
                 "kubectl get pod -n \"${WORKSPACE_NS:-workspace}\" --context \"${WORKSPACE_CTX:-devmesh}\" "
                 "-l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running "
                 "-o name 2>/dev/null | head -1"], env=_ctx_env(env))
    if not r.stdout.strip():
        pytest.skip("kein erreichbarer shared-db-Pod — DB-gestuetzter Test uebersprungen")
    r = run_cmd(["bash", "-c", f"source '{db_state_repo(env)}/{FIXTURES}'; require_ticket_table tickets"],
                env=_ctx_env(env))
    if r.returncode != 0:
        pytest.skip("tickets-Schema in der lokalen shared-db nicht vorhanden (T900537)")


def db_state_repo(env):
    return env["_repo"]


def _row_count(run_cmd, env, ext_id):
    r = run_cmd(["bash", "-c", ROW_COUNT_SCRIPT], env={**_ctx_env(env), "EXT_ID": ext_id})
    return r.stdout.strip()


@pytest.fixture(scope="module", autouse=True)
def _teardown_file(repo_root, db_state):
    yield
    # BATS teardown_file(): purge_ticket_test_data "mentolder" >/dev/null 2>&1 || true
    import subprocess
    subprocess.run(["bash", "-c", f"source '{repo_root}/{FIXTURES}' >/dev/null 2>&1; purge_ticket_test_data mentolder"],
                   capture_output=True, env={**os.environ, "TICKET_TEST_BRAND": "mentolder",
                                             "SEEDED_ID_FILE": str(db_state["seed_file"]),
                                             "BATS_FILE_TMPDIR": str(db_state["tmp"]),
                                             "TICKET_TEST_DB_OK": "1"}, cwd=str(repo_root))


def _env_with_repo(ticket_env, repo_root):
    return {**ticket_env, "_repo": str(repo_root)}


def test_t002894_gesaete_testdaten_zeile_existiert_vor_dem_purge_positiv_anker(run_cmd, db_state, ticket_env):
    env = _env_with_repo(ticket_env, db_state["repo"])
    _skip_if_no_db(run_cmd, env)
    r = run_cmd(["bash", "-c", f"source '{db_state['repo']}/{FIXTURES}'; seed_test_feature mentolder"],
                env=_ctx_env(env))
    seeded = r.stdout.strip()
    db_state["seed_file"].write_text(seeded + "\n")
    assert seeded
    assert _row_count(run_cmd, env, seeded) == "1"


def test_t002894_fn_purge_test_data_raeumt_die_zeile_ab_obwohl_questionnaire_test_status_lokal_fehlt(run_cmd, db_state, ticket_env):
    env = _env_with_repo(ticket_env, db_state["repo"])
    _skip_if_no_db(run_cmd, env)
    assert db_state["seed_file"].is_file() and db_state["seed_file"].stat().st_size > 0
    seeded = db_state["seed_file"].read_text().strip()
    assert _row_count(run_cmd, env, seeded) == "1"

    r = run_cmd(["bash", "-c", f"source '{db_state['repo']}/{FIXTURES}'; purge_ticket_test_data mentolder"],
                env=_ctx_env(env))
    assert r.returncode == 0
    assert _row_count(run_cmd, env, seeded) == "0"
