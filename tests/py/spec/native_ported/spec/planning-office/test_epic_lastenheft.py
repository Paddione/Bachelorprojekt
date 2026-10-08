"""Native migration of tests/spec/planning-office/epic-lastenheft.bats."""

import os
import re

import pytest

MOCK_KUBECTL_CAPTURE = """#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then echo "# kubectl $*" >> "$CAP"; cat >> "$CAP"; echo "1"; exit 0; fi
exit 0
"""

MOCK_KUBECTL_EMPTY = """#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then echo "0"; exit 0; fi
exit 0
"""


@pytest.fixture
def mock(tmp_path, repo_root, monkeypatch):
    mockdir = tmp_path / "mock"
    mockdir.mkdir()
    cap = mockdir / "captured.sql"
    kubectl = mockdir / "kubectl"
    kubectl.write_text(MOCK_KUBECTL_CAPTURE, encoding="utf-8")
    kubectl.chmod(0o755)
    monkeypatch.setenv("PATH", f"{mockdir}{os.pathsep}{os.environ.get('PATH', '')}")
    monkeypatch.setenv("CAP", str(cap))
    # The original runs under bats, where _ticket-core.sh skips the db identity probe
    # (BATS_TEST_NAME is set). This port does not fake BATS env markers; it uses the
    # documented exception mode instead, since kubectl is stubbed and no real DB exists.
    monkeypatch.setenv("TICKET_ALLOW_UNVERIFIED_DB", "1")
    return {"dir": mockdir, "cap": cap, "kubectl": kubectl, "ticket": repo_root / "scripts" / "ticket.sh"}


def test_epic_lastenheft_lastenheft_lock_on_a_project_ticket_with_1_requirement_ends_with_exit_0(
    run_cmd, mock
):
    result = run_cmd(["bash", str(mock["ticket"]), "lastenheft", "lock", "--id", "T000440"])
    assert result.returncode == 0, result.output
    text = mock["cap"].read_text(encoding="utf-8")
    assert '"lastenheft_locked":true' in text
    assert "COALESCE(readiness,'{}'::jsonb) ||" in text
    assert (
        "status    = CASE WHEN status IN ('triage','planning','plan_staged') "
        "THEN 'backlog' ELSE status END"
    ) in text


def test_epic_lastenheft_the_lock_sql_is_not_bound_to_a_ticket_type_project_covered(run_cmd, mock):
    result = run_cmd(["bash", str(mock["ticket"]), "lastenheft", "lock", "--id", "T000440"])
    assert result.returncode == 0, result.output
    text = mock["cap"].read_text(encoding="utf-8")
    # A type restriction would silently exclude type=project epics from the gate.
    restricted = [
        line for line in text.splitlines()
        if re.search(r"WHERE .*external_id.*AND.*type", line, re.IGNORECASE)
    ]
    assert not restricted, "Typ-Bindung im Lock-SQL gefunden"
    assert "WHERE external_id = :'ext_id'" in text


def test_epic_lastenheft_lastenheft_lock_without_a_requirement_ends_with_exit_0_and_names_the_empty_lastenheft(
    run_cmd, mock
):
    mock["kubectl"].write_text(MOCK_KUBECTL_EMPTY, encoding="utf-8")
    mock["kubectl"].chmod(0o755)
    result = run_cmd(["bash", str(mock["ticket"]), "lastenheft", "lock", "--id", "T000440"])
    assert result.returncode != 0, result.output
    assert "Lastenheft is empty" in result.output
