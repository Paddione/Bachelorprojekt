"""Native migration of tests/spec/ticket-system/list-test-data-filter.bats."""

import json
import os

import pytest

FIXTURE_LIB = "tests/lib/ticket-test-fixtures.sh"
SKIP_STUB = 'skip() { echo "$*" >&2; exit 77; }; source "$FIXLIB"; "$@"'


def _fixture_call(run_cmd, repo, tmp, name, *args):
    env = {
        "FIXLIB": str(repo / FIXTURE_LIB),
        "BATS_FILE_TMPDIR": str(tmp),
        "BATS_TEST_NAME": os.environ.get("PYTEST_CURRENT_TEST_NAME", "manual").split(" ")[0].split("::")[-1],
        "TICKET_TEST_DB_OK": "1",
    }
    return run_cmd(["bash", "-c", SKIP_STUB, "_", name, *args], cwd=repo, env=env)


@pytest.fixture(scope="module")
def ltd_tmp(tmp_path_factory):
    return tmp_path_factory.mktemp("list-test-data-filter")


@pytest.fixture(scope="module", autouse=True)
def _purge_after_module(repo_root, ltd_tmp):
    yield
    import subprocess
    subprocess.run(["bash", "-c", SKIP_STUB, "_", "purge_ticket_test_data", "mentolder"],
                   cwd=str(repo_root), capture_output=True, text=True,
                   env={**os.environ, "FIXLIB": str(repo_root / FIXTURE_LIB),
                        "BATS_FILE_TMPDIR": str(ltd_tmp), "TICKET_TEST_DB_OK": "1"})


@pytest.fixture
def ltd(repo_root, ltd_tmp, run_cmd, monkeypatch):
    monkeypatch.setenv("TICKET_TEST_BRAND", "mentolder")
    monkeypatch.setenv("TICKET_TEST_DB_OK", "1")
    monkeypatch.setenv("WORKSPACE_CTX", os.environ.get("WORKSPACE_CTX", "devmesh"))
    ws_ns = os.environ.get("WORKSPACE_NS", "workspace")
    ws_ctx = os.environ.get("WORKSPACE_CTX", "devmesh")
    seed_file = ltd_tmp / "seeded_id"

    def skip_if_no_db():
        res = run_cmd(["kubectl", "get", "pod", "-n", ws_ns, "--context", ws_ctx,
                       "-l", "app in (shared-db,shared-db-dev)", "--field-selector", "status.phase=Running",
                       "-o", "name"])
        if not res.stdout.strip():
            pytest.skip("kein erreichbarer shared-db-Pod — DB-gestuetzter Test uebersprungen")
        res = _fixture_call(run_cmd, repo_root, ltd_tmp, "require_ticket_table", "tickets")
        if res.returncode == 77:
            pytest.skip(res.output)

    def seed_once():
        if not (seed_file.exists() and seed_file.read_text().strip()):
            res = _fixture_call(run_cmd, repo_root, ltd_tmp, "seed_test_feature", "mentolder")
            if res.returncode == 77:
                pytest.skip(res.output)
            seed_file.write_text(res.stdout)
        return seed_file.read_text().strip()

    def list_(*args):
        return run_cmd(["bash", str(repo_root / "scripts" / "ticket.sh"), "list", *args])

    return {"skip": skip_if_no_db, "seed": seed_once, "list": list_}


def _count_with_external_id(output, ext_id):
    data = json.loads(output)
    assert isinstance(data, list)
    return sum(1 for row in data if row.get("external_id") == ext_id)


def test_t002781_include_test_data_macht_eine_is_test_data_zeile_sichtbar_positiv_anker(ltd):
    ltd["skip"]()
    seeded = ltd["seed"]()
    assert seeded
    res = ltd["list"]("--status", "backlog", "--limit", "200", "--include-test-data")
    assert res.returncode == 0, res.output
    assert _count_with_external_id(res.stdout, seeded) == 1


def test_t002781_ohne_flag_verschwindet_die_is_test_data_zeile_aus_ticket_sh_list(ltd):
    ltd["skip"]()
    seeded = ltd["seed"]()
    assert seeded
    res = ltd["list"]("--status", "backlog", "--limit", "200")
    assert res.returncode == 0, res.output
    assert _count_with_external_id(res.stdout, seeded) == 0
