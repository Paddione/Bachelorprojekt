"""Native migration of tests/spec/ticket-system/get-timeline-plan-brand-column-T900243.bats."""

import os

import pytest


def test_t900243_positiv_anker_get_timeline_liefert_fuer_t900239_exit_0_und_einen_plan_archived_eintrag(repo_root, run_cmd):
    ws_ns = os.environ.get("WORKSPACE_NS", "workspace")
    ws_ctx = os.environ.get("WORKSPACE_CTX", "fleet")
    pods = run_cmd(["kubectl", "get", "pod", "-n", ws_ns, "--context", ws_ctx,
                    "-l", "app in (shared-db,shared-db-dev)", "--field-selector", "status.phase=Running",
                    "-o", "name"]).stdout.splitlines()
    if not pods:
        pytest.skip("kein erreichbarer shared-db-Pod — DB-gestuetzter Test uebersprungen")
    # TICKET_TEST_DB_OK=1: Opt-in fuer den reinen Lesepfad (get-timeline).
    res = run_cmd(["bash", str(repo_root / "scripts" / "ticket.sh"), "get-timeline", "--id", "T900239"],
                  env={"BRAND": "mentolder", "TICKET_TEST_DB_OK": "1"})
    assert res.returncode == 0, res.output
    assert "plan_archived" in res.output
